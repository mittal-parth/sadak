# Deploy SADAK

Production is two services from this repo:

| Service | Path | Host |
| --- | --- | --- |
| Game (Next.js) | `game_engine/` | [Vercel](https://vercel.com) — repo root `vercel.json` sets **Root Directory** to `game_engine` (or set it manually in Project Settings) |
| Voice worker | `agent.py` | [LiveKit Cloud Agents](https://docs.livekit.io/deploy/agents/) |

## Environment variables

Set the same LiveKit project on Vercel and on the agent worker.

| Variable | Vercel | LiveKit agent |
| --- | --- | --- |
| `SARVAM_API_KEY` | Yes | Yes |
| `LIVEKIT_URL` | Yes | Usually injected by LiveKit Cloud |
| `LIVEKIT_API_KEY` | Yes | Usually injected by LiveKit Cloud |
| `LIVEKIT_API_SECRET` | Yes | Usually injected by LiveKit Cloud |

Optional: `SARVAM_CHAT_MODEL`, `SARVAM_TTS_MODEL`.

Never commit `.env`. Use the Vercel dashboard and `lk agent update-secrets`.

## Vercel (game)

```bash
cd game_engine
npm ci && npm run build   # verify before first deploy
vercel link               # once, pick team/project
vercel env pull .env.local # optional, for local production preview
vercel --prod
```

Import from GitHub with root directory `game_engine`, or use the CLI from `game_engine/`.

## LiveKit agent (worker)

From the **repo root** (where `agent.py` and `Dockerfile` live):

```bash
source .venv/bin/activate   # optional, for local dev only
lk cloud auth               # once
lk agent create --region ap-south --secrets-file .env   # first time
lk agent deploy             # after code changes
lk agent logs
lk agent update-secrets --secrets SARVAM_API_KEY=sk-…
```

Regenerate container files if needed:

```bash
lk agent dockerfile --overwrite
```

The container must start with `python agent.py start` (see `Dockerfile`).

## Smoke test

Production game URL: **https://playsadak.vercel.app**

1. Open the Vercel URL, enter a district, talk to an NPC (`E`).
2. Dialogue header should show **live** voice (not push-to-talk fallback).
3. Allow the microphone; subtitles and NPC audio within a few seconds.
4. In LiveKit Cloud: room `sadak-{district}-{npc}-…` and an agent participant within ~12s.

If live voice fails, the game falls back to REST push-to-talk when LiveKit keys or the worker are missing.
