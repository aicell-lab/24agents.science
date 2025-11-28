# pyright: reportGeneralTypeIssues=none
# pyright: reportMissingModuleSource=false
# pyright: reportImportCycles=false
# ruff: noqa F704

import micropip

await micropip.install("hypha-rpc", "pydantic", "openai")

import ast
import io
import os
import traceback
from contextlib import redirect_stderr, redirect_stdout
from typing import Any

from hypha_rpc import connect_to_server, login
from hypha_rpc.utils.schema import schema_function
from pydantic import Field

dataset_description = os.getenv("DATASET_DESCRIPTION")
dataset_name = os.getenv("DATASET_NAME")
client_id = os.getenv("CLIENT_ID")
dataset_id = os.getenv("DATASET_ID")
server_url = "https://hypha.aicell.io"
hypha_token = os.getenv("HYPHA_TOKEN") or await login({"server_url": server_url})

line_separator = "=" * 60 + "\n"


def create_run_python(environment: dict[str, Any]):
    @schema_function
    async def run_python(
        code: str = Field(..., description="Python source code to execute.")
    ) -> str:
        """
        The dataset is mounted in /data.

        Use this tool to interact with the dataset. It allows you to execute Python code in a Pyodide environment and return combined stdout, stderr, result, or error as a single string.
        """
        # Print the code being executed
        print("Executing code:")
        print("```python")
        print(code)
        print("```\n")

        # Parse the code to ensure it's valid Python
        try:
            tree = ast.parse(code, mode="exec")
        except SyntaxError as e:
            error_msg = f"SyntaxError: {e}"
            print(error_msg)
            print("\n" + line_separator)
            return error_msg

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

        # Execute the code and capture output
        f_stdout, f_stderr = io.StringIO(), io.StringIO()
        try:
            with redirect_stdout(f_stdout), redirect_stderr(f_stderr):
                exec(code_obj, environment)

            out = f_stdout.getvalue()
            err = f_stderr.getvalue()
            result = environment.get("_ai_result") if capture_result else None

            # Build the complete output string
            output = ""
            if out:
                output += f"Output:\n{out}\n"
            if err:
                output += f"Stderr:\n{err}\n"
            if result is not None:
                output += f"Result: {result!r}\n"

            # Print the output
            print(output)
            print(line_separator)

            return output
        except Exception as e:
            error_msg = f"Error: {type(e).__name__}\n{traceback.format_exc()}"
            print(error_msg)
            print("\n" + line_separator)
            return error_msg

    return run_python


@schema_function
def get_docs() -> str:
    """Get documentation for the privacy-preserving AI MCP server and the run_python tool."""
    return f"""This server allows you to interact with a sensitive dataset by running code in the `run_python` tool.

The dataset is mounted in /data.

Here's a user-proved description of the dataset:
<START OF DATASET DESCRIPTION>
{dataset_description}
<END OF DATASET DESCRIPTION>
"""


async def register_mcp_service(environment: dict[str, Any]):
    """
    Register the Python code execution service with Hypha.
    """

    # Register the service with Hypha
    async with connect_to_server(
        {
            "server_url": server_url,
            "client_id": client_id,
            "token": hypha_token,
        }
    ) as server:
        svc = await server.register_service(
            {
                "id": f"{dataset_id}-service",
                "name": f"Privacy Preserving AI for dataset '{dataset_name}'",
                "dataset_name": dataset_name,
                "dataset_id": dataset_id,
                "dataset_description": dataset_description,
                "description": "Get the documentation for this privacy-preserving AI MCP server using the `get_docs` function. This should almost always be the first tool you call BEFORE using `run_python`",
                "config": {"visibility": "public", "require_context": False},
                "run_python": create_run_python(environment),
                "get_docs": get_docs,
            }
        )

        print(f"Registered MCP service with ID: {svc.id}")

        await server.serve()


environment = {}
await register_mcp_service(environment)
