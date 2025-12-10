"""Dataset startup script for 24agents MCP service."""

# pyright: reportGeneralTypeIssues=none
# pyright: reportMissingModuleSource=false
# pyright: reportImportCycles=false

import ast
import io
import json
import logging
import os
import traceback
import uuid
from contextlib import redirect_stderr, redirect_stdout
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Dict, Optional, Tuple, TypedDict, cast

import micropip  # type: ignore[import]

await micropip.install(["hypha-rpc", "pydantic", "pandas"])  # type: ignore[top-level-await]

from hypha_rpc import connect_to_server as hypha_connect_to_server
from hypha_rpc import login
from hypha_rpc.utils.schema import schema_function
from pydantic import Field

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)

# Environment configuration
artifact_id = os.getenv("ARTIFACT_ID", "")
service_id = os.getenv("SERVICE_ID")
dataset_name = os.getenv("DATASET_NAME", "Unnamed Dataset")
dataset_description = os.getenv("DATASET_DESCRIPTION", "No description provided.")
client_id = os.getenv("CLIENT_ID")

server_url = "https://hypha.aicell.io"
hypha_token = os.getenv("HYPHA_TOKEN") or await login({"server_url": server_url})  # type: ignore[top-level-await]

if service_id is None:
    error_msg = "SERVICE_ID environment variable is required"
    logger.error(error_msg)
    raise ValueError(error_msg)

dataset_alias = service_id.split(":")[1] if ":" in service_id else service_id

# Global server reference for logging
_hypha_server: Any = None


class Context(TypedDict):
    """User context type definition."""

    id: str
    email: str
    user: dict[str, dict[str, str]]


@dataclass
class RequestLogger:
    """Handles logging for a single request with consistent context."""

    request_id: str
    user_email: str
    method: str

    @classmethod
    def create(cls, method: str, context: Optional[Context] = None) -> "RequestLogger":
        """Create a new request logger with auto-generated ID."""
        request_id = str(uuid.uuid4())
        user_email = "Anonymous"
        if context:
            user = context.get("user")
            if isinstance(user, dict):
                email = user.get("email", "Anonymous")
                if isinstance(email, str):
                    user_email = email
        return cls(request_id=request_id, user_email=user_email, method=method)

    async def log(self, status: str, message: str, detail: object = None) -> None:
        """Send a structured log entry."""
        log_entry: dict[str, object] = {
            "id": self.request_id,
            "timestamp": datetime.now(tz=timezone.utc).isoformat(),
            "user": {"email": self.user_email},
            "method": self.method,
            "status": status,
            "message": message,
            "detail": detail,
            "dataset_id": artifact_id,
            "dataset_name": dataset_name,
        }
        # Log to local logger for kernel output
        logger.info("::REQ::%s", json.dumps(log_entry))
        # Send to Hypha if connected
        if _hypha_server is not None:
            try:
                await _hypha_server.log_event(
                    f"dataset_request_{dataset_alias}",
                    log_entry,
                )
            except Exception as e:
                logger.warning(f"Failed to log event to Hypha: {e}")

    async def processing(self, detail: object = None) -> None:
        """Log processing status."""
        await self.log("processing", "Request received", detail)

    async def executing(self) -> None:
        """Log executing status."""
        await self.log("executing", "Executing code...")

    async def completed(self, detail: object = None) -> None:
        """Log completed status."""
        await self.log("completed", "Request completed successfully", detail)

    async def error(self, message: str, detail: object = None) -> None:
        """Log error status."""
        await self.log("error", message, detail)


def parse_and_compile_code(code: str) -> Tuple[Any, bool]:
    """Parse and compile Python code.

    Returns:
        Tuple of (compiled code object, whether to capture result).

    Raises:
        SyntaxError: If the code has syntax errors.

    """
    tree = ast.parse(code, mode="exec")

    # Detect last expression for REPL-style return
    capture_result = False
    if tree.body and isinstance(tree.body[-1], ast.Expr):
        capture_result = True
        last_expr = tree.body[-1].value
        tree.body[-1] = ast.Assign(
            targets=[ast.Name(id="_ai_result", ctx=ast.Store())],
            value=last_expr,
        )
        ast.fix_missing_locations(tree)

    code_obj = compile(tree, filename="<agent-code>", mode="exec")
    return code_obj, capture_result


