# ROZNAMCHA — build contract

**Read this before touching any file.** It is the shared interface between three
parallel workstreams. Do not change any type or route named here without saying
so explicitly in your report.

## Product lock

| Decision | Locked answer |
| --- | --- |
| One-sentence product | A voice-first day-book that lets a frontline health worker log a household visit by speaking Hindi or Kannada, and files a corrected, governed visit record. |
| User | ASHA / frontline health worker doing household visits, on a phone, outdoors, hands busy. |
| Job completed | Capture a household visit and file a correct visit record with a follow-up date. |
| Hard input | Natural Hindi/Kannada with code-switched English terms, spoken numbers, names, background noise, and mid-sentence self-corrections. |
| Final output | A filed visit record with a reference ID, a scheduled follow-up, and a shareable summary. |
| Sarvam parameter | **Voice Experience** (the only scored one). |
| Creativity thesis | The record is corrected by **interrupting the readback**. The agent reads the record back; the worker barges in to fix a field; every correction is stored with provenance. |
| Memory thesis | Households and members persist. A returning household is recognised, known facts are pre-filled, and corrections carry forward across sessions. |
| Delight thesis | It never makes you start over. On a correction it re-asks exactly one targeted question, never the whole form. |
| Non-goals | No diagnosis or clinical advice. No telephony. No auth or multi-tenant. No offline sync. |

**Safety rail:** this product records what the worker says. It must never
generate medical advice, diagnosis, dosage recommendations, or triage. If asked,
it declines and logs the question for the supervising PHC.

## Architecture

```
browser  ──ws──►  relay (node, :8787)  ──wss──►  api.sarvam.ai
   │                  holds SARVAM_API_KEY
   │
   └──http──►  Next routes (/api/roz/*)  ──►  extraction + store
```

The relay exists because the browser must never hold the API key and Next's App
Router cannot host a WebSocket server.

## Ports

- Next dev: `3000`
- Voice relay: `8787`

## Shared types

All three workstreams import from `roznamcha/lib/types.ts`. It already exists.
Do not redefine these locally.

## Workstream boundaries

| Stream | Owns these paths | Must NOT touch |
| --- | --- | --- |
| A — relay | `roznamcha/server/**` | anything else |
| B — browser voice | `roznamcha/lib/voice/**` | server, store, UI |
| C — record + memory | `roznamcha/lib/store/**`, `roznamcha/app/api/roz/**` | relay, voice, UI |
| integration + UI | `roznamcha/app/**` (except api), `roznamcha/components/**` | all of the above |

## Wire protocol: browser ⇄ relay

Browser → relay:

```jsonc
{ "t": "start", "language": "hi-IN", "sampleRate": 16000 }   // open Sarvam STT
{ "t": "audio", "b64": "<base64 pcm_s16le mono 16k frame>" }
{ "t": "stop" }
{ "t": "say", "text": "...", "speaker": "anushka", "language": "hi-IN" }
{ "t": "shutup" }                                            // barge-in: kill TTS now
```

Relay → browser:

```jsonc
{ "t": "ready" }
{ "t": "speech_start" }                    // from Sarvam vad_signals
{ "t": "speech_end" }
{ "t": "partial", "text": "..." }          // if the model emits interim text
{ "t": "final", "text": "..." }
{ "t": "tts_chunk", "b64": "...", "codec": "linear16", "sampleRate": 22050 }
{ "t": "tts_done" }
{ "t": "error", "message": "..." }
```

## Barge-in rule (this is the scored behaviour, get it exactly right)

1. TTS is playing.
2. Relay forwards `speech_start`.
3. Browser **immediately** stops playback, drops every queued chunk, and sends
   `shutup`.
4. Relay closes the Sarvam TTS socket (there is no server-side cancel message).
5. The worker's interrupting speech is transcribed as normal and treated as a
   correction to the field currently being read back.

Latency target: playback must stop within **200 ms** of `speech_start`.

## Definition of done per stream

- **A**: `node roznamcha/server/relay.mjs` runs, a scripted client gets
  `speech_start` / `final` from real audio and `tts_chunk` back. Logs every
  Sarvam frame type it sees.
- **B**: a hook exposes `{state, transcript, startTurn, stopTurn, speak, onBargeIn}`
  and provably halts audio within 200 ms of `speech_start`.
- **C**: extraction turns a messy Hindi utterance into a `VisitRecord`, applies a
  correction with provenance, and persists across process restart.
