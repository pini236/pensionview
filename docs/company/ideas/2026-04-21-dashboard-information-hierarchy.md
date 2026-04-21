---
pitched: 2026-04-21
pitched_by: design-lead
status: pitched
size: M
monday_item: https://pinizolberg-company.monday.com/boards/5094997064/pulses/2857131988
---

## The idea

Restructure the dashboard so the one number a member must act on — their retirement gap — leads the screen, not their total balance.

## Why it matters

Today the HeroCard shows total savings as the first and largest element on screen. That number feels good but requires zero action. The retirement gap — the delta between projected monthly pension and the user's goal — is the number that actually tells someone whether they need to call their pension agent tomorrow. It currently sits buried in the sidebar (desktop) or below the fold (mobile), below deposit alerts, below fee analysis, below fund cards.

Israeli pension users are sold the "total pot" framing by their agents. PensionView's actual edge is reframing it as "what does this mean for your retirement?" Getting that reframe above the fold is the clearest differentiation move we have.

The concrete problem is visible in the code: on mobile (single column), the layout order is HeroCard → InsightCard → DepositAlertsCard → FeeAnalysisCard → FundCardGrid → RetirementGoalCard. A user who has not set a retirement goal sees an empty dashed box at the very bottom. A user who has set a goal and is off-track also sees that alert at the very bottom. Both paths bury the most important signal.

## How it might work

- Move RetirementGoalCard to the top of the single-column mobile stack, directly below the MemberSwitcher / TopBar — before HeroCard.
- On desktop 12-column grid, give RetirementGoalCard the span-5 hero slot (left) and move total savings into a compact stat bar at the top of the page rather than a large card.
- If no goal is set, the top slot becomes a warm, prominent "Set your goal" CTA (currently a dashed box hidden at the bottom — few users ever reach it).
- HeroCard can shrink to a stat strip: total balance, month-over-month change badge, last report date. Less prime real estate, still present.
- InsightCard, DepositAlerts, FeeAnalysis, and FundGrid follow in that order — all supporting detail below the primary call to action.

## What we don't know

- Does Israeli member behaviour match the "gap as primary motivator" assumption, or do they actually care most about total balance (savings account mental model)? Needs a research question before we ship.
- Will moving the total balance out of hero position feel like we're hiding something? Trust risk worth flagging to trust-compliance-lead.
- The PensionProjection component (`components/charts/PensionProjection.tsx`) hard-codes retirement age 67 and is not wired to the user's `retirement_age` setting in the DB. Any hierarchy change should fix that bug in the same pass.
- Empty state: if goal is not set AND no reports exist, the screen currently shows `NoReportsState`. The new top-slot CTA must degrade gracefully to that state.

## Domain review

- trust-compliance-lead: pending
