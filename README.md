# 24agents.science

Tooling and services for Hypha-powered scientific agents.

## Tool Sandbox Service

The remote command execution service lives in
`services/tool-sandbox`.

- Service runtime: `services/tool-sandbox/src/index.ts`
- Local deployment template:
	`services/tool-sandbox/local_deploy.yaml`
- Secret apply helper:
	`services/tool-sandbox/scripts/apply-tool-sandbox-secrets.sh`
- Helm values:
	`services/tool-sandbox/values.yaml`
	and `services/tool-sandbox/values-dev.yaml`
- Python smoke test: `test_sandbox_connection.py`
- Python integration tests:
	`services/tool-sandbox/python-client/test_remote_sandbox_service.py`

See `services/tool-sandbox/README.md` for deployment and test details.

## Query Setup Utilities

Reusable query-discovery helpers are in `scripts/query-setup`:

- `list_mcp_tools.py` for enumerating searchable MCP tools
- `extract_tags.py` for extracting unique artifact tags
- `unique_tags.txt` as a generated tag snapshot

`src/components/Query.test.tsx` provides a high-level integration test
for `Query` service registration and compose flow.

## Live Testing

Use these commands for fully real, no-mock checks against live Hypha services.

### Query service (real search + real compose)

```bash
pnpm run test:live
```

This runs `src/components/Query.live.test.ts` and verifies:
- `search_items` returns live results
- `compose_mcp` returns a real MCP URL for a live tool

### Tool-sandbox remote execution (real command execution)

```bash
python3 -m unittest -v \
	services/tool-sandbox/python-client/test_remote_sandbox_service.py
```

Optional environment variables:
- `HYPHA_SERVER_URL` (default: `https://hypha.aicell.io`)
- `HYPHA_WORKSPACE`
- `TOOL_SANDBOX_SERVICE_ID` (default: `tool-sandbox-service`)
- `HYPHA_TOKEN` (required for private workspaces)
