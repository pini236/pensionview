---
pitched: 2026-04-21
pitched_by: design-lead
status: pitched
size: S
monday_item: https://pinizolberg-company.monday.com/boards/5094997064/pulses/2857128504
---

## The idea

Surface the AI advisor's three starter prompts directly on the dashboard instead of hiding them behind a floating button most users will never tap.

## Why it matters

The AdvisorChat is built and works. The entry point is a floating sparkle button (bottom-right, `bottom-24 end-4`) that competes visually with the bottom nav and has no label on mobile — just an icon. Unless a user already knows to tap it, the feature is invisible.

The three hardcoded suggestion strings ("מתי אוכל לפרוש?", "האם דמי הניהול שלי גבוהים?", "מה התשואה החודשית הכי טובה שלי?") are gold: they are the exact questions users have, phrased in plain Hebrew, and they are contextualised to the member's own data. That copy currently lives inside a collapsed panel almost no first-time user will open.

The cost of building the advisor was high. The cost of a user never using it is also high — both for the user's outcome and for product retention. This is a surfacing problem, not a feature problem.

## How it might work

- Add a compact "ask the advisor" strip immediately below the HeroCard (or RetirementGoalCard if the hierarchy pitch ships). Three chips, one per suggestion. Tapping a chip opens the advisor panel pre-filled with that question and fires the send immediately.
- The strip is dismissible (stored in localStorage) so it does not clutter the dashboard permanently after a user has engaged.
- On first open of the advisor, skip the suggestion list inside the panel (the list is already shown on the dashboard) and go straight to the active conversation.
- The floating button stays — it is the persistent re-entry point. But its z-index and position should not conflict with bottom nav tap targets (currently `bottom-24` on mobile which is very close to the nav).

## What we don't know

- Does inline surfacing of AI suggestions feel pushy, or helpful? Israeli users may not yet have a strong "ask the AI about my pension" mental model — the chip framing softens the commitment vs. opening a chat panel.
- Three chips may be too many for very small screen widths in Hebrew (long strings). Need to test whether chips need to be a horizontal scroll or a vertical stack.
- What happens if the advisor API call fails when triggered from the dashboard chip? The user is not even inside the chat panel yet. Needs a graceful path: open the panel, show the error inside the chat, do not silently fail.

## Domain review

- trust-compliance-lead: pending
