# Deploy SADAK

Production is two services from this repo:

| Service | Path | Host |
| --- | --- | --- |
| Game (Next.js) | `game_engine/` | [Vercel](https://vercel.com) — set **Root Directory** to `game_engine` (see below) |
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

### GitHub → Vercel (required once)

`vercel.json` cannot set Root Directory (Vercel rejects that field). After connecting the repo:

1. Open the **sadak** project → **Settings** → **Build and Deployment**.
2. Set **Root Directory** to `game_engine` and save.
3. Leave **Install Command** / **Build Command** empty so `game_engine/vercel.json` applies (`npm ci`, `npm run build`).
4. **Redeploy** the latest `main` commit.

If Root Directory is left blank, the repo-root `vercel.json` runs install/build under `game_engine/` as a fallback, but setting Root Directory is the supported setup for Next.js.

### CLI

```bash
cd game_engine
npm ci && npm run build   # verify before first deploy
vercel link               # once, pick team/project
vercel env pull .env.local # optional, for local production preview
vercel --prod
```

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
