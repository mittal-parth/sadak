## Sarvam Hackathon — LiveKit Voice Agent

Real-time voice agent using [LiveKit](https://docs.livekit.io) and [Sarvam AI](https://docs.sarvam.ai) (STT, LLM, TTS). Supports 11 languages (10 Indian + English).

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

Registers with LiveKit Cloud and stays idle until a client joins a room. `console` does not use the `dev` worker process.

### Docs

- **[Handover, latency, and logs](docs/HANDOVER.md)** — state for the next agent; STT/LLM/TTS timing notes
- Raw console log sample: [docs/logs/console-2026-07-26-sarvam-105b.txt](docs/logs/console-2026-07-26-sarvam-105b.txt)
- [Build your first voice agent](https://docs.sarvam.ai)
- Sarvam docs index: https://docs.sarvam.ai/llms.txt
- MCP: https://docs.sarvam.ai/_mcp/server
