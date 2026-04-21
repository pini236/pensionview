---
pitched: 2026-04-21
pitched_by: domain-lead
status: pitched
size: S
monday_item: https://pinizolberg-company.monday.com/boards/5094997064/pulses/2857130874
---

## The idea

Detect "orphan" pension and provident fund accounts — products where deposits have stopped but a balance remains — and prompt the member to either consolidate, resume, or formally close them.

## Why it matters

An estimated 15-20 billion NIS sits in dormant pension and provident accounts across the Israeli system (Bank of Israel and Capital Market Authority periodic reports). These are accounts where the employer relationship ended — due to job change, dismissal, or the account being simply forgotten — but the accumulated balance was never consolidated into the member's active fund.

Dormant accounts (חשבונות רדומים) carry three hidden costs that compound silently:
1. Balance management fees (דמי ניהול מהצבירה) continue to accrue even with no deposits. A ₪50,000 orphan account at 0.8% annual balance fee loses ₪400/year — every year, indefinitely.
2. Disability and life insurance coverage (כיסויים ביטוחיים) tied to the pension may lapse after a defined period of no deposits (typically 6 months to 1 year, fund-dependent). The member loses coverage without knowing it.
3. Investment track may not be updated as the member ages — the account is forgotten, so the lifecycle risk described in the track-mismatch pitch compounds.

PensionView already has the data to detect this: employment_status and monthly_deposit are both captured per savings_products row, and the deposit-alerts.ts engine already flags "stopped" deposits. The orphan detector is an extension of that signal with a balance threshold and a "has been stopped for N months" accumulation logic.

The household dimension is important here: orphan accounts often appear on a second member's side (spouse who changed jobs several times in the 2000s and accumulated three small funds). The household view makes these visible in aggregate.

## How it might work

- Define "orphan" as: monthly_deposit == 0 for the current report period AND balance > 0 AND product_type in (pension, severance_fund, investment_fund, education_fund). Exclude accounts the member has explicitly marked as self-managed or lump-sum.
- Extend deposit-alerts.ts (or create a separate orphan-funds.ts) to produce an OrphanFundAlert: fund name, balance, estimated annual fee drag (balance * balance_fee_pct), and a flag for whether the product_type is pension (which may have insurance implications).
- Surface on the dashboard as a dismissible alert card. Priority: high if pension product (insurance lapse risk), medium if provident fund (fee drag only).
- For pension orphans: add a copy line — "ייתכן שכיסויי הביטוח (נכות, שאירים) בחשבון זה אינם פעילים עוד — מומלץ לבדוק עם הגוף המנהל." This is information, not advice — it prompts the member to check.
- Next step CTA: link to מסלקה פנסיונית (the regulatory aggregation service) where members can request their full pension picture, and a reminder that ניוד is free (no fees, no tax event for pension fund transfers).

## What we don't know

- Does the PDF pipeline reliably capture accounts that had a prior deposit and now show zero? The current data model stores a snapshot per report_date — the orphan signal requires comparing across at least two consecutive reports (which the deposit-alerts engine already does). Check whether all users have enough historical reports for this to fire.
- The insurance lapse timeline varies by fund. We cannot state definitively "your insurance has lapsed" — only "it may have lapsed after 6+ months with no deposits." We need to be careful in copy not to assert the lapse.
- Some accounts have zero monthly_deposit by design — for example, a member who made a lump-sum deposit into a קופת גמל להשקעה and makes no regular contributions. We must distinguish "intentionally lump-sum" from "forgotten orphan." Without an explicit member signal, we should treat all zero-deposit accounts as potential orphans but default to dismissible rather than alarming.

## Domain review

- domain-lead: LGTM. The insurance-lapse angle is the most actionable and least understood by members. Important precision: the period after which pension insurance (disability/death) lapses without deposits is not uniform — it is set by each fund's תקנון (bylaws) and is typically 6-12 months. We must word the alert as "may have lapsed — verify with your fund" not "has lapsed." Regulatory grounding: the right for continued coverage and conditions for lapse are set in Circular 2013-9-23 of the Capital Market Authority (חוזר גופים מוסדיים 2013-9-23). This should be referenced in the product's supporting copy.
