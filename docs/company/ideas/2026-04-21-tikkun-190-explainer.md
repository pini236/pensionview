---
pitched: 2026-04-21
pitched_by: domain-lead
status: pitched
size: S
monday_item: https://pinizolberg-company.monday.com/boards/5094997064/pulses/2857131030
---

## The idea

Detect when a member's provident fund (קופת גמל להשקעה) or old savings balance qualifies for תיקון 190 treatment and show them — in plain language — what that means before they make an irreversible withdrawal decision.

## Why it matters

תיקון 190 (Amendment 190 to the Income Tax Ordinance — פקודת מס הכנסה, as amended in 2012 and refined since) allows members over age 60 who are entitled to a tax-exempt pension (קצבה מזכה) above a threshold to withdraw lump sums from non-pension savings vehicles at a reduced tax rate of 15% (instead of the standard 25% capital gains) — or in some cases convert the lump sum to an annuity and receive it tax-free. This is one of the most mis-understood and poorly-communicated provisions in Israeli personal finance.

The failure mode is common: a member over 60 liquidates a קופת גמל or a policyholder withdraws a savings policy payout without knowing they could have applied תיקון 190 treatment and saved tens of thousands of shekels in tax. The member didn't know; no one surfaced the question at the right moment.

PensionView already holds: date_of_birth (profiles.date_of_birth), retirement_age (profiles.retirement_age), product_type (savings_products.product_type), and projected_pension_full. The inputs to a תיקון 190 eligibility heuristic are already in the DB.

Who benefits: members aged 57-67 with provident fund (education_fund, investment_fund, savings_policy) balances. There are a lot of them — the education fund (קרן השתלמות) cohort that opened accounts in the 1990s now sits in the 55-65 bracket.

## How it might work

- Implement a תיקון 190 eligibility signal in lib/insights/: member age >= 57 (threshold for planning horizon) + product_type in (investment_fund, savings_policy) + balance > 0. This is the "you may want to understand תיקון 190" trigger — not a tax-advice assertion.
- Surface a dismissible card in the dashboard when the signal fires. The card explains: (a) what תיקון 190 is in two sentences, (b) the key condition (entitled pension above the statutory floor — the "קצבה מזכה מינימלית", which for 2025 was ~₪4,500/month), and (c) a strong prompt to consult a licensed pension consultant (יועץ פנסיוני) or tax advisor before withdrawing.
- The AI Advisor already has a chat interface. Prime the system prompt with תיקון 190 context so that when members ask "can I withdraw my gemel?", the advisor responds with the right frame, not a generic capital gains answer.
- No calculation of the actual tax saving — this would constitute tax advice and we are not a licensed tax advisor. The product surfaces the flag; the member gets professional advice.

## What we don't know

- The exact threshold for the "קצבה מזכה מינימלית" changes yearly. We need a mechanism to update it annually (a config value, not hardcoded).
- Whether we can derive the member's total projected qualifying pension reliably from our data, or whether we should always disclaim that the eligibility check is indicative only.
- How to handle members who use PensionView before retirement age but need to plan for this — the signal at age 57 gives a 10-year planning window, which is probably the right time to learn.

## Domain review

- domain-lead: LGTM on the framing — this is information, not advice. The key constraint is that we must not present a ₪ figure of "tax saved" because the calculation depends on the member's full pension entitlement, which we cannot fully determine from our data. The card must stay in the informational register: "you may be eligible — here is what to ask your advisor." תיקון 190 is grounded in סעיף 9(7א) of פקודת מס הכנסה and Circular 4/2012 of the Income Tax Authority.
