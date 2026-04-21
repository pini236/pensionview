---
opened: 2026-04-21
opened_by: engineering-lead
trigger: deadlock
involves: [product-lead]
status: open
---

## The decision
Whether the AI advisor refactor (Issue #SMOKE) gets the next sprint slot, or whether retirement-goal v2 wins.

## Positions
- engineering-lead: Refactor first — the current advisor code path is brittle, and retirement-goal v2 will compound the brittleness. We've already paid down most of the prep work; another sprint of carrying the debt costs us velocity on every advisor-touching pitch from the latest /explore (advisor-first-message, advisor-surfacing, advisor-proactive-nudges).
- product-lead: Feature first — the retirement goal tracker has user demand attached and the refactor is invisible. We can ship goal v2, gather feedback, then refactor in the next cycle when we have more concrete signal about which advisor surface to optimize for.

## What CEO needs to decide
Refactor next sprint, or retirement-goal v2 next sprint?

## Recommendation
engineering-lead opened this and recommends refactor — but acknowledges product-lead's "user value" framing has merit. Suggested compromise: split the sprint 60/40 toward refactor with a small goal-v2 slice, but only if the advisor-surfacing pitch makes the cut at /triage.

## Resolution
**SMOKE TEST — not a real escalation.** Used to verify that ceremonies surface open escalations to CEO before proceeding. Validation passed: `/standup` correctly showed this file as a pending escalation at the start of the ceremony and asked whether to resolve. Resolved as deferred ("skip"). Moving to resolved/ to clear the queue.
