# Handover — LiveKit + Sarvam voice agent

Use this doc when picking up the project in Cursor Cloud (or locally). It captures **current state**, **how to run**, **log interpretation**, **latency measurements**, and **known issues to fix**.

## Repo layout

| Path | Purpose |
|------|---------|
| `agent.py` | Voice agent entrypoint (STT / LLM / TTS + `AgentSession`) |
| `requirements.txt` | `livekit-agents[sarvam,silero]`, `python-dotenv` |
| `.env.example` | LiveKit + Sarvam key template (copy to `.env`, never commit `.env`) |
| `README.md` | Setup and run commands |

## Current stack (as committed)

- **livekit-agents** 1.6.7 (console + dev tested on Python 3.14.6 Homebrew)
- **STT:** Saaras v3, `language="unknown"`, `mode="transcribe"`, `flush_signal=True`
- **LLM:** `sarvam-105b` (user switched from `sarvam-30b` for latency experiments)
- **TTS:** Bulbul v3, `target_language_code="hi-IN"`, speaker `simran` (aligned with Hindi/Indian-language replies)
- **Session:** `turn_handling` with STT turn detection and `endpointing.min_delay=0.07` (replaces deprecated `turn_detection` / `min_endpointing_delay` kwargs)

## Environment gotcha (fixed once, easy to regress)

- System `python3` was **3.14.6** (`/opt/homebrew/bin/python3`).
- An old `.venv` was built with **Xcode Python 3.9** → `ImportError: TypeAlias`.
- **Fix:** `rm -rf .venv && python3 -m venv .venv` then `pip install -r requirements.txt`. After `activate`, `python --version` must be 3.10+.

## How to run

```bash
cd sarvam-hackathon
source .venv/bin/activate
cp .env.example .env   # if needed; fill keys
```

**Local voice test (no separate dev required):**

```bash
python agent.py console
```

- Output is **audio on speakers/headphones**, not a chat UI.
- Logs at DEBUG show **user** transcripts; **assistant** text appears in `conversation_item_added` (sometimes after TTS starts due to streaming).

**Cloud worker (for real LiveKit rooms / frontend):**

```bash
python agent.py dev
```

Registers worker with LiveKit Cloud (e.g. `wss://….livekit.cloud`, region India South). Idle until a client joins a room. `console` uses a **mock job** and does not use the `dev` worker process.

Hot-reload: `python agent.py dev` no longer auto-reloads; LiveKit recommends `lk agent dev`.

## Pipeline

```
Mic → LiveKit Console I/O → Saaras STT → Sarvam LLM → Bulbul TTS → speakers
```

`on_enter()` calls `generate_reply()` so the agent may speak first when the session starts.

## Latency — how to read logs

Measure **user turn committed** → **Starting TTS WebSocket session** = time until the agent starts speaking (LLM + turn queue).  
Measure **TTS start** → **Generation complete** = synthesis time.

STT speed: `transcript_delay` on `received user transcript` (often **0.05–0.9 s**).

### Run A — `sarvam-30b` (2026-07-26 ~13:35, noisy / multi-turn)

| Event | Time | Notes |
|-------|------|--------|
| User "Hello" committed | 13:35:46.749 | |
| TTS starts | 13:36:06.503 | **~20 s** after first turn |
| TTS complete | 13:36:08.081 | ~1.6 s synth |
| Assistant (Marathi) logged | 13:36:10.084 | Streaming ordering |

Second user utterance before reply; `resumed false interrupted speech`.

### Run B — `sarvam-105b` (2026-07-26 ~13:39–13:42, session below)

**Turn 1 — clean Hindi greeting**

| Metric | Value |
|--------|--------|
| Turn committed | 13:39:38.821 |
| TTS starts | 13:39:40.139 → **~1.3 s** |
| TTS complete | 13:39:42.743 → **~2.6 s** synth |
| **Rough time to hear reply** | **~4 s** after turn commit |

**Later turns (overlap / noise / extra speech)**

| Turn (STT summary) | Turn committed → TTS start | TTS synth |
|----------------------|------------------------------|-----------|
| "And I have subscribed to my channel." (likely TV/echo) | ~8.0 s | ~2.7 s |
| "क्या आपको मेरे बारे में पता है?" | ~7.8 s | ~5.8 s |
| "मेरी आवाज़ आ रही है कि नहीं?" | ~7.0 s | ~5.2 s |
| Dosa / Bangalore follow-up | ~5.3 s | ~3.0 s |

**Takeaway:** 105b improved **first clean turn** (~1.3 s vs ~20 s). Noisy sessions still show **~5–8 s** before TTS due to turn queue, interruptions, and LLM on long Hindi replies—not STT.

## Log patterns (healthy vs problems)

**Healthy**

- `WebSocket connected successfully` (STT + TTS)
- `received user transcript` → `user turn committed`
- `Starting TTS WebSocket session` → `Generation complete`
- `using audio io: Console → AgentSession → … → Console`

**Problems observed (not infra failures)**

| Log / symptom | Likely cause |
|---------------|--------------|
| `stt end of speech received while vad is still in a speech segment` | Noise, overlap, echo |
| `resumed false interrupted speech` | User or mic hears agent while agent is speaking |
| `aec warmup active, disabling interruptions for 3.00s` | Echo cancellation after TTS |
| Transcripts like "subscribed to my channel", "One voice", literal `"Noise"` | Background video / room noise / speaker→mic bleed |
| Assistant: "I am text-based, I cannot hear your voice" | LLM ignores voice setup; **fix instructions** (user messages are STT transcripts) |
| Hindi/Marathi assistant text + `en-IN` TTS | Sounds wrong; set `hi-IN` + Hindi speaker for Hindi demos |
| `min_endpointing_delay, turn_detection are deprecated` | Plan migration to `TurnHandlingOptions` |
| `RuntimeWarning: coroutine 'AgentServer.aclose' was never awaited` on exit | Shutdown quirk on console exit; low priority |

## Recommended fixes (next agent)

1. **Instructions:** Explicit voice-agent prompt — user text is from STT; respond concisely; do not claim to be text-only.
2. **Audio:** Document headphones for console; optional noise gate / push-to-talk not implemented.
3. **TTS language:** Match `target_language_code` to reply language (e.g. `hi-IN` + `simran`) or force English in LLM instructions.
4. **Turn handling:** Update to LiveKit 2.0 `TurnHandlingOptions` when upgrading.
5. **Latency:** Benchmark `sarvam-30b` vs `sarvam-105b` vs smaller models on **single clean turns** only; use `conversation_item_added` assistant + TTS timestamps.
6. **Optional:** Log LLM timing if Sarvam/LiveKit plugin exposes metrics.

## Sample log excerpt (105b, turn 1 — good path)

```
13:39:38.821  user turn committed
13:39:38.829  conversation_item_added {"role": "user", "text": "क्या हाल है दोस्तों, कैसे हो रहे हो?"}
13:39:40.139  Starting TTS WebSocket session
13:39:42.743  Generation complete / WebSocket session completed successfully
13:39:45.861  conversation_item_added {"role": "assistant", "text": "…नमस्ते! मैं ठीक हूँ…"}
```

## External docs

- Sarvam: https://docs.sarvam.ai — index https://docs.sarvam.ai/llms.txt — MCP https://docs.sarvam.ai/_mcp/server
- LiveKit agents: https://docs.livekit.io

## Secrets

- LiveKit project URL appeared in dev logs as `wss://sarvam-hackathon-*.livekit.cloud` — keys only in `.env`, not in repo.
