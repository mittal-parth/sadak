# PostHog Self-driving setup report

PostHog Self-driving has been configured for this project. Session replay, error tracking, and support signal sources are now armed and will route findings into the inbox. The scout troop is tuned to the project's most-used surfaces. Findings will start appearing in the [Self-driving inbox](https://eu.posthog.com/project/234346/inbox) within ~30 minutes.

---

## AI data processing

**Status:** Approved (enforced by the wizard before this run started).

---

## GitHub

**Status:** Connected during this run.

- Integration ID: 73944
- Account: marcdhi
- Connected at: 2026-07-28T12:35:07Z

Self-driving will use this to research findings against the repository and open fixes.

---

## Products enabled

| Product | Status | Notes |
|---|---|---|
| Session Replay | **Not enabled** (follow-up required) | `session_recording_opt_in: false` server-side. The `products-enable` MCP tool was unavailable. `PostHogInit.tsx` init is clean — no `disable_session_recording` override. Enable manually (see Follow-ups). |
| Error Tracking | **Not enabled** (follow-up required) | `autocapture_exceptions_opt_in` is unset server-side. Init has `capture_exceptions: true` — no client-side blocker. Enable manually (see Follow-ups). |
| Support (Conversations) | **Not enabled** (follow-up required) | `conversations_enabled: null`. `products-enable` tool unavailable. No client-side changes needed. Tickets only arrive once an inbound channel is also connected (see Follow-ups). |

> **Note:** The `posthog.init` override check was clean — no options block any product. Once each product is toggled on server-side, the client will start capturing automatically.

---

## Signal sources

| source_product | source_type | Action | Config ID |
|---|---|---|---|
| `health_checks` | `health_issue` | **Enabled** (created) | `019fa8bb-45f5-7b8e-be0d-c59261ef2522` |
| `error_tracking` | `issue_created` | **Enabled** (created) | `019fa8bb-4985-78d3-bd5c-5e17aea4ca7e` |
| `error_tracking` | `issue_reopened` | **Enabled** (created) | `019fa8bb-4eac-7f42-981a-6a2cae57223b` |
| `error_tracking` | `issue_spiking` | **Enabled** (created) | `019fa8bb-51c5-715a-825e-2a498792b596` |
| `session_replay` | `session_analysis_cluster` | **Enabled** (created, sample_rate: 0.1) | `019fa8bb-55c1-70d5-8407-72807e3e8843` |
| `conversations` | `ticket` | **Enabled** (created) | `019fa8bb-58ab-7d80-80af-f7df72d2bbc5` |
| `signals_scout` | `cross_source_issue` | **On by default** — no row needed | — |

> `signals_scout` / `cross_source_issue` is enabled by default in PostHog; creating a row would opt out, so none was created.

---

## Connected tools

The user selected **none of these** — no external issue trackers, error trackers, support desks, or other tools were connected. All connected-tool sources skipped (not used).

---

## Scout troop

**Run budget:** 24 runs/day max (early-access default) · 0 runs used today · 24 remaining.

> *Banner:* "Scouts are in early access so daily runs are limited to 24 by default for now, please reach out to team-self-driving@posthog.com if you would like more runs."

### Enabled (3 scouts)

| Scout | Reason |
|---|---|
| `signals-scout-general` | Always on — cross-product correlations and surfaces no specialist covers. Was already enabled. |
| `signals-scout-product-analytics` | Most-used surface: 11 custom game events, saved funnels (sign-in → errand completion), retention and funnel insights. Watches for conversion / retention regression in saved flows. |
| `signals-scout-observability-gaps` | New project with 11 custom events — flags event volumes with no insight, dashboard, or alert coverage so gaps surface as the product evolves. |

### Disabled (25 scouts)

