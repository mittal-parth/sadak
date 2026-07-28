# AGENTS.md

## Cursor Cloud specific instructions

This repo is a **Sarvam buildathon monorepo** with two products sharing one Next.js app:

- **SADAK** (`game_engine/`): a three.js browser game. NPC voice runs either live (Python worker `agent.py` + LiveKit) or via a push‑to‑talk REST fallback (`/api/stt`, `/api/talk`, `/api/speak`).
- **Roznamcha** (`game_engine/roznamcha/`, route `/roznamcha`): voice day‑book. Needs its own Node WebSocket relay (`server/relay.mjs`, port `8787`). Persists to a local JSON file — no DB.
- **Python voice worker** (`agent.py`, repo root): optional; only needed for live open‑mic voice.

Standard install/run/build/lint commands live in `README.md` and `game_engine/README.md`; per‑service scripts are in `game_engine/package.json`. Prefer those over duplicating here.

### Auth gate (most important gotcha)

The **entire Next app is behind Supabase auth** via `game_engine/middleware.ts`. `lib/supabase/env.ts` **throws** if `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` are missing, so with no Supabase config **every route (even `/login` server render) 500s**. You cannot reach the game without a working Supabase project + these env vars in `game_engine/.env`.

For local dev in this VM we run a **local Supabase stack** (Docker) instead of a cloud project, and sign in via **magic link** (no real email needed — Mailpit catches it). This is already installed in the VM snapshot (Docker, `supabase` CLI, project at `/home/ubuntu/supabase-local`, and `game_engine/.env` pointing at it). To bring services up in a fresh session:

1. Start Docker daemon (not auto‑started): `sudo dockerd > /tmp/dockerd.log 2>&1 &` (needs `/etc/docker/daemon.json` with `fuse-overlayfs` + `containerd-snapshotter:false`, and iptables‑legacy — already configured).
2. Start Supabase: `cd /home/ubuntu/supabase-local && sudo env "PATH=$PATH" supabase start`. Note the **Publishable key** it prints; if it differs from `game_engine/.env`, update `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` there. URL is `http://127.0.0.1:54321`.
3. Start the app: `cd game_engine && npm run dev` (http://127.0.0.1:3000). Use the `127.0.0.1` origin (Supabase redirect allow‑list is set for `127.0.0.1:3000` / `localhost:3000` in `supabase/config.toml`).

### Magic-link login (how to get past auth without a real inbox)

1. On `/login`, enter any email, click **Email me a magic link**.
2. Fetch the link from Mailpit: `curl -s http://127.0.0.1:54324/api/v1/messages` → take newest `ID` → `curl -s http://127.0.0.1:54324/api/v1/message/<ID>` and pull the `http://127.0.0.1:54321/auth/v1/verify?...` URL.
3. Open that URL **in the same browser** (PKCE verifier cookie must be present). It redirects through `/auth/callback` and lands on the signed‑in "Sadak Errands" title screen. Tokens are one‑time.

Without a `SARVAM_API_KEY` the world still loads and is fully walkable (WASD / arrow keys); only NPC **conversation** returns an error. Live voice additionally needs LiveKit keys + `python agent.py dev`.

### Notes / caveats

- `npm run lint` (`next lint`) is **interactive on first run** (no ESLint config is committed) and cannot run non‑interactively as‑is. There are no automated unit tests configured for either the Next app or Python.
- Type‑checking is via `npm run build` (tsconfig is `strict`, `noEmit`); there is no standalone `tsc` script.
- Don't run `npm run build` while `npm run dev` is live — they share `.next`; `rm -rf .next` to recover.
- Stale artifacts to ignore: `scripts/dev.sh` (references a removed `namma-nagara/` dir) and `token_server.py` (superseded by `app/api/voice/token/route.ts`). The Roznamcha voice **harness** (`roznamcha/lib/voice/harness.mjs`) has a hard‑coded Windows temp path and crashes on Linux.
- Port `8787` is used by **both** the Roznamcha relay and the legacy `token_server.py` — don't run both.
