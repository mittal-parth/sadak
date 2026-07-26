#!/usr/bin/env bash
# Deploy game_engine to Vercel. Run after: vercel login (once).
# Set env vars in Vercel dashboard or: vercel env add SARVAM_API_KEY etc.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT/game_engine"

npm ci
npm run build
vercel --prod --yes

echo "Add Production env in Vercel if not set: SARVAM_API_KEY, LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET"
