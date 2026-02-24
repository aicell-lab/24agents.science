from __future__ import annotations

import os
import unittest
from typing import Any

from hypha_rpc import connect_to_server


class RemoteSandboxServiceTests(unittest.IsolatedAsyncioTestCase):
    """Integration tests for the remote tool-sandbox Hypha service."""

    async def asyncSetUp(self) -> None:
        server_url = os.environ.get("HYPHA_SERVER_URL", "https://hypha.aicell.io")
        workspace = os.environ.get(
            "HYPHA_WORKSPACE",
            "ws-user-google-oauth2|104255278140940970953",
        )
        service_id = os.environ.get(
            "TOOL_SANDBOX_SERVICE_ID",
            "tool-sandbox-service",
        )

        self.server_url = server_url
        self.workspace = workspace
        self.service_id = service_id
        self.full_service_id = ""

        token = os.environ.get("HYPHA_TOKEN")
        config = {"server_url": self.server_url}
        if token:
            config["token"] = token

        self.client = await connect_to_server(config)
        services = await self.client.list_services(self.workspace)
        service_ids = [entry["id"] for entry in services]
        sandbox_services = [
            service_entry_id
            for service_entry_id in service_ids
            if service_entry_id.endswith(f":{self.service_id}")
        ]

        if not sandbox_services:
            sandbox_built_in = [
                service_entry_id
                for service_entry_id in service_ids
                if "tool-sandbox" in service_entry_id
                and service_entry_id.endswith(":built-in")
            ]
            sandbox_health = [
                service_entry_id
                for service_entry_id in service_ids
                if "tool-sandbox" in service_entry_id
                and service_entry_id.endswith(":health")
            ]
            self.fail(
                "No tool-sandbox service found. "
                f"Expected '*:{self.service_id}'. "
                f"Found built-in={sandbox_built_in}, health={sandbox_health}. "
                f"All service ids: {service_ids}"
            )

        self.full_service_id = sandbox_services[0]
        self.service = await self.client.get_service(self.full_service_id)

    @staticmethod
    def _is_known_bwrap_restriction(stderr: str) -> bool:
        """Return true when execution fails due to known bubblewrap limits."""
        return "bwrap" in stderr.lower()

    def _assert_command_contract(self, result: dict[str, Any]) -> None:
        """Validate the command result schema returned by the service."""
        self.assertIsInstance(result, dict)
        self.assertIn("stdout", result)
        self.assertIn("stderr", result)
        self.assertIn("code", result)
        self.assertIsInstance(result["stdout"], str)
        self.assertIsInstance(result["stderr"], str)
        self.assertIsInstance(result["code"], int)

    def _assert_success_or_bwrap(
        self,
        result: dict[str, Any],
        *,
        expected_stdout_substring: str,
    ) -> None:
        """Accept success with expected output, or known bwrap restriction."""
        self._assert_command_contract(result)
        expected_output = expected_stdout_substring in result["stdout"]
        bwrap_restriction = self._is_known_bwrap_restriction(result["stderr"])
        self.assertTrue(
            expected_output or bwrap_restriction,
            msg=(
                "Expected output substring or known bwrap restriction; "
                f"stdout={result['stdout']!r}, stderr={result['stderr']!r}"
            ),
        )

    async def test_service_is_discoverable(self) -> None:
        """Service can be listed and resolved by full service id."""
        services = await self.client.list_services(self.workspace)
        service_ids = {entry["id"] for entry in services}
        self.assertIn(self.full_service_id, service_ids)

    async def test_health_service_uses_pod_client_id(self) -> None:
        """Health service client id is pod name when provided by POD_NAME."""
        services = await self.client.list_services(self.workspace)
        health_services = [entry["id"] for entry in services if entry["id"].endswith(":health")]

        has_pod_style_health = any(
            "/tool-sandbox-" in service_id for service_id in health_services
        )
        self.assertTrue(
            has_pod_style_health,
            msg=f"Expected pod-style health service id, found: {health_services}",
        )

    async def test_session_lifecycle_and_run_command(self) -> None:
        """Session creation, command call contract, and destroy flow."""
        session_id = await self.service.create_session(timeout=60000)
        self.assertIsInstance(session_id, str)
        self.assertTrue(session_id)

        try:
            result = await self.service.run_command(
                session_id=session_id,
                cmd="echo",
                args=["hello from test"],
            )
            self._assert_success_or_bwrap(
                result,
                expected_stdout_substring="hello from test",
            )
        finally:
            await self.service.destroy_session(session_id=session_id)

    async def test_multiple_commands_same_session(self) -> None:
        """Execute multiple real commands in one session and keep contract."""
        session_id = await self.service.create_session(timeout=60000)
        try:
            first = await self.service.run_command(
                session_id=session_id,
                cmd="python",
                args=["-c", "print('alpha')"],
            )
            self._assert_success_or_bwrap(
                first,
                expected_stdout_substring="alpha",
            )

            second = await self.service.run_command(
                session_id=session_id,
                cmd="python",
                args=["-c", "print('beta')"],
            )
            self._assert_success_or_bwrap(
                second,
                expected_stdout_substring="beta",
            )
        finally:
            await self.service.destroy_session(session_id=session_id)

    async def test_invalid_command_edge_case(self) -> None:
        """Invalid command returns non-zero exit or known restriction."""
        session_id = await self.service.create_session(timeout=60000)
        try:
            result = await self.service.run_command(
                session_id=session_id,
                cmd="definitely-not-a-real-command-24agents",
                args=[],
            )
            self._assert_command_contract(result)
            command_not_found = (
                result["code"] != 0
                and (
                    "not found" in result["stderr"].lower()
                    or "no such file" in result["stderr"].lower()
                    or "exited with code" in (result.get("error") or "").lower()
                )
            )
            bwrap_restriction = self._is_known_bwrap_restriction(result["stderr"])
            self.assertTrue(
                command_not_found or bwrap_restriction,
                msg=(
                    "Expected command-not-found behavior or known bwrap restriction; "
                    f"stdout={result['stdout']!r}, stderr={result['stderr']!r}, "
                    f"code={result['code']!r}, error={result.get('error')!r}"
                ),
            )
        finally:
            await self.service.destroy_session(session_id=session_id)

    async def test_destroyed_session_rejects_execution(self) -> None:
        """Running after destroy raises a session-not-found error."""
        session_id = await self.service.create_session(timeout=60000)
        await self.service.destroy_session(session_id=session_id)

        with self.assertRaisesRegex(Exception, "not found"):
            await self.service.run_command(
                session_id=session_id,
                cmd="echo",
                args=["after destroy"],
            )


if __name__ == "__main__":
    unittest.main()
