#!/usr/bin/env bash
# Deploy the SADAK voice worker to LiveKit Cloud. Run from repo root.
# Requires: lk CLI, lk cloud auth (once), .env with SARVAM_API_KEY and LiveKit keys.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ ! -f Dockerfile ]]; then
  lk agent dockerfile --overwrite -y
fi

if [[ -f livekit.toml ]]; then
  echo "livekit.toml found — deploying existing agent..."
  lk agent deploy -y --secrets-file .env --ignore-empty-secrets
else
  echo "Creating new LiveKit Cloud agent..."
  lk agent create -y --region ap-south --secrets-file .env --ignore-empty-secrets
fi

echo "Tail logs: lk agent logs"
