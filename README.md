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
