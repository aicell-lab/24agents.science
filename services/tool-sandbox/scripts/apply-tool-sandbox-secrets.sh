#!/bin/bash

set -euo pipefail

if [[ ! -f .env ]]; then
  echo "Error: .env file not found in current directory"
  exit 1
fi

set -a
source .env
set +a

if [[ -z "${HYPHA_TOKEN:-}" ]]; then
  echo "Error: HYPHA_TOKEN is required in .env"
  exit 1
fi

if [[ -z "${DEV_HYPHA_TOKEN:-}" ]]; then
  echo "Error: DEV_HYPHA_TOKEN is required in .env"
  exit 1
fi

echo "Applying tool-sandbox-secrets to namespace: hypha"
kubectl create secret generic tool-sandbox-secrets \
  --from-literal=HYPHA_TOKEN="$HYPHA_TOKEN" \
  --dry-run=client -o yaml | kubectl apply --namespace=hypha -f -

echo "Applying tool-sandbox-secrets to namespace: hypha-dev"
kubectl create secret generic tool-sandbox-secrets \
  --from-literal=HYPHA_TOKEN="$DEV_HYPHA_TOKEN" \
  --dry-run=client -o yaml | kubectl apply --namespace=hypha-dev -f -

echo "Done."
