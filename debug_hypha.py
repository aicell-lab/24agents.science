import asyncio
import os
import json
from hypha_rpc import connect_to_server

SERVER_URL = os.environ.get("HYPHA_SERVER_URL", "https://hypha.aicell.io")
WORKSPACE = os.environ.get("HYPHA_WORKSPACE")
TOKEN = os.environ.get("HYPHA_TOKEN")
SERVICE_ID = os.environ.get("SERVICE_ID", "24agents-sandbox-service")

async def main():
    api = await connect_to_server({
        "server_url": SERVER_URL,
        "token": TOKEN,
        "workspace": WORKSPACE
    }) 
    
    print(f"Connected to {WORKSPACE}")
    
    try:
        service_info = await api.get_service(SERVICE_ID)
        print("Service found!")
        # print details
        print(json.dumps(service_info, default=str, indent=2))
        
        print("Calling create_session...")
        session_id = await service_info.create_session(timeout=30000)
        print(f"Session created: {session_id}")
        
    except Exception as e:
        print(f"Error getting service: {e}")

if __name__ == "__main__":
    asyncio.run(main())
