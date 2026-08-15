# IDEA_SCOPE.md

**ROZNAMCHA** — a voice-first day-book for frontline health workers.

## 0. Scope status

`SCOPING COMPLETE · BUILD IN PROGRESS`

Three workstreams are running in parallel against the contract in
`CONTRACT.md`. Nothing below is claimed as verified until it appears under
§15 Verified.

## 1. Idea lock

| Decision | Locked answer |
| --- | --- |
| One-sentence product | A voice-first day-book that lets a frontline health worker log a household visit by speaking Hindi or Kannada, and files a corrected, governed visit record. |
| User | ASHA / frontline health worker, mid-round, on a phone, outdoors, hands busy. |
| Job completed | Capture a household visit and file a correct visit record with a follow-up date. |
| Hard input | Natural Hindi/Kannada with code-switched English clinical terms, spoken numbers and dates, background noise, and mid-sentence self-corrections. |
| Final output | A filed visit record with a reference ID, a scheduled follow-up, and a shareable plain-text summary. |
| Sarvam parameter | **Voice Experience** (the single scored capability). |
| Additional capability | None. Chat completion is used for extraction, which is a supporting model call, not a second Sarvam parameter, and earns no points. |
| Exact Sarvam APIs | `wss /speech-to-text/ws` (saaras:v4, `vad_signals=true`), TTS streaming WebSocket (bulbul:v4), `POST /v1/chat/completions` (sarvam-105b). |
| Language subset | Hindi (`hi-IN`) and Kannada (`kn-IN`) for the demo. Others are configured but untested. |
| Team advantage | We have already paid the Sarvam integration tax: reasoning-mode token exhaustion, `json_object` vs `json_schema`, v2/v3 speaker incompatibility, chunked `audios[]`, and script mirroring. That is several hours we do not spend again. |
| Creativity thesis | The record is corrected **by interrupting the readback**. Correction is the interaction, not an edit form. |
| Delight thesis | It never makes you start over. A correction re-asks exactly one targeted question. |
| Demo proof | Log a visit in Hindi, interrupt the readback mid-sentence to change a number, watch the field update with its old value preserved, then file the record and show the artifact. |
| Non-goals | No diagnosis or clinical advice. No telephony. No auth. No offline sync. No Document Intelligence, no Dubbing. |

### Why this idea

The obvious voice build at this event is an assistant that answers questions.
That stops at conversation and scores badly on Job-to-be-done, which carries the
joint-highest multiplier. This one ends in a filed artifact.

## 2. User and job

### User
A frontline health worker completing household visits. Literate but slow at
typing, especially in Devanagari or Kannada script. Currently fills a paper
register and re-enters it later into an app.

### Job to be done
Turn a five-minute spoken conversation into a correct, filed visit record
without stopping to type, and without losing the correction she made halfway
through.

### Definition of completion
A `VisitRecord` with `status: "filed"`, all of `REQUIRED_TO_FILE` present, a
reference ID, and a shareable summary. Partial capture is not completion.

## 3. Product contract

### Golden path
1. Worker opens the household (memory pre-fills known members).
2. Taps once, speaks freely in Hindi about the visit.
3. Fields fill live as she talks.
4. The agent reads the record back.
5. **She interrupts mid-readback to correct a value.**
6. The agent asks one targeted question about the correction, not the whole form.
7. She confirms; the record is filed and the artifact appears.

### Inputs
Continuous 16 kHz mono PCM from the browser mic. Free-form speech, not commands.

### Outputs and state changes
A persisted `VisitRecord`, an updated `Household` with the visit linked, an
append-only `corrections[]` trail, and a plain-text summary.

### Memory boundary
**In scope:** household identity, known members, prior visit values, corrections
carried forward across sessions, and record state surviving process restart.
**Out of scope:** cross-device sync, multi-worker permissions, real PHC systems.

### Human review boundary
The worker files the record. The product never files on her behalf, and never
answers a clinical question. Clinical questions are logged for the supervising
PHC and explicitly declined.

## 4. Creativity and Delight

### Obvious version
A form that fills from dictation, with a Save button.

### Structural creative mechanic
**Correction by interruption.** The readback is not a confirmation screen, it is
the editing surface. Cutting the agent off mid-sentence is how you change a
value, exactly as you would correct a colleague reading your notes aloud. Every
correction keeps its old value, the utterance that caused it, and a timestamp.

