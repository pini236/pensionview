---
pitched: 2026-04-21
pitched_by: domain-lead
status: pitched
size: M
monday_item: https://pinizolberg-company.monday.com/boards/5094997064/pulses/2857128239
---

## The idea

Show every member exactly whether their pension is worth transferring (ניוד) — and to where — before they ever call a sales agent.

## Why it matters

ניוד (pension fund transfer between providers) is the single highest-leverage action most Israeli pension members can take, yet almost no one initiates it voluntarily. The reason is friction and information asymmetry: members can't compare their current fees + track record against the receiving fund without sitting through a sales pitch.

PensionView already ingests every member's current fees (deposit_fee_pct, balance_fee_pct) and returns (monthly_return_pct, yearly_return_pct, cumulative_return_36m_pct). The fee-analyzer.ts already emits a "verdict" (great / fair / high) per fund. What it does not do is surface a named destination — "move to Meitav Dash Pensia Bricha and save ₪1,800/year on fees" — with a ניוד CTA.

The gap is decision-ready intelligence. Right now the product tells members they're paying too much; it doesn't tell them what to do about it. A sales agent at a competing house will.

Members who see a specific, named ניוד opportunity — with projected lifetime savings — are meaningfully more likely to act. This is the most concrete anti-erosion tool a pension-aware product can offer.

Why now: The Capital Market Authority (רשות שוק ההון, הביטוח והחיסכון) has mandated full portability for all pension products since the 2017 ניוד reform. The מסלקה הפנסיונית makes cross-fund fee data public via gemel.net. We have no regulatory barrier and the destination data is available.

## How it might work

- Extend the fee-analyzer to look up current market fee leaders by product_type using a maintained reference table (sourced from gemel.net quarterly snapshots). The table needs: provider name, product_type, deposit_fee_pct ceiling, balance_fee_pct ceiling, and optionally 3-year return percentile.
- For each fund with verdict "high", surface a "ניוד מומלץ" card: current fund vs. top-3 alternatives, projected annual savings, and projected 20-year compounding delta (assuming current balance and deposit rate hold).
- The CTA is informational, not transactional: "יצירת קשר עם הגוף המנהל" or a link to gemel.net. PensionView does not take a transfer fee or refer commercially — this protects neutrality and avoids the need for a pension agent license (רישיון סוכן פנסיוני).
- Emit a ניוד flag on the member's dashboard card (the FundCard already renders a badge row) so the household view makes the opportunity visible at a glance.

## What we don't know

- How fresh the reference fee table needs to be for members to trust it. Quarterly is likely fine for balance fees; deposit fees change on contract negotiation, which varies.
- Whether surfacing named competitor names creates any commercial sensitivity or perceived bias. We need a clear editorial stance: we show the cheapest, not a sponsored choice.
- Do we need the full gemel.net API, or is a quarterly manually-curated snapshot sufficient to start? (Start with static, graduate to API.)
- What happens with ביטוח מנהלים (managers' insurance): ניוד is legally possible but practically complicated by the zכות ותק (seniority rights) and guaranteed coefficient (מקדם מובטח) for policies pre-2013. We must not show a ניוד recommendation for a pre-2013 ביטוח מנהלים without a strong caveat — those policies may carry a guaranteed annuity coefficient (מקדם קצבה) that cannot be replicated in a new pension fund. This is a hard domain constraint.

## Domain review

- trust-compliance-lead: pending
- domain-lead: CONCERNS on one specific point — pre-2013 ביטוח מנהלים policies. Members holding a guaranteed annuity coefficient (מקדם מובטח) from a legacy policy should never receive a blanket ניוד recommendation without an explicit warning that ניוד may forfeit that guarantee. The fee savings often do not compensate. This must be enforced in the recommendation logic before launch. The underlying idea is LGTM contingent on that guard being in the spec.