def execute_code(
    code_obj: Any,
    environment: Dict[str, Any],
    *,
    capture_result: bool,
) -> str:
    """Execute compiled code and capture output.

    Returns:
        Combined stdout, stderr, and result as a string.

    """
    f_stdout, f_stderr = io.StringIO(), io.StringIO()

    with redirect_stdout(f_stdout), redirect_stderr(f_stderr):
        exec(code_obj, environment)  # noqa: S102

    out = f_stdout.getvalue()
    err = f_stderr.getvalue()
    result = environment.get("_ai_result") if capture_result else None

    output_parts = []
    if out:
        output_parts.append(f"Output:\n{out}")
    if err:
        output_parts.append(f"Stderr:\n{err}")
    if result is not None:
        output_parts.append(f"Result: {result!r}")

    return "\n".join(output_parts) + "\n" if output_parts else ""


def create_run_python(environment: Dict[str, Any]) -> Any:
    """Create the run_python function with access to services."""

    @schema_function
    async def run_python(
        code: str = Field(..., description="Python source code to execute."),
        context: Optional[Context] = None,
    ) -> str:
        """Run python code with access to the dataset.

        The dataset is mounted in /data.

        Use this tool to interact with the dataset. It allows you to execute
        Python code in a Pyodide environment and return combined stdout, stderr,
        result, or error as a single string.
        """
        req_logger = RequestLogger.create("run_python", context)
        await req_logger.processing(detail=code)

        # Parse and compile
        try:
            code_obj, capture_result = parse_and_compile_code(code)
        except SyntaxError as e:
            error_msg = f"SyntaxError: {e}"
            logger.warning("Syntax error in submitted code: %s", e)
            await req_logger.error("Syntax Error")
            return error_msg

        # Execute
        await req_logger.executing()
        try:
            output = execute_code(
                code_obj,
                environment,
                capture_result=capture_result,
            )
        except Exception:
            error_msg = f"Error: {traceback.format_exc()}"
            logger.exception("Execution error")
            await req_logger.error("Execution Error")
            return error_msg

        await req_logger.completed("Output captured")
        return output

    return run_python


@schema_function
async def get_docs(context: Optional[Context] = None) -> str:
    """Get documentation for this dataset."""
    req_logger = RequestLogger.create("get_docs", context)
    await req_logger.completed("Documentation requested")

    return f"""This server allows you to interact with a dataset by running
code in the `run_python` tool.

The dataset is mounted in /data.

Here's the description of the dataset:
<START OF DATASET DESCRIPTION>
{dataset_description}
<END OF DATASET DESCRIPTION>
"""


async def register_mcp_service(environment: Dict[str, Any]) -> None:
    """Register the Python code execution service with Hypha."""
    server = await hypha_connect_to_server(
        {
            "server_url": server_url,
            "client_id": client_id,
            "token": hypha_token,
        },
    )

    global _hypha_server
    _hypha_server = server

    config: Dict[str, bool | str] = {
        "require_context": True,
        "visibility": "public"
    }

    svc = await server.register_service(
        {
            "id": dataset_alias,
            "name": f"Dataset Service: {dataset_name}",
            "dataset": {
                "name": dataset_name,
                "artifact": artifact_id,
                "description": dataset_description,
            },
            "description": (
                "Get the documentation for this dataset MCP server "
                "using the `get_docs` function. This should almost always be the "
                "first tool you call BEFORE using `run_python`"
            ),
            "is_dataset_service": True,
            "config": config,
            "run_python": create_run_python(environment),
            "get_docs": get_docs,
        },
    )

    logger.info(
        "Service '%s' registered for dataset '%s' (%s)",
        svc.id,
        dataset_name,
        dataset_alias,
    )

    await server.serve()


# Entry Point
environment = globals()
await register_mcp_service(environment)  # type: ignore[top-level-await]