This changes how the job is completed: there is no review-and-edit step, because
review *is* the edit.

### Delight moment
She interrupts. The audio stops instantly. The agent does not restart, does not
re-read the whole record, and asks one question about the single thing she
changed.

### Ideas deliberately rejected
- A game with AI NPCs. Strong Creativity, but no artifact and no job, so
  Job-to-be-done (2.5×) collapses.
- A multilingual chatbot. Fails the replacement test below.
- Adding Document Intelligence to "also" read the paper register. Extra Sarvam
  capabilities score nothing and would cost the voice depth that does score.

## 5. Event and sponsor dependency

### Verified capability matrix

| Capability | Verified API | Access | Limits | Safe to depend on? |
| --- | --- | --- | --- | --- |
| Streaming STT + VAD | `wss://api.sarvam.ai/speech-to-text/ws`, saaras:v4 | `api-subscription-key` header | 8k or 16k only; wav or pcm_s16le; rates must match exactly | Being proven by workstream A |
| Streaming TTS | TTS WebSocket, bulbul:v4 | same | **No server-side cancel**; idle-closes ~60s; 2500 char cap | Yes, with client-side interrupt |
| Chat extraction | `POST /v1/chat/completions`, sarvam-105b | same | `reasoning_effort` must be `null`; use `json_object` | Yes, proven in this repo |

### Load-bearing dependency
`vad_signals=true` on the STT socket. `START_SPEECH` is the interrupt trigger.
Without it there is no barge-in, and Voice Experience is capped at L3.

### Replacement test
Swap Sarvam for a generic Western STT/TTS stack and the demo degrades on the
exact case we show: code-switched Hindi with English clinical terms and spoken
Indian numerals, in a noisy hall. That is the hard case, and it is visible in
the demo rather than asserted.

### Unsupported assumptions
- We do **not** assume speaker cloning or same-speaker output.
- We do **not** assume server-side TTS cancellation; the docs say it does not
  exist, so interruption is client-side.
- We do **not** claim sub-second end-to-end latency until measured.

## 6. Rubric strategy

### Level anchors

| Parameter | × | Target | The proof that earns it |
| --- | --- | --- | --- |
| Job-to-be-done | 2.5 | **L4** | Three repeated visits filed end to end, each producing a usable artifact without intervention. L5 needs 90%+ across ≥3 cases; we claim L4 unless the run rate supports more. |
| Memory and Context | 1.0 | **L4** | Returning household pre-fills prior values; a correction made in session 1 is still correct in session 2 after a restart. |
| Creativity | 1.5 | **L4** | Correction-by-interruption plus provenance-preserving records: two reinforcing non-obvious choices. |
| Impact | 1.5 | **L3** | Researched baseline, not an invented one. See §6a. |
| Delight | 1.0 | **L3–L4** | Recovery without restart at the real friction point, which is being wrong halfway through. |
| **Voice Experience** | 2.5 | **L4** | Three things the ladder names: barge-in without losing context; correction recovery without restarting; **pacing that varies for the moment**. Pacing is implemented and measured (§6b). Barge-in is built but unproven live. Emotional read is still absent, which is the remaining gap to a strict L4. |

### 6a. Impact baseline (researched, with sources)

