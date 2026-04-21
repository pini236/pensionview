---
pitched: 2026-04-21
pitched_by: trust-compliance-lead
status: pitched
size: S
monday_item: https://pinizolberg-company.monday.com/boards/5094997064/pulses/2857105074
---

## The idea

Add per-authenticated-user rate limiting to the AI advisor and PII-mutation API routes to prevent abuse, credential-stuffing amplification, and runaway LLM costs.

## Why it matters

Three routes currently have no rate limiting and each carries a distinct risk profile:

**`POST /api/advisor/chat`** (`app/api/advisor/chat/route.ts`)
Every request loads the authenticated member's full household financial snapshot — members, savings products, insurance products, report summaries — via admin-client queries, then sends all of it to Anthropic's API. A single authenticated session that loops this endpoint at network speed would: (a) drain LLM budget at ~$0.003-0.01 per call, (b) cause repeated bulk reads of pension PII from the database, (c) generate hundreds of Anthropic API calls with member financial data as context. There is no per-user call cap, no burst limit, no token budget.

**`PATCH /api/members/[id]`** (`app/api/members/[id]/route.ts:193`)
Accepts a new `national_id` value and writes it AES-encrypted to `profiles`. An attacker with a valid session (compromised account) could programmatically iterate `national_id` guesses (the field is 9 digits; validation at `lib/types.ts` only requires `/^\d{9}$/`). There is no lockout, no attempt counting, no alerting. This is not a theoretical threat — it is the same credential-stuffing pattern applied to PII overwrite rather than authentication. The impact is corruption of the member's national_id used as the PDF decryption password — breaking their pipeline silently.

**`POST /api/pipeline/backfill`** (`app/api/pipeline/backfill/route.ts`)
Authenticated route that triggers the full PDF processing pipeline for an uploaded file. No limit on how many times a member can trigger this per day. Pipeline steps involve LLM calls (`insight.ts`), storage uploads, and queue entries — each has a cost.

**OWASP A04:2021 (Insecure Design) — missing resource limits** and **A07:2021 (Identification and Authentication Failures) — no account lockout for PII mutation** both apply.

Why now: rate limiting is trivially cheap to add to Next.js API routes and dramatically cheaper than the alternative (an LLM bill spike from abuse, or a support incident where a member's national_id was silently corrupted by an attacker).

## How it might work

- Use Vercel's built-in rate limiting (KV-backed, available on the project's plan) or a lightweight in-process token bucket via `@upstash/ratelimit` (Redis-backed, free tier covers our scale).
- **Advisor chat:** 20 requests per user per hour. Exceeded: 429 with `Retry-After`. The client already handles non-200 gracefully.
- **Members PATCH (national_id field specifically):** 3 national_id changes per member per 24h. Exceeded: 429 with a user-visible message. Separately, alert via `logEvent` if any member hits this limit — it should almost never happen legitimately.
- **Pipeline backfill:** 10 triggers per user per day. Exceeded: 429.
- All rate limit events should write to the audit log (future) or at minimum emit a structured `logEvent` with `event: "rate_limit_hit"` so anomalies are visible in Vercel logs.
- The Vercel config (`vercel.json`) already exists — rate limit headers can also be declared there for the advisor route.

## What we don't know

- Which rate limit backend fits best: Upstash Redis (zero-infra, cheap) vs. Vercel KV (same thing under the hood on Vercel) vs. in-memory (doesn't work across serverless invocations). Upstash is the right answer but `engineering-lead` should confirm the infra cost is acceptable.
- Whether 20 advisor calls/hour is the right ceiling — a power user having a long pension planning session could hit it. We should monitor p95 usage before hardening the limit.
- The backfill limit may need to be per-report rather than per-user if users legitimately upload many historical PDFs in a batch.

## Domain review

<!-- No domain exposure. Engineering and T&C are the pitch authors — no additional tags required. -->
