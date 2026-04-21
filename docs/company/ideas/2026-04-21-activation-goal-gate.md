---
pitched: 2026-04-21
pitched_by: growth-lead
status: pitched
size: S
monday_item: https://pinizolberg-company.monday.com/boards/5094997064/pulses/2857125831
---

## The idea

Force one decision — "what monthly income do you need at retirement?" — before showing the dashboard, so every first-time user has a goal and a gap on Day 1.

## Why it matters

Right now, `RetirementGoalCard` renders a dashed "Set your retirement goal" placeholder that links to Settings. The vast majority of first-time users will never follow that link — it costs them a navigation, it's not emotionally anchored to anything, and Settings is a graveyard for optional inputs.

Without a goal, the dashboard shows numbers (total savings, projected pension) that have no frame of reference. ₪820,000 is meaningless. ₪820,000 against a goal of ₪1,200,000 with a 32% gap is a reason to stay.

The goal question is also the highest-trust moment in the product: "we're asking you to tell us something personal about your future." That's the aha signal, not the moment they see the portfolio total.

Metric targeted: **goal-set rate within session 1** (currently unmeasured, plausibly near 0% given the hidden Settings path). Downstream: **D7 retention** — users with a gap to close have a reason to return next month.

## How it might work

- After Gmail connect or first PDF upload completes and the first report is done processing, intercept the redirect to `/dashboard` with a one-screen modal or dedicated `/onboarding` step.
- The screen asks two questions only: monthly income target (₪) and planned retirement age (pre-filled to 67). Skip is visible but not the default.
- On submit, write `retirement_goal_monthly` + `retirement_age` to `profiles` (same fields and API path that Settings already uses — zero new backend work).
- Land on dashboard with the RetirementGoalCard already populated, progress bar animated in, gap visible if one exists.
- If the user skips, surface a persistent nudge on the RetirementGoalCard for the next 3 sessions, then drop it.

This is S-sized because the data model and save path already exist (migration 007, Settings onBlur handlers). The only new work is a modal/page and routing logic.

## What we don't know

- What fraction of current users have set a goal via Settings (no analytics yet — this is also an argument to instrument first).
- Whether the intercept flow creates enough friction to hurt Gmail-connect completion rates (if activation is already fragile, adding a step post-connect is risky; the modal should feel like a reward, not a toll booth).
- Best copy in Hebrew: "כמה אתה צריך כדי לפרוש בשקט?" vs. "מה היעד החודשי שלך בפרישה?" — needs a copy test or at minimum a domain-lead review for reasonableness.
- Whether goal-setting should happen before or after the first report is processed (before = lower stakes, after = goal immediately has context from real data).

## Domain review

- domain-lead: pending
