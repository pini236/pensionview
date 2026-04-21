---
pitched: 2026-04-21
pitched_by: product-lead
status: pitched
size: M
monday_item: https://pinizolberg-company.monday.com/boards/5094997064/pulses/2857130522
---

## The idea

Turn the AI advisor from a pull chatbot into a proactive coach that surfaces the one thing that matters most each month.

## Why it matters

Right now the advisor only speaks when spoken to. Users land on the dashboard, scan the numbers, and leave — the advisor is invisible to anyone who does not think to open it. We already generate a per-report insight (Hebrew, 2-3 sentences), but it lives in a small card that most users scroll past and it does not ask for any action.

The gap: we have all the signal needed for proactive financial nudging (fee deltas, deposit gaps, retirement progress trajectory, insurance coverage holes) but we surface none of it as a directed call to action. A monthly "one thing" — pushed at the right moment — is the kind of feature that builds habitual use and makes PensionView feel alive between uploads.

Why now: the report pipeline fires on every Gmail delivery. We already call `generateInsight()` post-extraction. Bolting on a nudge engine at that same moment costs one extra LLM call and zero new infra.

## How it might work

- After `generateInsight()` completes for a report, a second Claude call (`generateNudge()`) runs with the same context plus household history. It outputs a single structured nudge: category (`fee` | `deposit` | `goal` | `insurance`), headline (Hebrew, ≤10 words), body (1 sentence), action label + href.
- The nudge is stored in a new `report_nudges` table (report_id, category, headline, body, action_href, dismissed_at).
- Dashboard shows a dismissible banner above the HeroCard — one nudge at a time, highest-priority. Dismissal writes `dismissed_at` so it does not repeat.
- Nudge categories map to existing screens: `fee` → fee analyzer, `deposit` → deposit alerts card, `goal` → settings#retirement, `insurance` → insurance matrix.
- Over time: if a user dismisses 3 consecutive fee nudges without acting, we stop surfacing fee nudges (avoid fatigue).

## What we don't know

- Will users find nudges helpful or intrusive? Need to measure dismiss rate vs click-through.
- LLM cost per report: one extra Sonnet call at ~1K tokens = ~$0.003/report. Fine at current scale, needs monitoring at growth.
- Priority ranking logic: when multiple nudge types fire on the same report, which wins? Needs a simple scoring rule we agree on.
- Is there a Hebrew-language UX pattern for dismissible nudge banners that feels native on mobile RTL? Design-lead needs to weigh in.
- Does `domain-lead` have concerns about framing recommended actions as AI-generated (IFA regulation proximity)?

## Domain review

- domain-lead: pending
- trust-compliance-lead: pending
