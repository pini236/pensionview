---
pitched: 2026-04-21
pitched_by: domain-lead
status: pitched
size: S
monday_item: https://pinizolberg-company.monday.com/boards/5094997064/pulses/2857117601
---

## The idea

Alert members whose pension investment track (מסלול השקעה) does not match their age-appropriate risk profile — the single most common and silent source of long-term pension erosion in Israel.

## Why it matters

Israeli pension funds are required to offer a default lifecycle track (מסלול ברירת מחדל) under the Capital Market Authority's 2016 default track regulation (תקנות קופות גמל (ברירת מחדל), 2016). In the default track, equity exposure steps down automatically as the member approaches retirement age. But a large share of members — particularly those who joined before the default-track era or who were switched by agents to non-default "aggressive" tracks for commission reasons — sit in the wrong track for their age and never realize it.

The two failure modes:
1. Member is 58, still in a מסלול מניות (100% equities) — a 2022-style correction of 20-25% destroys a decade of compounding two years before they need to draw on it.
2. Member is 35, sitting in a מסלול אג"ח or money market track — they are "safe" but growing at 2% real while their peers compound at 5-6% real. This is the more common error and the less visible one.

PensionView already captures investment_track (savings_products.investment_track) as a free-text string, and we know each member's date_of_birth (profiles.date_of_birth) and retirement_age (profiles.retirement_age).

The opportunity: map the free-text track names to a risk category (aggressive / balanced / conservative) using a pattern-matching lookup, compute the member's years-to-retirement, and flag the mismatch. This is exactly the kind of domain-aware logic that a generic financial app cannot do — it requires knowing that "מסלול מנייתי" = aggressive and that a 55-year-old in that track is structurally at risk.

## How it might work

- Build a track-risk-classifier in lib/insights/. Input: investment_track string. Method: a maintained keyword map (מניות/מנייתי/אגרסיבי/צמיחה → aggressive; כללי/מאוזן/גמיש → balanced; אג"ח/ממשלתי/שמרני/כספי → conservative). Output: risk_category enum.
- Compute years_to_retirement from date_of_birth and retirement_age. Then apply the mismatch rule:
  - >= 15 years to retirement + conservative track → alert: "על פי מאפייניך, מסלולך עשוי להיות שמרני מדי"
  - <= 7 years to retirement + aggressive track → alert: "מסלולך עשוי לחשוף אותך לסיכון גבוה בסמוך לפרישה"
- Surface the alert on the FundCard badge row (already exists in the component) — a new badge variant "מסלול לבדיקה" in amber.
- The AI Advisor should be primed to explain lifecycle investing and the default-track regulation when members ask about their track.
- Do not recommend a specific destination track — that constitutes investment advice (ייעוץ השקעות) under the Regulation of Investment Advice, Investment Marketing and Portfolio Management Law, 1995. The alert prompts the member to raise the question with their fund or a licensed advisor.

## What we don't know

- How dirty is the investment_track field? If the PDF pipeline produces inconsistent strings (e.g., partial Hebrew, English transliterations, abbreviations), the classifier will misfire. We need to audit a sample of production track strings before relying on the signal.
- Some funds have track names that don't map cleanly to risk — for example, "מסלול סביבתי חברתי וממשל" (ESG) can be equity-heavy or mixed. We should default to "unknown" rather than misfiring.
- The mismatch thresholds (15 years / 7 years) are opinion-based heuristics, not regulation. We should label them as such in the UI.

## Domain review

- domain-lead: LGTM on the framing, with one hard constraint: the product must not name a specific track to switch to, as that would constitute investment marketing (שיווק השקעות) under the 1995 Investment Advice Law, requiring a license we do not hold. The alert is a flag ("your track may not fit your age"), not a prescription. This distinction is both a legal requirement and good product design — it keeps us honest and the member in the driver's seat. The mismatch thresholds should be labeled "rule of thumb" in the UI copy.
