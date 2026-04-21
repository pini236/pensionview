---
pitched: 2026-04-21
pitched_by: growth-lead
status: pitched
size: S
monday_item: https://pinizolberg-company.monday.com/boards/5094997064/pulses/2857114977
---

## The idea

When a user's first report finishes processing, automatically send one proactive AI advisor message — "here's the single most important thing I found in your pension data" — so the advisor surface introduces itself with real value instead of waiting to be discovered.

## Why it matters

The AI advisor exists at `/advisor` and is surfaced in the sidebar nav. It is entirely pull: the user has to navigate to it, understand what to ask, and type something. For most users, this never happens.

But the advisor already has the user's full data context (the system prompt in `/api/advisor/chat` injects household snapshot, savings, insurance). The first message from the advisor — if proactive, grounded in the actual data, and surfaced at the right moment — is the highest-value touchpoint the product has. It's the moment PensionView stops being "a dashboard" and starts being "something that tells me things I didn't know about my own money."

In the Israeli market, where trust in financial institutions is low, a short, specific, non-salesy insight from an AI that has seen your actual PDF is a differentiated experience. "I noticed your employer deposit to Migdal dropped by 23% in August — here's what that means" is not a generic chatbot response. It's earned trust.

Targeted metrics:
- **Advisor first-open rate** (currently unmeasured, estimated low given buried nav placement).
- **Advisor messages sent per user in first 7 days** — the leading indicator of stickiness.

## How it might work

- Trigger: same as the monthly digest email trigger — when a report transitions to `done` and it is the user's first report (count reports for profile_id = 1).
- Generate a "first insight" message server-side using the existing Anthropic client and system prompt. Prompt suffix: "The user has just connected their pension data for the first time. Write one paragraph (3-4 sentences) identifying the single most important thing you see in their data right now — a deposit gap, a high fee, a retirement goal shortfall, or a strength worth noting. Be specific and use their actual numbers. Do not greet or introduce yourself."
- Store the generated message in a new column `advisor_first_message text` on `report_insights` (or a standalone table — engineering-lead to advise). Mark it `generated_at`.
- Surface it: when the user first lands on the advisor chat page and has no prior messages, pre-populate the chat with this message as an assistant turn. The user then responds naturally.
- If the user has already sent advisor messages (they got there on their own), suppress the pre-population.

This is S-sized because the generation uses the existing Anthropic client and system prompt. The only new work is: trigger logic, storage, and chat pre-population UI.

## What we don't know

- Whether pre-populating the chat with a server-generated message violates the conversational UI mental model (it might feel "scripted" if users can see it was pre-generated, or it might feel like a warm welcome — UX call).
- Latency: generating this message on `report_done` adds an Anthropic API call to the pipeline. The pipeline already calls Claude for `report_insights` (the `generate_insight` step). We could fold this into that step to avoid a second API call — ask ai-engineer.
- Whether one "first insight" is enough to drive advisor engagement, or whether we also need to surface it more prominently (e.g., a badge on the advisor nav item).
- Cost: one extra Claude call per new user. At current scale this is negligible; at scale it's a budget line. Log it and revisit at 1,000 users.
- Whether this message should also be shown as a notification banner on the dashboard rather than requiring navigation to `/advisor`.

## Domain review

- domain-lead: pending
- trust-compliance-lead: pending
