---
pitched: 2026-04-21
pitched_by: product-lead
status: pitched
size: M
monday_item: https://pinizolberg-company.monday.com/boards/5094997064/pulses/2857105421
---

## The idea

Automatically flag underinsurance — life, disability, and health — against Israeli actuarial norms, so users know if their coverage is dangerously low before a life event proves it.

## Why it matters

We already extract insurance data: `InsuranceProduct`, `InsuranceCoverage`, `life_insurance_amount`, `disability_coverage_amount`, `health_insurance_exists` (see `lib/types.ts` and the extraction prompt in `lib/pipeline/extract.ts`). We show an `InsuranceSummary` card on the dashboard and an `InsuranceMatrix` in the household view.

What we do not do: tell the user whether those numbers are enough. The average Israeli employee's disability coverage should be ~75% of gross salary. Life insurance for a 35-year-old with a mortgage should cover 7-10x annual salary. Many users are severely underinsured and have no idea until they file a claim.

This gap is where PensionView can create real financial impact — not just display data, but interpret it against Israeli norms. The deposit alert engine (`lib/insights/deposit-alerts.ts`) proved we can turn extracted data into actionable warnings. Insurance gap detection is the same pattern applied to a more consequential domain.

Why now: we have the data model and extraction already. The household view with the InsuranceMatrix already groups insurance by member — perfect foundation. This is a logical next step after v0.1 shipped insurance display.

## How it might work

- New `lib/insights/insurance-gap-detector.ts` module (mirrors `fee-analyzer.ts` pattern):
  - Inputs: `InsuranceCoverage[]` + profile data (salary — which we do not yet store; see open questions) + `monthly_deposit` (as a proxy for salary).
  - Outputs: `InsuranceGap[]` — each has `type` (`life` | `disability` | `health`), `currentAmount`, `recommendedMin`, `gap`, `severity` (`critical` | `moderate` | `low`), `message` (Hebrew), `messageEn`.
  - Life insurance benchmark: 60x monthly salary (roughly 5 years of gross income, aligned with Israeli Bank rules for mortgage life insurance).
  - Disability benchmark: coverage should replace at least 60% of salary until pension age. We approximate salary from `salary_for_product` if available.
  - Health insurance: binary — if `health_insurance_exists` is false and the member is over 30, flag as moderate gap.
- New `InsuranceGapsCard` component on the dashboard, positioned below `InsuranceSummary`. Only rendered when gaps exist.
- In household view: gaps are per-member, shown inside the `InsuranceMatrix` as warning indicators on cells rather than a separate card.
- Link from each gap to the advisor chat with a pre-filled question: "אני רוצה להבין מה הכיסוי הביטוחי שחסר לי".

## What we don't know

- Salary as an input: we do not have a `salary` field on profiles. `salary_for_product` exists on `SavingsProduct` but it is per-fund, not per-person. Should we add a salary field to `profiles`? Or derive it from sum of `salary_for_product` across the latest report? `domain-lead` should confirm the right proxy.
- Israeli benchmarks: the 60x / 75% rules are general market norms. Are there tighter actuarial standards for specific age groups or employment types (self-employed vs. employed)? `domain-lead` must validate before we show any number.
- Regulatory line: calling someone "underinsured" might be construed as personalized insurance advice, which requires a license in Israel (סוכן ביטוח). Framing as "below common market benchmarks" rather than "you need to buy more coverage" may be sufficient. `trust-compliance-lead` must assess.
- Extraction completeness: does the Surense PDF reliably give us `insured_amount` and `insured_role` for all coverage lines? Gaps in extraction quality will cause false "gap" alerts, which is worse than silence. Need to audit extraction accuracy on real reports.
- What happens for self-employed users with no employer-provided disability? Their PDFs may lack the coverage data entirely, making gap detection unreliable.

## Domain review

- domain-lead: pending
- trust-compliance-lead: pending
