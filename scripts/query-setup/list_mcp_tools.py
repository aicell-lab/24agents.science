import asyncio

from hypha_rpc import connect_to_server


async def main():
    print("Connecting to Hypha server...")
    try:
        # Connect to the Hypha server
        server = await connect_to_server({"server_url": "https://hypha.aicell.io"})

        # Service ID provided by the user
        service_id = "ws-user-anonymouz-clever-marble-33934211/query-service"
        print(f"Getting service {service_id}...")

        # Get the service proxy
        svc = await server.get_service(service_id)

        print("Calling search_items...")
        # The searchItems function in Query.tsx takes a 'params' object with a 'query' property.
        # We pass an empty query to retrieve all items.
        items = await svc.search_items({"query": ""})

        output_file = "available_tools.txt"
        print(f"Writing {len(items)} tools to {output_file}...")

        with open(output_file, "w", encoding="utf-8") as f:
            for item in items:
                # Extract relevant details from the artifact manifest
                manifest = item.get("manifest", {})

                # Fallbacks for name and id
                name = manifest.get("name") or item.get("id", "Unknown ID")
                description = manifest.get("description", "No description available.")

                # Also capture tags if useful
                tags = manifest.get("tags", [])

                f.write(f"Name: {name}\n")
                f.write(f"ID: {item.get('id', 'N/A')}\n")
                f.write(f"Description: {description}\n")
                if tags:
                    f.write(f"Tags: {', '.join(tags)}\n")
                f.write("-" * 50 + "\n")

        print("Done.")

    except Exception as e:
        print(f"Error occurred: {e}")
        import traceback

        traceback.print_exc()


if __name__ == "__main__":
    asyncio.run(main())
