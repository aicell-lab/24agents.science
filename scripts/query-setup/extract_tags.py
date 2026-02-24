import json
import urllib.request

url = "https://hypha.aicell.io/24agents-science/artifacts/24agents.science/children?stage=false&order_by=manifest.score%3E"

print(f"Fetching from {url}...")
try:
    with urllib.request.urlopen(url) as response:
        data = json.loads(response.read().decode())

    tags = set()

    # Check if data is a list or dict with items
    items = data.get("items", data) if isinstance(data, dict) else data

    print(f"Found {len(items)} artifacts")

    for artifact in items:
        manifest = artifact.get("manifest", {})
        if "tags" in manifest and manifest["tags"]:
            for tag in manifest["tags"]:
                tags.add(tag)

    sorted_tags = sorted(tags)

    with open("unique_tags.txt", "w") as f:
        for tag in sorted_tags:
            f.write(f"{tag}\n")

    print(f"Successfully wrote {len(sorted_tags)} unique tags to unique_tags.txt")
    print("Tags found:", sorted_tags)

except Exception as e:
    print(f"Error: {e}")
