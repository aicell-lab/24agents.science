import asyncio
import logging
import os
import sys
import json
from pathlib import Path
from datetime import datetime

import httpx
import yaml
from dotenv import load_dotenv
from hypha_rpc import connect_to_server

load_dotenv()

logging.basicConfig(stream=sys.stdout)
logger = logging.getLogger("collection-migration")
logger.setLevel(logging.INFO)

async def init_collection():
    server = await connect_to_server({"server_url": "https://hypha.aicell.io", "workspace": os.environ.get("HYPHA_WORKSPACE"), "token": os.environ.get("HYPHA_TOKEN")})
    artifact_manager = await server.get_service("public/artifact-manager")

    # create a new collection
    try:
        collection = await artifact_manager.read("24agents-science/24agents.science")
        logger.info("Collection already exists")
        collection = await artifact_manager.edit(
            artifact_id=collection["id"],
            config={
                "permissions": {"*": "r", "@": "r+"}
            },
        )
    except Exception as e:
        logger.info(f"Collection doesn't exist, creating new one.")
        collection = await artifact_manager.create(
            alias="24agents.science",
            type="collection",
            manifest={
                "name": "Collection for tools4agents.science",
                "description": "Tools for agents in science",
            },
            config={
                "permissions": {"*": "r", "@": "r+"}
            },
        )
    print(f"Collection created: {collection}")
    
    

asyncio.run(init_collection())