# Agent guide — SADAK

Notes for Cursor cloud agents and other automated testers working in this repo.

## Run the game locally

```bash
python agent.py dev                      # optional: LiveKit NPC worker (repo root)
cd game_engine && npm run dev            # http://localhost:3000
```

Copy `game_engine/.env.example` to `game_engine/.env` and set Supabase keys so auth and APIs work.

## Dev sign-in

When running `npm run dev`, the login page shows an **email + password** form (gated by `NODE_ENV === "development"` — stripped from production builds). Use it to authenticate before testing protected routes and game flows.

**Cursor cloud secrets** (you configure these; the app does not read them):

| Variable | Purpose |
| --- | --- |
| `SADAK_DEV_EMAIL` | Dev test account email |
| `SADAK_DEV_PASSWORD` | Dev test account password |

**Agent workflow:**

1. Ensure the dev server is running (`cd game_engine && npm run dev`).
2. Read `SADAK_DEV_EMAIL` and `SADAK_DEV_PASSWORD` from the environment.
3. Navigate to `/login`.
4. Fill the **Development only** email + password form and submit.
5. You land on `/` with a session and can use the game.

These vars are for agent use only — never add them to production Vercel env or wire them into app code.

**One-time human setup** (dev Supabase project):

- Enable email + password under Authentication → Providers → Email.
- Create the test user (matching the secrets above) in the Supabase dashboard.
