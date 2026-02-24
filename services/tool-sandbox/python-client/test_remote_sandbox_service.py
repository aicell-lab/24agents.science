from __future__ import annotations

import os
import unittest

from hypha_rpc import connect_to_server


class RemoteSandboxServiceTests(unittest.IsolatedAsyncioTestCase):
    """Integration tests for the remote tool-sandbox Hypha service."""

    async def asyncSetUp(self) -> None:
        server_url = os.environ.get("HYPHA_SERVER_URL", "https://hypha.aicell.io")
        workspace = os.environ.get(
            "HYPHA_WORKSPACE",
            "ws-user-google-oauth2|104255278140940970953",
        )
        service_id = os.environ.get("TOOL_SANDBOX_SERVICE_ID", "tool-sandbox")

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
            self.fail(
                "No tool-sandbox service found. "
                f"Expected '*:{self.service_id}', got: {service_ids}"
            )

        self.full_service_id = sandbox_services[0]
        self.service = await self.client.get_service(self.full_service_id)

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
            self.assertIsInstance(result, dict)
            self.assertIn("stdout", result)
            self.assertIn("stderr", result)
            self.assertIn("code", result)
            self.assertIsInstance(result["code"], int)

            possible_expected = (
                result["stdout"].strip() == "hello from test"
                or "bwrap" in result["stderr"].lower()
            )
            self.assertTrue(
                possible_expected,
                msg=(
                    "Expected successful echo output or known bwrap restriction; "
                    f"got stdout={result['stdout']!r}, stderr={result['stderr']!r}"
                ),
            )
        finally:
            await self.service.destroy_session(session_id=session_id)


if __name__ == "__main__":
    unittest.main()
