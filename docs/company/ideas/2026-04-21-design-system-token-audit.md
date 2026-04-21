---
pitched: 2026-04-21
pitched_by: design-lead
status: pitched
size: S
monday_item: https://pinizolberg-company.monday.com/boards/5094997064/pulses/2857114934
---

## The idea

Run a one-sprint audit of design token usage across the codebase and consolidate the three ad-hoc patterns currently producing inconsistent spacing, typography scale, and color application.

## Why it matters

PensionView v0.1 shipped fast and the visual language is mostly consistent, but there are specific debt pockets that will compound as the surface area grows:

1. **Hard-coded locale string duplication.** Hebrew/English strings are scattered as inline ternaries throughout component files (`isHebrew ? "..." : "..."`) rather than going through the next-intl translation system. Examples: `RetirementGoalCard.tsx`, `PensionProjection.tsx`, `NoReportsState.tsx`, `DepositAlertsCard.tsx`. Every new string added this way is untestable, unsearchable, and fails silently if the locale changes. This is not just i18n debt — it means copy changes require touching component code, which means design and engineering are coupled on every copy edit.

2. **Typography scale is informal.** Font size classes in use: `text-xs`, `text-sm`, `text-2xl`, `text-3xl`, `text-4xl`, `text-5xl`, `text-6xl` — but without a semantic mapping. `HeroCard` uses `text-2xl xs:text-3xl sm:text-4xl md:text-5xl lg:text-6xl` with five breakpoint overrides for one number. That's brittle and will break in any new hero-style component. We need a named scale: `display-xl`, `display-md`, `body`, `caption` mapped to token values.

3. **RTL utility gaps.** The codebase correctly uses `start`/`end` directional utilities (e.g., `inset-x-2`, `start-0`, `ms-1`, `ps-4`) in most places. But `FundCard.tsx` uses `text-end` and the `PensionProjection` component has a hard-coded `start-0` for the progress bar that will not flip correctly in an LTR fallback. A systematic audit would catch any missed directional classes before they become user-facing bugs.

4. **`ui/` design system is thin.** `components/ui/` has: `AnimatedNumber`, `Badge`, `Button`, `SegmentedControl`, `Skeleton`. The `Button` component is barely used — most interactive elements are raw `<button>` tags with inline Tailwind. This means hover states, focus rings, and disabled states are inconsistently handled across the product. Any new screen built by a new engineer will diverge further.

## How it might work

- Audit pass (2-3 days): grep all `isHebrew ?` patterns and move strings to translation files; map all typography classes to a proposed scale; flag all directional class usages for correctness.
- Consolidation (2-3 days): extend `components/ui/Button` to cover the dominant button patterns (primary/cta, secondary/surface, ghost); extract a `Typography` component or at minimum document the semantic scale in CLAUDE.md so future components use it.
- No visual changes to ship — this is refactor-only. The output is a design-system note in `docs/company/research/design/` and a set of small PRs.
- The `PensionProjection` component has a secondary problem worth fixing in the same pass: it hard-codes `retirementAge = 67` on line 27, ignoring the `retirement_age` field from the user's profile. That is a data correctness bug, not just a design debt item.

## What we don't know

- How many translation keys are already in the next-intl message files? Need to check what is already covered vs. what is genuinely missing before assuming all inline strings are debt (some may be intentional exceptions).
- Is there a linting rule for directional CSS that could be added to the project config so this doesn't regress?
- Scope risk: "audit" work that touches many files simultaneously is merge-conflict-prone. Engineering-lead needs to agree on a batching strategy (one file-type at a time, not all at once).

## Domain review

<!-- No domain or compliance exposure — this is a pure engineering/design refactor. No reviewer tags required. -->
