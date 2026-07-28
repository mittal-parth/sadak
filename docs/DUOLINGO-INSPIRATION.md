# Duolingo inspiration for SADAK

Research notes from issue #26 — patterns worth borrowing and what we implemented.

## What Duolingo does well

| Pattern | Duolingo | SADAK equivalent |
| --- | --- | --- |
| **Bite-sized goals** | One lesson = 5–10 min | One errand = one street conversation |
| **Progress ring** | Circular completion on home screen | Errand progress ring in HUD (`ProgressRing` in `Hud.tsx`) |
| **Streak motivation** | Daily streak counter | Future: track consecutive play days via Supabase |
| **Immediate feedback** | Green/red on each answer | Speech score + mission grading in dialogue |
| **XP & rewards** | Lingots, XP, league tables | ₹ cash + XP badges (already in HUD) |
| **Map path** | Skill tree with locked nodes | District errands list + minimap blips |
| **Character / mascot** | Duo owl nudges you | NPC hosts at each task site |
| **Spaced repetition** | Review weak words | Phrasebook accordion (district phrases) |
| **Celebration** | Confetti on lesson complete | Success chime + task marker turns green |

## Implemented in this pass

1. **Circular progress ring** — Duolingo-green ring showing errands done / total, with “N left” label.
2. **Kind icons in errands list** — auto 🛺, shop 🏪, temple 🛕, bus 🚌 with colour-coded borders (mirrors Duolingo’s skill icons).
3. **GTA-style ground blips** — replaced spinning diamond cones with pulsing circles + shadows (also improves map readability, like Duolingo’s clear node markers).
4. **Minimap blip polish** — shadow + white ring on task dots for clearer goal visibility.

## Recommended next steps

- **Daily streak badge** — store `last_played_at` in `district_progress`; show 🔥 N-day streak in HUD when ≥ 2.
- **Lesson-complete toast** — Duolingo-style full-width banner when an errand completes (“Nice! +50 XP”).
- **Weak phrase review** — surface phrases the player struggled with (low speech score) at the top of the phrasebook.
- **Comfort path** — visual skill tree on the district picker: Easy → Medium → Hard unlocks (Duolingo’s locked nodes).
- **Leagues / social** — optional weekly XP leaderboard per district (needs backend).

## What not to copy

- Heavy gamification that distracts from immersion (SADAK is a world you walk, not a flashcard app).
- Punitive streak loss — Duolingo’s “streak freeze” anxiety doesn’t fit a narrative street game.
- Repetitive drill loops — conversations should stay contextual to each NPC and district.
