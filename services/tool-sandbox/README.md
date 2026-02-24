# tool-sandbox

Hypha service for isolated command execution with per-session workspaces.

## Security and Secrets

`HYPHA_TOKEN` must come from Kubernetes secrets and must never be hard-coded in manifests.

### Required secret

Secret name: `tool-sandbox-secrets`

Keys:
- `HYPHA_TOKEN`

Create/update secrets in both namespaces with:

```bash
cd services/tool-sandbox
./scripts/apply-tool-sandbox-secrets.sh
```

Expected `.env` variables for the script:
- `HYPHA_TOKEN` (for `hypha`)
- `DEV_HYPHA_TOKEN` (for `hypha-dev`)

## Deployment Configuration

- Local deployment template: `local_deploy.yaml`
- Helm values: `values.yaml`
- Dev overrides: `values-dev.yaml`

Notable environment behavior:
- Main Hypha client ID is auto-generated unless `CLIENT_ID` is set.
- Health service uses `POD_NAME` as `client_id`.

## Build

```bash
cd services/tool-sandbox
npm install
npm run build
```

## Tests

### Smoke test (workspace discovery + command contract)

```bash
python3 test_sandbox_connection.py
```

### Integration tests (remote service)

```bash
python3 -m unittest -v services/tool-sandbox/python-client/test_remote_sandbox_service.py
```

These tests validate:
- Service discovery (`*:tool-sandbox`)
- Health service registration format (`tool-sandbox-<pod>:health`)
- Session lifecycle (`create_session`, `run_command`, `destroy_session`)

## Known Runtime Constraint

Command execution may fail with bubblewrap namespace restrictions in hardened clusters.
The command API remains functional, but command output can include `bwrap` permission errors when user namespaces are disabled.
