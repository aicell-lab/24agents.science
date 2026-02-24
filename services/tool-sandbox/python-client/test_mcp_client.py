import asyncio
import os
import sys
from urllib.parse import quote

from dotenv import load_dotenv
from mcp.client.session import ClientSession
from mcp.client.sse import sse_client

load_dotenv(override=True)

# Ensure unbuffered output
sys.stdout.reconfigure(line_buffering=True)

# Configuration
SERVER_URL = os.environ.get("HYPHA_SERVER_URL", "https://hypha.aicell.io")
WORKSPACE = os.environ.get("HYPHA_WORKSPACE", "hypha-agents")
SERVICE_ID = os.environ.get("SERVICE_ID", "tool-sandbox")
TOKEN = os.environ.get("HYPHA_TOKEN")

if not TOKEN:
    print("Error: HYPHA_TOKEN environment variable is required.")
    sys.exit(1)

# Construct the Hypha MCP URL
# Pattern: <server>/<workspace>/mcp/<service>/mcp
# URL encode the workspace to handle characters like "|"
encoded_workspace = quote(WORKSPACE)
url = f"{SERVER_URL}/{encoded_workspace}/mcp/{SERVICE_ID}/mcp"
if not url.startswith("http"):
    url = "https://" + url

print(f"Connecting to MCP Endpoint: {url}")


async def run_test():
    headers = {
        "Authorization": f"Bearer {TOKEN}",
        "Accept": "application/json, text/event-stream",
    }

    async with sse_client(url=url, headers=headers) as streams:
        async with ClientSession(streams[0], streams[1]) as session:
            await session.initialize()

            print("\n--- Listing Tools ---")
            tools_list = await session.list_tools()
            for tool in tools_list.tools:
                print(f"- {tool.name}: {tool.description}")

            print("\n--- Create Session ---")
            # Call create_session
            # Note: The tool creation in Hypha might return pure text or structured JSON.
            # We implemented it to return session.id (string).
            result = await session.call_tool(
                "create_session", arguments={"timeout": 3600000}
            )
            if not result.content or result.isErrors:
                print("Failed to create session")
                print(result)
                return

            # Extract session ID from the text content
            session_id = result.content[0].text
            print(f"Session Created: {session_id}")

            try:
                print("\n--- Install Package (numpy) ---")
                install_res = await session.call_tool(
                    "install_pip", arguments={"session_id": session_id, "pkg": "numpy"}
                )
                print("Install Output:", install_res)

                print("\n--- Run Command (Verify numpy) ---")
                cmd_res = await session.call_tool(
                    "run_command",
                    arguments={
                        "session_id": session_id,
                        "cmd": "python",
                        "args": [
                            "-c",
                            "import numpy; print('Numpy location:', numpy.__file__)",
                        ],
                    },
                )
                # Check formatting of the result
                print("Command Output:", cmd_res.content[0].text)

            except Exception as e:
                print(f"Error during test: {e}")
            finally:
                print(f"\n--- Destroy Session {session_id} ---")
                await session.call_tool(
                    "destroy_session", arguments={"session_id": session_id}
                )
                print("Session Destroyed")


if __name__ == "__main__":
    asyncio.run(run_test())
