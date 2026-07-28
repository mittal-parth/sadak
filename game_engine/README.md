<p align="center">
  <img src="app/icon.png" alt="SADAK" width="40" height="40" />
</p>

# SADAK

### Maha Chori Motor Gaadi

**Four cities. One stolen vehicle in each. Nobody speaks English.**

A third-person browser game where every NPC is a live Sarvam-powered character
who speaks, listens and replies only in an Indian language. You walk up, you
hold space, and you *talk*. The conversation is the gameplay.

Built for the Sarvam Epoch Buildathon.

---

## Why this, and not a fork

We evaluated the obvious starting points before writing any code:

| Candidate | Why we passed |
| --- | --- |
| [bliporg/blip](https://github.com/bliporg/blip) | Bazel build is non-functional by the project's own README. Non-starter. |
| [hyperfy-xyz/hyperfy](https://github.com/hyperfy-xyz/hyperfy) | GPL-3.0, self-declared alpha with churning APIs. Copyleft is wrong for a demo we may build on. |
| [a16z-infra/ai-town](https://github.com/a16z-infra/ai-town) | Excellent agent sim, but 2D top-down PixiJS and a hard Convex dependency. Getting to third-person means fighting it the whole way. |
| [playcanvas/engine](https://github.com/playcanvas/engine) | Good MIT engine, but its real value is the hosted editor and asset pipeline, neither of which we'd have time to fill. |

The differentiator at a *Sarvam* buildathon is the Indic voice layer, not the
renderer. So the world is a lean three.js scene we fully control, and **the
entire city is generated in code**. No models, no textures, nothing to block
on. `npm install && npm run dev` and the city is there.

## The bible

One idea, four cities: a vehicle has been stolen, and the only way to recover it
is to talk to people who don't speak your language.

Each district is a chain of witnesses, each holding one clue, ending in a
confrontation that stays locked until you have earned your way to it. The clue
journal is the spine; the missions are how you fill it. **The gates differ per
city**, so the four arcs are not the same shape.

| District | City | Language | The job | Shape |
| --- | --- | --- | --- | --- |
| **Purani Sadak** | Old Delhi | हिन्दी | Raju's auto is gone, and Friday's loan instalment isn't | 3 open, then a 3-clue confrontation |
| **Marina Nagar** | Chennai | தமிழ் | Selvi's fish tempo vanished; the catch rots by noon | 2 open, a 2-clue gate, then a 3-clue confrontation |
| **Majestic Cross** | Bengaluru | ಕನ್ನಡ | A rented delivery scooter, cash bag still under the seat | 3 open, then a 2-clue confrontation |
| **Park Gully** | Kolkata | বাংলা | A yellow Ambassador, and the photograph clipped to its visor | 2 open, a 1-clue gate, then a 3-clue confrontation |

Nobody hands anything over. Kumar mocks you for saying "tea" instead of chai.
Havaldar Singh throws you out if you hint at a bribe. Dass hardens if you accuse
him and softens if you admit he was owed. Nazrul isn't a thief at all, and the
mission only passes when you work out what he actually is.

Missions are **not** keyword-matched. Each turn the model receives the success
criterion and decides whether it has genuinely been met. A greeting can never
pass a mission: the first exchange is always rejected server-side.

### Wanted level

Every character has a line you should not cross, and the model rates how badly
you crossed it on each turn. Rudeness costs one star, a bribe or a threat costs
two. Stars burn off one every forty seconds. Reach five and you are **BUSTED**:
a night in the chowk lockup and half your cash.

Offer Havaldar Singh money and he does not take it, he books you. Fumbling the
grammar is never punished, only contempt is.

### Learning the language

Every district ships a phrasebook of six survival lines with romanisation and a
gloss. Press `P` in the world, or tap the chips inside a conversation to drop
the phrase straight into the input. You can clear a district knowing six real
sentences you did not know before.

## The pipeline

```
mic → saaras:v3 (STT) → sarvam-105b (in-character reply) → bulbul:v3 (TTS) → audio + subtitles
```

There are two ways to run that pipeline, and the game picks at the moment you
walk up to someone.

**Live (default).** Walking up to an NPC puts you in a LiveKit room with them.
The mic stays open, the character is a Python worker ([`../agent.py`](../README.md))
holding the whole conversation, and lines land as subtitles while they are being
spoken. There is no send button in the loop: you talk, they answer, you interrupt
them if you want. The worker is briefed per conversation from
`app/api/voice/token/route.ts`, which hands it the persona, the language, the
speaker and the mission rubric out of `lib/game/districts.ts`, so the bible has
exactly one copy.

Mission grading rides the same room on a data channel, scored by a **second**
model call after the NPC has spoken. Asking the live model for JSON would mean
Bulbul reading the JSON out loud.

**Push-to-talk (fallback).** No LiveKit keys, or no worker running, and the same
conversation runs turn-based over REST: hold Space, `/api/stt` transcribes,
`/api/talk` returns the line in about a second so the subtitle appears
immediately, and `/api/speak` renders the audio behind it. Folding TTS into the
dialogue call made every line take five or six seconds to show up.

The fallback is automatic and it is not a dead end: if the room drops mid-scene
the conversation carries on, keeping everything said so far. The header of the
dialogue box says which one you are on.

Two things had to be right for this to work at all:

- **`reasoning_effort: null`.** Thinking mode is on by default on sarvam-105b and
  its tokens count against `max_tokens`. Left on, the model spends the whole
  budget reasoning about how to say hello and returns `finish_reason: "length"`
  with `content: null`. Turning it off took a turn from 5.9s to 0.8s.
- **`response_format: json_object`, not `json_schema`.** Under a strict schema
  this model satisfies the required keys then pads whitespace until it hits the
  token limit, leaving the JSON unterminated. `json_object` closes cleanly.
- **Script anchoring.** Models mirror the script you type in, so a player typing
  romanised Hindi got romanised Hindi back, which breaks both the voice and the
  point of the game. Instructing it to "use Devanagari" did not hold. Feeding it
  the district's own phrasebook as worked examples, and putting that rule last,
  did: all four languages now reply in native script.

## The world

- **Procedural city.** 6×6 blocks on a road grid, buildings with canvas-painted
  facades (lit windows, balconies, shopfront awnings, rooftop water tanks, dish
  antennas), pavements, streetlights, trees.
- **Per-district theming.** Sky gradient, fog, sun colour and intensity, ground,
  tarmac, building palette and traffic density all shift per city. Delhi is
  golden and dusty; Chennai is hard coastal light; Bengaluru is monsoon
  overcast; Kolkata is rain-washed dusk.
- **Autos** circulating the grid, keeping left, with suspension jitter.
- **Cows** wandering freely, routing around walls but happy to stand in traffic.
- **Landmarks per city**, so they read apart at a glance: bazaar arches over the
  avenues in Delhi, beached fishing boats in Chennai, lit hoardings on the
  junction corners in Bengaluru, trams on the avenue in Kolkata.
- **HUD.** Cash, wanted stars, mission list with locked entries, clue journal,
  and a heading-rotating minimap. Mission cards announce each job GTA-style.

## Setup

```bash
npm install
cp .env.example .env     # Sarvam + Supabase keys (see below)
npm run dev
```

Open http://localhost:3000. You will be redirected to `/login` until you sign in.

### Supabase auth (Google + magic link)

The game and Roznamcha are behind Supabase Auth. Configure a project at [supabase.com](https://supabase.com):

1. **Project URL & publishable key** → `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (`sb_publishable_…` from **Settings → API Keys**; see [Supabase API keys](https://supabase.com/docs/guides/getting-started/api-keys)). Legacy JWT `anon` keys still work via `NEXT_PUBLIC_SUPABASE_ANON_KEY` if needed.
2. **Authentication → URL configuration**: set **Site URL** to your app origin (e.g. `http://localhost:3000` or your Vercel URL). Add the same origin under **Redirect URLs**, plus `http://localhost:3000/auth/callback` and `https://your-app.vercel.app/auth/callback`.
3. **Google provider**: enable under Authentication → Providers, paste Google OAuth client ID/secret from [Google Cloud Console](https://console.cloud.google.com/apis/credentials). Authorized redirect URI in Google must be `https://<project-ref>.supabase.co/auth/v1/callback`.
4. **Magic link**: enabled by default via Email provider; customize the email template if you want links to use `/auth/confirm` with `token_hash` (implicit flow) or keep the default PKCE redirect to `/auth/callback`.

Sign-in options on `/login`: **Continue with Google** or **Email me a magic link**.

### District worlds & progress (database)

District content and per-user progress live in Supabase Postgres (not in the client bundle). After auth is configured, run these once in **SQL Editor** (in order):

1. [`supabase/migrations/001_worlds_and_progress.sql`](supabase/migrations/001_worlds_and_progress.sql) — tables + RLS
2. [`supabase/migrations/002_seed_districts.sql`](supabase/migrations/002_seed_districts.sql) — four districts

To refresh seed data after editing `lib/game/districts.ts` or `lib/game/tasks.ts`:

```bash
npm run generate:seed-districts   # rewrites 002_seed_districts.sql
```

Then re-run `002` in the SQL editor (it upserts by district id).

**Lesson NPC voice cache (optional, recommended):** run [`008_tts_storage_bucket.sql`](supabase/migrations/008_tts_storage_bucket.sql) in the SQL editor, then pre-generate static lesson TTS into Supabase Storage (local only — needs `SARVAM_API_KEY` and `SUPABASE_SECRET_KEY` (`sb_secret_…`) in `.env`, never in Vercel):

```bash
npm run warm-tts-cache
```

Re-run after lesson text or speaker changes. Players fetch public WAV URLs; `/api/speak` falls back to live Sarvam only on cache miss.

For live voice, add your LiveKit project keys to the same `.env` and run the NPC
worker from the repo root in a second terminal:

```bash
source .venv/bin/activate && python agent.py dev
```

Both processes are needed for the open-mic conversations. Skip them and the game
runs push-to-talk instead, which needs nothing but the Sarvam key.

Keys are read server-side only; the browser only ever sees a short-lived LiveKit
token for the one room it is joining. Without a key the world still loads and is
fully walkable. Only conversation returns an error.

> **Two build gotchas on this machine:**
>
> 1. Don't run `npm run build` while `npm run dev` is live. They share `.next`,
>    and the dev server's client bundle 404s afterwards.
>    `rm -rf .next` clears it.
> 2. The repo lives under `OneDrive`, which syncs `.next` while webpack is
>    writing to it. That produces corrupt bundles and phantom errors like
>    `Cannot find module './638.js'`, `SyntaxError: Unexpected token '}'`, or
>    `ENOENT: rename '0.pack.gz_'`. `next.config.mjs` keeps the dev cache in
>    memory to avoid most of it. For builds, exclude the folder from OneDrive
>    sync or move the repo out of OneDrive.

## Controls

| | |
| --- | --- |
| `W` `A` `S` `D` | Move |
| `←` `→` | Turn the camera (mouse also works, click to capture, or drag) |
| `Shift` | Run |
| `E` | Talk to a nearby NPC |
| `Space` *(held)* | Speak, release to send — push-to-talk only |
| `P` | Phrasebook for this district |
| `Esc` | Back out: conversation, then pause menu (resume or leave district) |

In a live conversation the mic is already open, so there is nothing to hold:
just talk, and use the mic button to mute yourself. On the push-to-talk
fallback, holding `Space` records only while the message box is empty; once you
start typing it is an ordinary space. Typing works in both.

## Layout

```
app/
  api/voice/token/      LiveKit token + the NPC brief the worker plays from
  api/talk/route.ts     in-character reply + mission grading (~1s)
  api/speak/route.ts    text → Bulbul audio, fetched behind the subtitle
  api/stt/route.ts      mic audio → transcript
lib/
  sarvam.ts             Sarvam client (chat / TTS / STT)
  retry.ts              backoff for transient failures
  useVoice.ts           push-to-talk recording hook
  useLiveVoice.ts       the live room: mic, subtitles, grading over LiveKit
  game/
    districts.ts        THE BIBLE: themes, personas, missions, clues, finales
    prompt.ts           the prompts both paths share, built from the bible
    city.ts             procedural city layout + colliders
    props.ts            autos, cows, buildings, stalls, characters
    engine.ts           three.js scene, controller, camera, traffic
components/
  Title.tsx             landing page, Sarvam-aligned
  Game.tsx              shell: districts, wanted level, overlays
  Hud.tsx  Dialogue.tsx
```

## Notes for the demo

- Voice degrades gracefully. If Bulbul fails, subtitles carry the scene; if the
  mic is refused, typing works. Nothing in the loop is a single point of failure
  on stage.
- Bulbul chunks long text into multiple `audios[]` segments. They must be
  concatenated, not indexed. (Learned the hard way in Kahani.)
- `bulbul:v3` and `bulbul:v2` speaker IDs are **not** interchangeable. The v3 set
  is in `lib/sarvam.ts`; unknown names fall back to a default rather than 400.
- The Indic scripts need real font coverage. Noto Sans Devanagari, Tamil,
  Kannada and Bengali are loaded explicitly rather than left to fallback.

## Provenance

Sibling to [kahani](https://github.com/harshagw/kahani), our AI game studio that
generates isometric worlds from a text premise. Kahani's Sarvam TTS client is the
basis for the one here. Kahani generates a world you watch; SADAK gives you one
world you have to *talk* your way through.