| Scout | Reason |
|---|---|
| `signals-scout-error-tracking` | Covered by native error tracking source (step 4). Re-enable follow-up not warranted — native source is the right path. |
| `signals-scout-session-replay` | Covered by native session replay source (step 4). Same reasoning as above. |
| `signals-scout-ai-observability` | No `$ai_*` events or LLM SDK found in this project. Enable if AI observability is added later. |
| `signals-scout-anomaly-detection` | No dashboards with sufficient history yet (project newly set up). Enable once baseline data accumulates. |
| `signals-scout-apm` | No distributed tracing / OpenTelemetry spans in use. |
| `signals-scout-conversations` | Support/Conversations product not yet active (no inbound channel connected). Enable after connecting a channel. |
| `signals-scout-csp-violations` | No CSP reporting configured in this project. |
| `signals-scout-customer-analytics` | No group/accounts analytics (B2B). Consumer game product. |
| `signals-scout-data-pipelines` | No CDP destinations, batch exports, or hog flows configured. |
| `signals-scout-data-warehouse` | No external warehouse sources connected. |
| `signals-scout-experiments` | No active A/B experiments. Enable if experiments are launched. |
| `signals-scout-feature-flags` | No feature flags in active use found. Enable if flags are added. |
| `signals-scout-health-checks` | Native `health_checks` source (step 4) covers instrumentation health issues. Scout would duplicate. |
| `signals-scout-inbox-validation` | Fresh setup — no resolved inbox reports yet to validate. |
| `signals-scout-ingestion-warnings` | No ingestion issues observed. Enable if events start dropping. |
| `signals-scout-insight-alerts` | No configured insight alerts yet. |
| `signals-scout-logs` | PostHog logs product not in use. |
| `signals-scout-mcp-tool-calls` | No `$mcp_tool_call` telemetry in this project. |
| `signals-scout-replay-vision` | No Replay Vision scanners configured. |
| `signals-scout-revenue-analytics` | No payment SDK or revenue events. |
| `signals-scout-skills-store` | No skills-store hygiene concerns at this stage. |
| `signals-scout-surveys` | No surveys in use (0 found). Enable if surveys are launched. |
| `signals-scout-tasks` | No PostHog Tasks / agent work items in use. |
| `signals-scout-web-analytics` | Game app — no web traffic / referrer / UTM tracking; web analytics isn't the primary surface. |
| `signals-scout-web-vitals` | No `$web_vitals` events captured. Enable if Core Web Vitals reporting is added. |

---

## Custom scouts

Two candidates were identified through gap analysis and proposed to the user. Both were **declined** — the built-in troop was kept as-is.

### Proposed (declined)

**Language scoring quality regression**
- Surface: `language_attempt_scored` events with scoring properties
- Discriminator: rolling weekly average score drops significantly vs prior week
- Why no built-in covers it: `signals-scout-product-analytics` watches funnel conversion rates in saved flows, not quality metrics on raw event property distributions. The observability-gaps scout would surface missing insight coverage but not a score regression on an insight that already exists.
- Decision: user declined

**NPC outcome achievement rate**
- Surface: server-side `errand_outcome_achieved` vs `errand_started` ratio
- Discriminator: `errand_outcome_achieved / errand_started` weekly ratio drops — earliest signal of NPC AI quality degradation
- Why no built-in covers it: no saved funnel from `errand_started` → `errand_outcome_achieved`, so `signals-scout-product-analytics` won't watch this specific ratio
- Decision: user declined

### Noise escape hatch

If any scout turns out noisy, set `emit: false` on its config in PostHog to switch it to dry-run (it still runs and logs, but writes nothing to the inbox).

---

## Follow-ups

- [ ] **Enable Session Replay**: go to [Project Settings → Session Replay](https://eu.posthog.com/project/234346/settings/environment-recordings) and toggle recording on. The `PostHogInit.tsx` client init has no blocking override — it will start capturing automatically once the server toggle is on.
- [ ] **Enable Error Tracking**: go to [Project Settings → Error Tracking](https://eu.posthog.com/project/234346/settings/environment-error-tracking) and enable exception autocapture. Client init already has `capture_exceptions: true`.
- [ ] **Enable Support (Conversations)**: go to [Project Settings](https://eu.posthog.com/project/234346/settings) and enable the Conversations product.
- [ ] **Connect a Conversations inbound channel**: after enabling the product, connect an email, inbox, or Slack channel so support tickets start flowing. The `conversations` / `ticket` signal source is already armed and will route tickets to the inbox automatically.
- [ ] **Verify returning-visitor identify path**: `AuthHeader.tsx` identifies on every `onAuthStateChange` including `INITIAL_SESSION`, so returning sessions should be covered — confirm in the browser with `?__posthog_debug=true`.
- [ ] **Add `NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN` and `NEXT_PUBLIC_POSTHOG_HOST` to `.env.example`** so collaborators know what to set.
- [ ] **Wire source-map upload** (`posthog-cli sourcemap` or your bundler's upload step) into CI so production stack traces de-minify in error tracking.

---

## What happens next

- The scout coordinator picks up the newly enabled configs and fires first runs within ~30 minutes.
- Each scout run draws from the project's daily budget (24 runs/day during early access; contact team-self-driving@posthog.com for more).
- Findings cluster into reports in the [Self-driving inbox](https://eu.posthog.com/project/234346/inbox).
- Immediately-actionable reports can start coding tasks directly from the inbox.
- Enable disabled scouts any time in PostHog as you add new product surfaces (feature flags, experiments, surveys, etc.).
