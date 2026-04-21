---
pitched: 2026-04-21
pitched_by: engineering-lead
status: pitched
size: S
monday_item: https://pinizolberg-company.monday.com/boards/5094997064/pulses/2857127971
---

## The idea

Add per-user, per-report AI cost tracking to a `llm_usage` table so we can catch runaway spend before it shows up on the Anthropic invoice.

## Why it matters

We currently have two Claude call sites in the pipeline and one in the advisor:

- `lib/pipeline/extract.ts` — one call per PDF page, model `claude-sonnet-4-6`, max_tokens 4096. A 14-page PDF = 14 Sonnet calls. At current pricing (~$3/MTok input, $15/MTok output), a dense pension PDF can cost $0.05-0.15 per report depending on cache hit rate.
- `lib/pipeline/insight.ts` — one Sonnet call per report, max_tokens 500.
- `app/api/advisor/chat/route.ts` — one Sonnet call per user message, max_tokens 1024, no conversation length cap.

We log `input_tokens`, `output_tokens`, `cache_read_input_tokens`, and `cache_creation_input_tokens` to `console.log` as structured JSON. That is good. What we do not have:

1. **No aggregate tracking**: the logs are ephemeral (Vercel log drain retention is 1 day on Hobby, 3 days on Pro). There is no queryable table of "how much did user X's reports cost this month".
2. **No advisor conversation budget**: `AdvisorChat.tsx` will let a user send unlimited messages. A user who pastes a long conversation history and asks 50 questions is sending the full household data context (system prompt) on every turn with no cap. There is no `MAX_MESSAGES` or token-budget guard.
3. **No cache hit rate visibility**: the `cache_control: { type: "ephemeral" }` on the document block in `extract.ts` is a real optimization — but we have no way to know if it is actually hitting. Cache lifetime is 5 minutes. If two page extractions are more than 5 minutes apart (which happens on stalled pipelines), the cache misses and we pay full price for the PDF tokens on every page.
4. **No per-report cost rollup**: when a report fails and retries 3 times, we pay for 3x the extraction calls. The retry cost is invisible.

At current scale this is manageable. At 100 active users each with 2-3 household members each uploading monthly, that is ~600-1800 extraction calls per month before advisor usage. The advisor is unbounded.

## How it might work

- **`llm_usage` table**: columns `id`, `report_id` (nullable), `profile_id`, `feature` (extraction/insight/advisor), `model`, `input_tokens`, `output_tokens`, `cache_read_tokens`, `cache_write_tokens`, `estimated_cost_usd` (computed column or app-computed), `created_at`. Write a row after every LLM call in the same admin client call that already saves the result. Cost computation uses hardcoded price constants that we update when Anthropic changes pricing.
- **Advisor message cap**: add `MAX_CONVERSATION_TURNS = 20` in the advisor route. On turn 20, respond with a soft "session limit reached" message and reset the conversation client-side. This is a UX-acceptable tradeoff at current pricing.
- **Cache hit rate dashboard**: weekly aggregate query on `llm_usage` — `sum(cache_read_tokens) / sum(input_tokens)` — tells us whether the ephemeral cache is doing its job. If the hit rate is below 30%, it means page extractions are consistently spaced more than 5 minutes apart and we should look at pipeline batching instead of per-page HTTP chaining.
- **Retry cost signal**: join `llm_usage.report_id` to `processing_queue.attempts` — reports with `attempts > 1` and LLM calls show as the most expensive reports, flagging the extraction-cost tail from failures.

## What we don't know

- Whether storing cost estimates in the DB (with hardcoded pricing constants) creates any legal/contractual issue with Anthropic's terms. This is pure observability, not billing — but worth confirming.
- Whether `llm_usage` should be in the public schema (accessible via RLS for self-service transparency) or in a private admin schema. Surfacing AI cost to users could be an interesting trust-building feature ("this report cost ₪0.18 to process") but that is a product decision.
- Exact Anthropic pricing for cache reads vs. creation at our current API tier — pricing can vary by tier and changes over time.

## Domain review

- trust-compliance-lead: pending
