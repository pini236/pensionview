---
pitched: 2026-04-21
pitched_by: engineering-lead
status: pitched
size: M
monday_item: https://pinizolberg-company.monday.com/boards/5094997064/pulses/2857132125
---

## The idea

Replace the HTTP-chain pipeline with a durable queue that survives Vercel cold starts, hobby-tier cron gaps, and partial failures without silently dropping reports.

## Why it matters

The current pipeline works by having each step fire an internal HTTP POST to the next step via `waitUntil`. This is brittle in at least four documented ways:

1. **Cron cadence on Hobby tier is daily** (`vercel.json` lines 5-11 — heal-pipelines runs once at 07:00). A report that stalls at `extract_page_3` at 07:01 is invisible until the next day. Real users will see "processing" for 23+ hours.

2. **pageCount is hardcoded at 10** in both `webhooks/gmail/route.ts` (line 78) and `heal-pipelines` (line 65). A 14-page PDF silently skips pages 11-14. `validate` reassembles only pages 1-10, the extracted JSON for the remaining pages is never read, and `total_savings` comes back wrong. There is no assertion or warning logged when pageCount mismatches the actual PDF page count.

3. **`triggerNextStep` fires and forgets** inside `waitUntil` — if the child fetch throws (network blip, cold start), the `catch` logs to stderr and the chain stops. `failQueue` is never called. The processing_queue row stays `processing` forever until the daily heal. No alert fires.

4. **Idempotency gap in `advanceQueue`**: two concurrent calls with the same `completedStep` will both update the same row to `done` and both read the same `nextStep`. There is no DB-level concurrency guard (no `FOR UPDATE` lock, no optimistic version). On a retry triggered by the heal cron while the original is still in flight, the validate step can run twice — the idempotent delete-first in `validate.ts` mitigates the worst outcome but coverage is not complete.

This is the foundational reliability hazard of the whole product. Every other feature (insights, nudges, niud radar) depends on extraction completing correctly.

## How it might work

- **Detect real PDF page count at download time**: after storing the encrypted PDF, use `mupdf` (already a dependency) to read the page count, persist it in `reports.page_count`, and use that value everywhere instead of the magic constant `10`.
- **Idempotent step locks in the DB**: add a `locked_until` timestamptz column to `processing_queue`. Before executing a step, an UPDATE with `WHERE status='pending' AND locked_until < now()` atomically claims the row. If 0 rows are affected, the step is already claimed and the invocation exits. This closes the concurrent-retry window with a single migration.
- **Structured failure on fire-and-forget**: wrap the `waitUntil(fetch(...))` with an explicit success check — if the child returns non-2xx, call `failQueue` synchronously within the `waitUntil` callback, not just `console.error`.
- **Heal-pipelines frequency**: promote to every 10 minutes on Vercel Pro, or add a Supabase scheduled edge function that does the same (no tier dependency). The current daily-at-07:00 schedule means a stalled morning batch sits broken all day.
- **Alert on `failed` queue items**: add a simple check in heal-pipelines that counts `status=failed` rows with `attempts>=3` and logs a structured `pipeline.reports_failed` event so Vercel log drains / future alerting can catch it.

## What we don't know

- Whether upgrading cron cadence requires a Vercel Pro tier bump — if so, cost-benefit analysis needed. The Supabase edge function alternative is free within generous limits.
- Whether `mupdf` in a Vercel serverless function can read page count without writing temp files to disk (the runtime has limited `/tmp` budget of 512 MB). A quick spike is needed.
- Whether the Hobby → Pro cron cadence difference is the right threshold for promotion or if a Supabase background worker is architecturally cleaner long-term.

## Domain review

- trust-compliance-lead: pending
