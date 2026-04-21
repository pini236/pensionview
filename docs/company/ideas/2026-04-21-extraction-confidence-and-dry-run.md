---
pitched: 2026-04-21
pitched_by: engineering-lead
status: pitched
size: M
monday_item: https://pinizolberg-company.monday.com/boards/5094997064/pulses/2857127904
---

## The idea

Add an extraction confidence score and a dry-run backfill mode so we can detect bad extractions before they corrupt live user data.

## Why it matters

The current `validateAndStore` function (`lib/pipeline/validate.ts`) is an all-or-nothing write: it deletes existing rows and inserts whatever the LLM returned. If the LLM hallucinates a number, silently misidentifies a page type, or returns an empty savings_products array for a multi-fund user, the production row is overwritten with wrong data and the user sees incorrect totals on their dashboard — with no indication anything went wrong.

Three concrete failure modes observed in the code:

1. **Empty extraction is treated as success**: if every page returns `{ "page_type": "cover" }` (e.g., because the PDF was in an unsupported layout), `validateAndStore` writes a `report_summary` with all nulls and zero savings_products rows. `reports.status` is set to `done`. The user sees an empty dashboard. There is no `low_confidence` flag, no alert, nothing.

2. **`total_savings` cross-check is absent**: the `report_summary.total_savings` field comes from the summary page. The savings_products array has individual `balance` fields. If `sum(savings_products.balance)` differs from `report_summary.total_savings` by more than, say, 20%, that is strong evidence of a misread. We never check this. A user could see ₪1,200,000 in the hero card and ₪300,000 across fund cards with no reconciliation error surfaced.

3. **No regression protection for prompt changes**: `lib/pipeline/extract.ts` has a 100+ line extraction prompt. Any change to that prompt could silently break extraction for some PDF layouts. There is no test suite that runs a sample PDF through the prompt and asserts the output shape. The only signal we have is downstream `validate` failures, which are too late.

The multi-provider pitch (product-lead, `2026-04-21-multi-provider-pdf-support.md`) explicitly requires a confidence score to handle `unknown` format fallbacks — we need this infrastructure first.

## How it might work

- **Confidence scoring in validate**: after merging pages, compute a confidence score (0-100) based on: (a) did we get a summary page? (b) is `total_savings` non-null and > 0? (c) is `savings_products.length` >= 1? (d) does `sum(balance)` reconcile with `total_savings` within 25%? (e) is `report_date` present? Store `confidence_score` and `confidence_flags` (json) in `report_summary`. Score < 40 sets `reports.status = 'low_confidence'` instead of `done`, preventing the dashboard from showing the bad data.
- **`low_confidence` status**: add to the `reports.status` check constraint alongside `pending/processing/done/failed`. The pipeline route stops before writing to `report_summary`. A new UI state shows the user "הדוח נקלט אך לא נקרא בצורה מלאה — אנא בדוק את הפרטים" with an option to trigger a re-extraction or contact support.
- **Dry-run extraction flag**: add `?dryRun=true` param to `/api/pipeline/validate`. In dry-run mode, the route runs the full validate logic and returns the confidence report as JSON but does not write any rows. The admin backfill page (`app/[locale]/(app)/admin/backfill/page.tsx`) can use this to preview what a PDF would produce before committing.
- **Golden-file tests for extraction**: create `__tests__/lib/pipeline/extract.golden.test.ts` that loads a small anonymized JSON fixture (no real PDF needed — the fixture is the LLM output, not the PDF) and asserts that `validateAndStore` produces the expected row shapes. This is a regression guard for prompt changes, not an integration test.

## What we don't know

- What confidence threshold to use for `low_confidence` vs. `done`. This requires looking at real extraction outputs across multiple report styles — we do not have that data yet. Start permissive (score < 20 = low_confidence) and tighten based on observation.
- Whether users will find the `low_confidence` state confusing. Product-lead needs to weigh in on the UX for this state — it is distinct from `failed` (pipeline error) and from `done` (fully trusted).
- Whether the balance reconciliation check (item d) is valid for users who have severance funds or savings policies with complex sub-account splits. Domain-lead should confirm whether `total_savings` in the Surense summary page includes all product types or just pension+education funds.

## Domain review

- domain-lead: pending
