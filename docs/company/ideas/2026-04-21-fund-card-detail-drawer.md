---
pitched: 2026-04-21
pitched_by: design-lead
status: pitched
size: M
monday_item: https://pinizolberg-company.monday.com/boards/5094997064/pulses/2857119804
---

## The idea

Make each FundCard tappable — opening a bottom sheet with the full field set for that savings product so members can understand what each fund actually is without leaving the dashboard.

## Why it matters

FundCard currently renders: product name, provider, balance, monthly return %, and a sparkline. The data model (`SavingsProduct` in `lib/types.ts`) contains a much richer field set that is never shown to the user on mobile: investment track, track code, deposit fee %, balance fee %, employer, salary for product, severance breakdown, join date, 36m and 60m cumulative returns, projected pension (base and full) per fund.

The FundCard has 3D tilt animation on hover and `cursor-pointer`, which strongly implies it is interactive — but tapping it on mobile does nothing. This is a broken affordance: the card looks interactive, the user taps, nothing happens. That is a trust/comprehension problem.

Israeli pension users receive quarterly "דוח שנתי מאוחד" PDFs specifically because their agents want them to see these numbers (especially the breakdown of employer vs. employee contributions and the fee rates). PensionView extracts all of it. None of it is accessible in the product today except through the report detail page (`/reports/[id]`), which is several taps away and shows all funds mixed together.

A per-fund detail drawer would close the gap between "what we have" and "what we show" with a single interaction pattern that already makes visual sense.

## How it might work

- Tap on any FundCard opens a bottom sheet (modal drawer, slides up from bottom — standard Israeli mobile app pattern, culturally familiar).
- Drawer sections (collapsed by default, expandable):
  - Header: product name, provider, color stripe matching fund type, balance (large), month return badge.
  - "תשואות" (Returns): monthly, yearly, 36m, 60m cumulative — using the ReturnsTable component that already exists in `components/trends/ReturnsTable.tsx`.
  - "הפקדות" (Deposits): employer contribution, employee contribution, salary used for calculation.
  - "דמי ניהול" (Fees): deposit fee %, balance fee % with a market-comparison badge (the FeeAnalysis data is already computed in fee-analyzer.ts).
  - "פרטי קרן" (Fund details): investment track, join date, fund number, status.
  - "תחזית" (Projection): projected_pension_base and projected_pension_full for this specific fund.
- On desktop, the drawer can be a side panel (slide in from end edge) rather than a bottom sheet.
- RTL: drawer slides from the bottom (mobile) or from the right edge (LTR equivalent — actually left edge in RTL). Must use `inset-inline-end: 0` for the side panel.

## What we don't know

- Not all fields are populated for every fund — some PDFs don't include all values. The drawer needs graceful handling of null/undefined fields (show "לא זמין" rather than "0" or blank).
- How does the drawer interact with the floating AdvisorChat button? On mobile, the drawer will cover the button. We need to hide the FAB when a drawer is open.
- Performance: the drawer needs data it already has (passed from FundCardGrid to FundCard). No new fetches needed at the card level. But the FeeAnalysis computation currently happens at the page level (`analyzeFees((savings ?? []) as SavingsProduct[])`) — we need to pass the per-fund analysis result down to the card so the drawer can show it without re-running the computation.
- Should the drawer be a route change (`/dashboard?fund=<id>`) or a pure client-side overlay? Route change enables deep linking but adds complexity. Overlay is simpler and sufficient for v1.

## Domain review

- domain-lead: pending
