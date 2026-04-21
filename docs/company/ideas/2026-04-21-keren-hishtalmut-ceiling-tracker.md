---
pitched: 2026-04-21
pitched_by: domain-lead
status: pitched
size: S
monday_item: https://pinizolberg-company.monday.com/boards/5094997064/pulses/2857125751
---

## The idea

Track each member's קרן השתלמות contribution ceiling in real time and alert them — and their household — when they are under-contributing or over-contributing relative to the tax-exempt cap.

## Why it matters

קרן השתלמות (study fund) is the most tax-efficient savings instrument available to salaried employees in Israel, yet a large fraction of members either (a) contribute below the tax-exempt ceiling, leaving free money on the table, or (b) contribute above it without realizing the excess is not tax-exempt.

The statutory ceiling (תקרת ההפקדה המוטבת) for employees as of 2025 is 4.5% of salary (employee) + up to 7.5% (employer) on a salary base capped at ₪15,712/month (for 2025, indexed annually under the Income Tax Ordinance, Section 17(5)(a)). Contributions above this ceiling on the salary component are not tax-exempt for the employee and not deductible for the employer.

The product already captures:
- salary_for_product (savings_products.salary_for_product)
- monthly_deposit (savings_products.monthly_deposit)
- product_type = 'education_fund'

The ceiling calculation is deterministic from these inputs. We can compute it today.

Who benefits: every salaried member with an education_fund product. This is the modal user. The household dimension adds value for couples where one partner's fund is near-ceiling and the other's has headroom — they should not be treated as independent optimization problems.

Why now: the ceiling is indexed every year. Most members discover they've been miscalibrated only when their accountant files their annual tax return — a year too late.

## How it might work

- Add a keren-hishtalmut-ceiling.ts to lib/insights/. Inputs: salary_for_product, monthly_deposit, membership_type (employee vs. self-employed — different ceilings apply; Section 17(5)(b) for self-employed). Output: tax_exempt_ceiling_monthly (₪), actual_monthly_deposit (₪), headroom or excess (₪), verdict (under / at / over).
- The ceiling for employees: min(salary, ₪15,712) * 4.5% employee share. The total employer+employee ceiling is min(salary, ₪15,712) * 7.5% on the employer side; we only alert on the member's side since we do not have employer contribution data directly.
- Surface as a new insight card in the dashboard (alongside FeeAnalysisCard and RetirementGoalCard). Use a traffic-light: green = at ceiling, yellow = under-ceiling by > 20%, red = over-ceiling.
- For households: show household total utilization — "the two of you together are using 73% of your combined tax-exempt study fund capacity."
- The ceiling value must be stored as a config constant updated annually, not hardcoded.

## What we don't know

- Do we reliably capture salary_for_product from the PDF pipeline, or is it often null? If null, we cannot compute the ceiling — we should gate the card on data availability rather than show a wrong number.
- Self-employed ceiling (Section 17(5)(b)) is higher and more complex (16% * net income, up to a ceiling). Do we know from the data whether a member is self-employed? We have employment_status in savings_products — worth checking if the pipeline populates this consistently.
- How to handle members with multiple jobs / multiple education_fund products (which the data model allows). The ceiling applies per-person across all funds, so we need to aggregate.

## Domain review

- domain-lead: LGTM on direction. One precision note: the ₪15,712/month salary cap figure is the 2025 value (כפי שנקבע בצו הרחבה ועודכן בינואר 2025). This value is indexed; the insight engine must pull it from a config, not a literal. The self-employed track is worth a follow-up pitch of its own — the ceiling calculation there is meaningfully different and the audience (עצמאיים) is a distinct user segment with different needs.
