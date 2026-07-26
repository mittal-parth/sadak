#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ -f .env ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

python token_server.py &
TOKEN_PID=$!
python agent.py dev &
AGENT_PID=$!
cd namma-nagara && npm run dev &
VITE_PID=$!

cleanup() {
  kill "$TOKEN_PID" "$AGENT_PID" "$VITE_PID" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

wait
