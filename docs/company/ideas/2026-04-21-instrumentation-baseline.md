---
pitched: 2026-04-21
pitched_by: growth-lead
status: pitched
size: S
monday_item: https://pinizolberg-company.monday.com/boards/5094997064/pulses/2857125688
---

## The idea

Instrument five activation and retention events — goal_set, report_processed, advisor_message_sent, deposit_alert_seen, share_created — so that every growth decision made after this is based on data instead of guesswork.

## Why it matters

Every pitch in this /explore cycle is grounded in product-surface reasoning, not numbers. That's honest, but it's a problem. Right now, we cannot answer:

- What % of first-time users ever set a retirement goal?
- How many users have ever sent a message to the AI advisor?
- Does the deposit alert card get seen, or is it scrolled past?
- How many reports does a user need before they check the Trends page?

Without these five numbers, we're making bets on activation and retention paths that we cannot validate. We will ship things that don't move metrics and not know it.

The `logEvent` function already exists in the codebase (`lib/observability`) and is already called from the pipeline (`pipeline.step.complete`, `pipeline.step.failed`). The infrastructure is there. We just haven't applied it to user-facing interactions.

Targeted outcome: **ability to measure D1/D7/D30 activation rate and advisor engagement rate** within 2 weeks of shipping. This is a prerequisite for prioritizing every other pitch in this slate.

## How it might work

Five events, all using the existing `logEvent` pattern:

1. `activation.goal_set` — fired on Settings save of `retirement_goal_monthly`. Attributes: `profile_id` (hashed), `session_number` (1 = first session), `locale`.
2. `activation.report_first_processed` — fired when a profile's first report transitions to `done`. Attributes: `ingestion_method` (gmail | manual_upload), `processing_time_ms`.
3. `retention.advisor_message_sent` — fired in the `/api/advisor/chat` route on every user turn. Attributes: `message_count_in_session`, `locale`.
4. `retention.deposit_alert_seen` — fired client-side when `DepositAlertsCard` renders with `alerts.length > 0` (IntersectionObserver or simple render-effect). Attributes: `alert_count`, `severity_max`.
5. `growth.share_created` — placeholder now, fired when share-snapshot ships.

All events are server-side where possible (no client JS bundle impact). The `advisor_message_sent` and `deposit_alert_seen` require minimal client-side work.

No new infrastructure. `logEvent` writes to whatever sink is already configured (Datadog is connected per the MCP tools available in this environment). Review with engineering-lead for the right sink and retention policy.

## What we don't know

- Whether `logEvent` currently writes to a queryable store (Datadog logs vs. metrics — querying logs is slower; we may want a structured metrics approach for D7 retention queries).
- Whether PII rules permit logging `profile_id` at all, or whether we need to hash it before logging (trust-compliance-lead must confirm).
- Whether the existing Datadog integration has dashboards set up or whether we'd need to build them (ask engineering-lead).
- Whether there are other events already being logged that we should consolidate with rather than add alongside.

## Domain review

- trust-compliance-lead: pending
