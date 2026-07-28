<p align="center">
  <img src="game_engine/app/icon.png" alt="SADAK" width="36" height="36" />
</p>

## Sarvam Hackathon — LiveKit Voice Agent

Real-time voice agent using [LiveKit](https://docs.livekit.io) and [Sarvam AI](https://docs.sarvam.ai) (STT, LLM, TTS). Supports 11 languages (10 Indian + English).

`agent.py` is the voice worker for **SADAK**, the game in [`game_engine/`](game_engine/README.md). One LiveKit room is one conversation with one NPC: the game mints the token, ships the character brief in the player's participant metadata, and this worker plays that character — reading its persona, language, voice and mission rubric off the wire. Run it with no game attached (`python agent.py console`) and it falls back to a plain voice assistant, which is the fastest way to check keys and audio.

```
browser mic → LiveKit room → saaras:v3 → sarvam-105b → bulbul:v3 → browser speakers
                                  ↘ subtitles + mission grading (data channel) ↗
```

To play the game with live voice you need **both** processes running:

```bash
python agent.py dev                      # this repo: the NPC worker
cd game_engine && npm run dev            # the game, on http://localhost:3000
```

Both need the same LiveKit project (`LIVEKIT_URL` / `LIVEKIT_API_KEY` / `LIVEKIT_API_SECRET`) and a `SARVAM_API_KEY`. Without the worker, or without LiveKit keys in `game_engine/.env`, conversations fall back to the game's push-to-talk REST path on their own.

### Prerequisites

- Python **3.10+** (`livekit-agents` needs 3.10+; create the venv with the same `python3` you use day to day)
- [LiveKit Cloud](https://cloud.livekit.io) API credentials
- [Sarvam AI](https://dashboard.sarvam.ai) API key

### Setup

```bash
python3 -m venv .venv          # must be 3.10+, not Xcode’s old 3.9
source .venv/bin/activate      # Windows: .venv\Scripts\activate
python --version               # should match `python3 --version` (e.g. 3.14.x)
pip install -r requirements.txt
cp .env.example .env
# Edit .env with your keys
```

If you already have a `.venv` built with Python 3.9, delete it and recreate:

```bash
rm -rf .venv && python3 -m venv .venv && source .venv/bin/activate && pip install -r requirements.txt
```

### Run

**Local voice test (mock job, no separate worker):**

```bash
python agent.py console
```

Output is **audio on speakers/headphones**, not a chat UI. Use **headphones** for console tests so the mic does not pick up the agent’s TTS (echo, false transcripts, and `resumed false interrupted speech` in logs).

**Cloud worker (LiveKit rooms / frontend):**

```bash
python agent.py dev
```

Registers with LiveKit Cloud and stays idle until a client joins a room. `console` does not use the `dev` worker process. This is the mode the game needs: the worker has no `agent_name`, so LiveKit dispatches it into every room the game opens.

### What the game sends the worker

The player's participant metadata (minted in `game_engine/app/api/voice/token/route.ts`) carries one JSON brief:

| Field | Used for |
|---|---|
| `instructions` | The NPC's system prompt, built from the game bible |
| `greeting` | The line the NPC opens on when the player walks up |
| `voice.language`, `voice.speaker` | Bulbul target language and speaker for this character |
| `grader.system`, `grader.minUserTurns` | Mission and anger rubric, scored after every NPC line |

The worker republishes everything on the room's `sadak` data topic, which is what the browser draws:

| Packet | Meaning |
|---|---|
| `{"t":"line","role":…,"text":…}` | A committed turn, player or NPC: the subtitle |
| `{"t":"partial","text":…}` | Interim transcript of the player, still being spoken |
| `{"t":"state","state":…}` | `listening` / `thinking` / `speaking` |
| `{"t":"grade","missionComplete":…,"anger":…}` | Mission passed, and wanted-level damage |

Grading is a **separate** Sarvam call after the NPC has already spoken, so it never delays the voice, and the spoken model is never asked for JSON it would otherwise read aloud.

### Docs

- **[Handover, latency, and logs](docs/HANDOVER.md)** — state for the next agent; STT/LLM/TTS timing notes
- Raw console log sample: [docs/logs/console-2026-07-26-sarvam-105b.txt](docs/logs/console-2026-07-26-sarvam-105b.txt)
- [Build your first voice agent](https://docs.sarvam.ai)
- Sarvam docs index: https://docs.sarvam.ai/llms.txt
- MCP: https://docs.sarvam.ai/_mcp/server
