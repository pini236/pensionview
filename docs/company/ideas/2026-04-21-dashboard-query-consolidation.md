---
pitched: 2026-04-21
pitched_by: engineering-lead
status: pitched
size: M
monday_item: https://pinizolberg-company.monday.com/boards/5094997064/pulses/2857125684
---

## The idea

Collapse the dashboard's 10-plus sequential Supabase round-trips into 3-4 parallel queries so page load time is not proportional to household size.

## Why it matters

The `SingleMemberDashboard` server component in `app/[locale]/(app)/dashboard/page.tsx` makes the following sequential queries in order:

1. `profiles` — fetch DOB and retirement goal
2. `reports` — latest done report
3. `report_summary` — for latest report
4. `savings_products` — for latest report
5. `reports` — previous report
6. `report_summary` — for previous report (conditional)
7. `report_insights` — for latest report
8. `reports` — last 6 reports for sparklines
9. `savings_products` — sparkline data (second savings fetch)
10. `reports` — last 4 reports for deposit alerts
11. `savings_products` — deposit alert history (third savings fetch)

That is **11 round-trips**, several of which are sequential (2 must precede 3, 5 must precede 6). `savings_products` is fetched **three separate times** for three overlapping purposes. On Supabase free tier (hosted in us-east-1), each round-trip from a Vercel serverless function in Europe adds ~60-120ms. At 11 sequential hops, a cold page load can exceed 1 second in server-side data fetching alone before a single byte of HTML is sent.

The `CombinedDashboard` path adds a fourth savings fetch for deposit history on top of the member-loop overhead.

This is a structural issue that compounds as we add features. The niud-radar pitch (domain-lead) would add a fee-reference lookup on top; the proactive-nudges pitch (product-lead) adds a nudge query. Each new feature adds another round-trip if the pattern is not fixed first.

## How it might work

- **Consolidate into parallel fan-out**: After the `profiles` + `latestReport` queries resolve (minimal sequential dependency), fire `report_summary`, `savings_products` (one fetch with sufficient columns for all three consumers), `report_insights`, and `previousReport` in a single `Promise.all`. The sparkline history and deposit alert history queries can share the same savings fetch if we increase the report window to `LIMIT 6` (sparklines need 6, deposit alerts need 4 — take 6, reuse).
- **Denormalize the previous report total**: the only field consumed from the previous report's summary is `total_savings` (for the delta badge). Store it as a derived `previous_total_savings` on `report_summary` so the "previous report" lookup disappears entirely. One migration, one field, no join.
- **Server Component co-location**: move the data fetching out of the component body and into a single `loadDashboardData(profileId)` function in `lib/queries/`. This makes the N+1 pattern visible in one place and testable in isolation. The component receives typed props instead of making calls inline.
- **Measure first**: add `durationMs` instrumentation to `logEvent` for the full page render, not just individual pipeline steps. Right now we log every LLM call but have zero visibility into dashboard server-side latency. Without a baseline, we cannot confirm the improvement.

## What we don't know

- Whether Vercel's streaming (React Suspense + `loading.tsx`) could mask the latency problem visually without fixing it structurally. Streaming is a valid short-term UX win but does not fix the actual cost — it is not a substitute for this consolidation.
- Whether the `denormalize previous_total_savings` migration introduces a consistency risk if a previous report's summary is later updated (it should not be, but validate that assumption).
- Whether the combined-view N+1 is more or less severe in practice — the combined dashboard already uses `Promise.all` for summaries/savings/insights, but still has the separate deposit-history loop per member.

## Domain review

<!-- No domain or compliance exposure — this is a pure performance/architecture refactor. No reviewer tags required. -->
