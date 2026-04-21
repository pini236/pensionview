---
pitched: 2026-04-21
pitched_by: product-lead
status: pitched
size: M
monday_item: https://pinizolberg-company.monday.com/boards/5094997064/pulses/2857105289
---

## The idea

Give users an interactive "what if" planner so they can test retirement scenarios before calling their pension agent — making PensionView the place where financial decisions start.

## Why it matters

The RetirementGoalCard today shows one number: projected pension vs. goal, and a rough suggested deposit increase to close the gap. The math is a single-pass estimate (lines 62-71 in `RetirementGoalCard.tsx`). It answers "am I on track?" but not "what would happen if I...":
- Retired 3 years earlier?
- Increased deposits by ₪500/month from next year?
- Changed my investment track from bonds to equities?
- My spouse retired at 65 instead of 67?

These are the actual questions users ask a pension agent. Today they leave PensionView and call someone. If we answer those questions inside the app, we become a decision-support tool, not just a tracker — a much stickier value proposition.

The household model already stores `retirement_age`, `retirement_goal_monthly`, and `monthly_deposit` per member. We have the inputs; we are missing the UI surface that lets users play with them without overwriting their real settings.

Why now: the trends page has a `LongTermPlaceholder` shown to users with fewer than 12 reports (the majority of our user base at this stage). The scenario planner fills that void with something actionable while users are still building up report history.

## How it might work

- New page or drawer: `/[locale]/(app)/planner` — RTL-first, mobile-friendly slider UI.
- Inputs (sliders + number inputs, all non-destructive — do not touch the profile row):
  - Retirement age: 55–75, default from profile.
  - Monthly deposit delta: -50% to +200% of current deposits.
  - Investment return assumption: conservative (3%), base (5%), optimistic (7%) — user picks.
  - Partner retirement age (if spouse exists in household).
- Output panel updates in real time (client-side, no server call for the projection math):
  - Projected total at retirement (accumulated balance).
  - Monthly pension income from that balance.
  - Gap or surplus vs. goal.
  - Years until goal is funded.
- "Ask the advisor about this scenario" button: pre-fills the advisor chat with a Hebrew summary of the scenario parameters, opening a contextual conversation.
- No data is persisted — pure ephemeral UI state. Users who want to update their real goal click "Save as my goal" which routes to settings#retirement.

## What we don't know

- Is the projection math accurate enough to be trustworthy? The current `RetirementGoalCard.tsx` uses a rough lump-sum approximation. We should get `domain-lead` to validate the annuity formula before showing multi-scenario outputs.
- Regulatory posture: does showing scenario projections constitute financial advice under Israeli law? `trust-compliance-lead` must assess. A clear disclaimer ("זהו כלי להדמיה בלבד ואינו ייעוץ פיננסי") may be sufficient.
- What return assumptions are defensible for Israeli pension funds? The AI advisor system prompt uses 5% real — does `domain-lead` agree this is the right baseline?
- Design complexity: sliders + real-time output + RTL on mobile is a non-trivial UX challenge. `design-lead` should prototype before we spec.
- Does this cannibalize value from the AI advisor (i.e., would users stop chatting if they can self-serve scenarios)? Or does it drive advisor sessions by raising better questions? Hypothesis: it drives advisor sessions.

## Domain review

- domain-lead: pending
- trust-compliance-lead: pending
