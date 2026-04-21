---
pitched: 2026-04-21
pitched_by: product-lead
status: pitched
size: L
monday_item: https://pinizolberg-company.monday.com/boards/5094997064/pulses/2857125690
---

## The idea

Expand the PDF extraction pipeline beyond Surense so PensionView works for users whose pension provider does not use the Surense clearinghouse.

## Why it matters

The current extraction prompt is explicitly built for "Surense platform" reports (see `lib/pipeline/extract.ts`, line 4). Surense (מיטב סורנס) is a major clearinghouse but it does not cover all Israeli pension providers. Users whose funds are managed via Harel, Menora, Clal, Migdal, or Altshuler Shaham direct portals receive differently formatted PDFs — often from the provider's own portal rather than a clearinghouse. These users hit the pipeline, get zero data extracted, and churn.

The extraction prompt already handles the right data fields — the problem is layout variance, not schema variance. The field names in Hebrew exist across all provider PDFs; only the page layout and section order differ.

Why now: we have a working extraction baseline and an `admin/backfill` route. Adding layout-adaptive extraction before we grow the user base means early adopters across all providers get good data rather than a broken empty state.

## How it might work

- Add a provider-detection step: a lightweight first Claude call (low max_tokens, cheap) reads page 1 of any PDF and returns `{ provider_format: "surense" | "harel_direct" | "migdal_direct" | "unknown" }`.
- Per-format extraction prompts live in `lib/pipeline/prompts/` — each extends the base schema but adapts section hints to that provider's layout conventions. A `prompts/index.ts` routes by detected format.
- An `unknown` format falls back to the current generic Surense prompt (best-effort), and logs `provider_format: unknown` to observability so we can identify which format to support next.
- Validation (`lib/pipeline/validate.ts`) already runs post-extraction — no changes needed there; it will catch extractions that returned too-sparse data.
- Confidence score: if extracted `total_savings` is null and `savings_products` array is empty, mark the queue item with `low_confidence: true` and surface a UI hint to the user ("הדוח אולי לא נקרא בצורה מלאה — בדוק את הפרטים").

## What we don't know

- Which providers account for what percentage of the Israeli market? Need research to prioritize the second and third format (after Surense). Market share data from Gemel-net public reports could help.
- Do providers' PDF formats change frequently (annual redesigns)? If so, prompt maintenance cost could be high.
- Legal: do we need explicit permission to process PDFs from each provider, or does user consent cover it? `trust-compliance-lead` must review.
- Engineering effort: how many distinct formats exist? `engineering-lead` needs to audit a sample of real user PDFs (if available) to scope the work.
- Can we test extraction against synthetic PDFs without violating any provider terms?

## Domain review

- trust-compliance-lead: pending
