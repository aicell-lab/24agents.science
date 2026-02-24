import asyncio

from hypha_rpc import connect_to_server


async def main():
    server_url = "https://hypha.aicell.io"
    # User's token workspace from logs
    workspace = "ws-user-google-oauth2|104255278140940970953"
    service_id = "tool-sandbox"
    full_service_id = ""

    print(f"Connecting to {server_url}...")
    # We connect as a public anonymous user for now (or could use a token if needed)
    client = await connect_to_server({"server_url": server_url})

    # List services in the workspace to debug
    print(f"Listing services in workspace: {workspace}")
    try:
        services = await client.list_services(workspace)
        print("Available services:")
        sandbox_services = []
        for s in services:
            print(f" - {s['id']}")
            if s["id"].endswith(f":{service_id}"):
                sandbox_services.append(s["id"])

        if not sandbox_services:
            raise RuntimeError("No tool-sandbox service discovered in workspace")

        full_service_id = sandbox_services[0]
        print(f"Discovered service: {full_service_id}")
    except Exception as e:
        print(f"Could not list services: {e}")
        return

    print(f"Looking for service: {full_service_id}")
    try:
        # Try to get the service
        svc = await client.get_service(full_service_id)
        print(f"✅ Service found: {full_service_id}")
        print(f"Service info: {svc}")

        # Test create_session
        print("\nTesting create_session...")
        try:
            session_id = await svc.create_session()
            print(f"✅ Session created: {session_id}")

            # Test run_command
            print("\nTesting run_command (echo hello)...")
            res = await svc.run_command(
                session_id=session_id, cmd="echo", args=["hello from python"]
            )
            print(f"Result: {res}")

            if res.get("stdout", "").strip() == "hello from python":
                print("✅ Command execution successful")
            else:
                print("❌ Command execution returned unexpected output")

            # Clean up
            await svc.destroy_session(session_id=session_id)
            print("✅ Session destroyed.")

        except Exception as e:
            print(f"❌ Session operations failed: {e}")

    except Exception as e:
        print(f"❌ Could not connect to service {full_service_id}")
        print(f"Error details: {e}")
        print(
            "Note: The service might be starting up, crashing, or registered under a different ID."
        )
        print("Required Deployment Config:")
        print(f"  - HYPHA_WORKSPACE: {workspace}")
        print(f"  - SERVICE_ID: {service_id}")
        print("  - CLIENT_ID: sandbox-client (Recommended for stable addressing)")


if __name__ == "__main__":
    asyncio.run(main())