| Fact | Value | Source |
| --- | --- | --- |
| ASHA average daily working time | **4.29 h** (257 min) | Time-motion study, 17 ASHAs, Wardha district, Maharashtra, Aug–Dec 2019 ([PMC10746798](https://pmc.ncbi.nlm.nih.gov/articles/PMC10746798/)) |
| Time on register maintenance | **41 min/day** | same study |
| Time on reporting | **5 min/day** | same study |
| Registers maintained | **10+**, alongside parallel digital entry into ANMOL | [Behanbox, 2024](https://behanbox.com/2024/01/16/how-asha-workers-overwhelming-workload-impacts-indias-healthcare-system/) |
| Workforce size | ~10 lakh (1 million) ASHAs | same |

**Beneficiary:** the ASHA worker. **Payer:** the state health department, which
funds ASHA incentives that are themselves tied to these records.

**Frequency:** every working day, per worker.

**Metric:** minutes per day spent on documentation. Baseline **46 min**
(41 register + 5 reporting), which is **~18% of the 4.29 h working day**.

**Claim we can defend:** capturing the visit by voice at the doorstep removes
the re-entry step, since the record is written once rather than on paper and
then again in an app. A 50% reduction returns ~23 min/day, which is **~9% of the
working day**. That sits inside L3's "5% to below 10%" band.

**Claim we will NOT make:** that we halve it. We have no user study. On the
narrower metric of documentation time alone a 50% cut would be L4 territory,
but we have not earned that number and will not present it as though we had.

### Evidence boundaries
Each proof is assigned to exactly one parameter:
- Barge-in working at all → **Voice Experience**.
- The record surviving that interruption with its history intact → **Memory**.
- Choosing interruption as the edit mechanism → **Creativity**.
- Asking one targeted question instead of re-reading → **Delight**.
The same moment is not counted twice.

### Rubric traps we must avoid
- Language coverage is not Creativity. Adding a fifth language earns nothing.
- Basic voice competence is not Delight; it belongs to the Sarvam parameter.
- Conversational flow inside one exchange is not Memory.
- API count is not scored. We use three endpoints because the product needs
  three, not to look sophisticated.

### 6b. Pacing (implemented and measured)

The Voice ladder asks at L4 for pacing that "varies for the moment: brisk for
simple tasks, calm for complaints, careful for payments". Bulbul accepts `pace`
per request, so the relay maps a semantic moment to a rate:

| Moment | Pace | Why |
| --- | --- | --- |
| `readback` | 0.82 | Numbers being verified. Slow enough to interrupt. |
| `correction` | 0.90 | Acknowledging a fix: deliberate. |
| `decline` | 0.88 | Refusing a clinical question is never brisk. |
| `question` | 1.00 | Asking for one missing field. |
| `confirm` | 1.12 | "Theek hai" does not need to be laboured. |

Measured on one identical Hindi sentence: **6.45 s at 0.82, 5.68 s at 1.00,
5.13 s at 1.12**. A 26% spread, plainly audible.

## 7. Technical plan

### Smallest architecture
```
browser ──ws──► relay :8787 ──wss──► api.sarvam.ai
   │              (holds the key)
   └──http──► Next /api/roz/* ──► extraction + JSON store
```
The relay exists only because the browser must not hold the API key and the App
Router cannot host a WebSocket server.

### Secrets and access
`SARVAM_API_KEY` lives in `.env`, is read by the relay and by server routes
only, and is never sent to the browser.

## 8. Time-boxed build ladder

| Milestone | Build | Acceptance test | If behind, cut to |
| --- | --- | --- | --- |
| **M0** Feasibility | Relay speaks to both sockets | `probe.mjs` round-trips TTS → STT | Fall back to REST STT, lose barge-in, accept Voice L3 |
| **M1** One-hour MVP | One utterance → fields fill → file a record | One Hindi utterance produces a filed artifact | Hardcode the household |
| **M2** Repeatable | Three visits end to end | 3/3 filed without intervention | Two cases, claim L3 not L4 |
| **M3** Voice depth | Barge-in under 200 ms, correction recovery | Interrupt mid-readback, field updates, no restart | Interrupt via button, not voice |
| **M4** Memory + Delight | Cross-session recall, one targeted question | Restart process, prior values persist | Show the corrections trail only |
| **M5** Hardening | 3 repeated runs, fallback recording, two rehearsals | Two clean timed runs | Recorded demo |

## 9. Test plan

### Golden cases
1. Antenatal visit, Hindi, with a corrected pregnancy month.
2. Child weight check, Kannada, with a corrected weight.
3. Follow-up on a returning household, testing recall.

### Unseen hard case
An utterance we did not author, spoken live by someone from the floor, in noisy
room conditions.

### Failure cases
Mic denied; relay down; Sarvam 5xx; empty transcript; worker asks for medical
advice (must decline and log).

## 10. Demo contract

**Setup (30s):** an ASHA worker does ~20 household visits a day and writes each
one on paper, then re-enters it later. Corrections get lost between the two.

**Proof (2 min):** speak a visit in Hindi; fields fill live; the agent reads it
back; **interrupt it mid-sentence to change a number**; the field updates with
its previous value preserved; one targeted question; file; show the artifact and
the corrections trail. Then reopen the household to show the value persisted.

**Claims we can prove:** it files a correct record from speech; it can be
interrupted; corrections are preserved with provenance; it remembers across
sessions.

**Claims we must not make:** any clinical claim; any accuracy percentage we have
not measured; that it is deployed with real ASHA workers; that Sarvam is the
only stack that could do this.

## 11. Risk register

### Pre-mortem: it is judging time and this failed. Why?
1. **The streaming socket shapes differ from the docs** and barge-in never
   worked. → Mitigation: workstream A proves both directions with `probe.mjs`
   first; REST fallback is pre-planned and costs one rubric level, not the demo.
2. **Mic and audio fail in the venue** (permissions, noise, a bad USB mic).
   → Mitigation: typed-utterance path drives the identical pipeline; fallback
   recording ready.
3. **Extraction hallucinates a value we did not say**, which is fatal for a
   health record. → Mitigation: low-confidence fields render as "unsure" and
   never auto-file; `REQUIRED_TO_FILE` is validated server-side.

## 12. Non-goals
No diagnosis. No telephony or IVR. No auth or multi-tenant. No offline sync.
No mobile app. No Document Intelligence. No Dubbing.

## 13. Parking lot
WhatsApp delivery of the summary · supervisor dashboard · more languages ·
speaker diarisation · offline queue · printable register export.

## 14. Team execution
Three parallel workstreams with hard directory boundaries, defined in
`CONTRACT.md`. Integration and UI are owned centrally.

### Coordination rules
Nobody changes a shared type without saying so. Nobody edits another stream's
directory. The wire protocol is frozen.

## 15. Current state

**Active milestone:** M2 complete, M3 partially proven.

### Implemented
Shared contract and types; WS relay on 8787; browser mic + interruptible
player + `useVoiceTurn`; JSON store with provenance and roster-governed writes;
five API routes; full UI (record, voice, memory, artifact).

### Verified (I ran these myself, not just the agents)
- `probe.mjs` round-trips Hindi through TTS then STT against the live API.
  Transcripts returned in Devanagari.
- Store self-test: 7/7 from a clean data dir, including a 62 to 65 correction
  and survival across a genuine process restart.
- **JTBD: 3/3 visits filed end to end, twice in a row (6/6).** Hindi and
  Kannada, each with a mid-visit correction.
- Correction trail with old value, new value and the causing utterance renders
  in the UI and lands in the filed artifact.
- Household memory accumulates: 9 linked visits, prior values shown on reopen.
- Barge-in stop latency **1.4 ms** in the audio harness, budget was 200 ms.

### NOT yet verified, and these are the honest gaps
1. **Barge-in has never run against real Sarvam TTS inside the app.** It is
   proven in an isolated harness against a fake relay. The relay's socket-kill
   is proven separately by a scripted client. The two halves have not been
   joined under real audio. This is the single biggest risk, because barge-in
   is the headline Voice claim.
2. **No real microphone has ever been used.** All browser testing used Chrome's
   synthetic fake device or the typed fallback, which drives the identical
   extraction pipeline but skips STT entirely.
3. The three passing cases are ones I authored. No unseen input has been tried.
4. `saaras:v4` streaming never emitted an interim transcript in testing, so the
   `partial` path is implemented but unexercised.
5. TTS completion event proved unreliable; a 2.5 s idle timer is the real
   guarantee, which adds tail latency to normal end-of-speech.

### Current blocker
None. The next step is verification, not construction.

### Next single action
Put a real microphone on it: speak one Hindi visit, interrupt the readback
mid-sentence, and confirm audio stops and the correction lands. Until that runs,
Voice Experience should be claimed at L3, not L4.

## 16. Decision log
- Chose Voice Experience over Document Intelligence: the team's proven edge is
  the voice loop, and barge-in is the clearest route to L4.
- Rejected continuing the game build: no artifact, so Job-to-be-done collapses
  at the highest multiplier.
- Chose a separate WS relay over a custom Next server: smaller blast radius and
  it can be owned by one workstream.
- Chose a JSON file store over a database: restart-durability is all the Memory
  ladder requires, and it removes a dependency.
