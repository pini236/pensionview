---
pitched: 2026-04-21
pitched_by: design-lead
status: pitched
size: M
monday_item: https://pinizolberg-company.monday.com/boards/5094997064/pulses/2857130781
---

## The idea

Replace the single-screen NoReportsState with a three-step onboarding flow that collects date of birth, retirement goal, and first report in one session — so the product is immediately meaningful rather than immediately empty.

## Why it matters

A new user today sees `NoReportsState`: a sparkle icon, "Let's get started", and two CTAs — upload a PDF or connect Gmail. Both paths lead away from the dashboard. If the user completes upload, they return to see total savings and fund cards, but without a date of birth they see "Add your date of birth in Settings to see your pension projection," and without a retirement goal they see a dashed empty box at the bottom of the page.

The minimum viable context for PensionView to be useful is: DOB + retirement goal + one report. Currently those three things are collected across three separate surfaces (settings page for DOB, settings page for retirement goal, admin/backfill for upload). There is no guidance that all three are needed and no incentive gradient to complete them.

The empty state also shows the same experience for a user who just uploaded a report and is waiting for processing (status: pending/processing) as for a user who has never uploaded anything. Processing can take time — the user gets no feedback.

## How it might work

- When `reports.length === 0` AND the user has no `date_of_birth` or no `retirement_goal_monthly`, show a stepped onboarding card instead of the current empty state:
  - Step 1 (30 seconds): "מה גילך?" — date of birth input, prominent, single field.
  - Step 2 (30 seconds): "כמה אתה צריך בחודש בפרישה?" — retirement goal, preset chips for ₪10,000 / ₪15,000 / ₪20,000 + custom input. Preset chips reduce cognitive load and cover the Israeli middle-class range.
  - Step 3: Upload or connect Gmail — the existing CTAs, but now framed as "עכשיו תן לנו את הנתונים" after we have their context.
- After upload, if status is pending/processing, show a processing state (not the zero-data empty state) with an estimated wait time and a brief explainer of what we are extracting.
- If DOB and goal are already set but no report exists, skip to step 3.
- Save step 1 and 2 immediately (same autosave pattern already used in settings page `onBlur` / debounced `onDobChange`).

## What we don't know

- What is the actual processing time distribution for the PDF pipeline? If it is usually under 10 seconds, a spinner is fine. If it is 2-5 minutes (common for large PDFs via mupdf), the user needs more reassurance.
- Do Israeli users trust entering their retirement income expectation into an app without understanding how the number is used? May need a one-line explainer ("משמש רק לחישוב יעד — לא נשתף את הנתונים").
- Preset chips for retirement income: ₪10k / ₪15k / ₪20k are a design assumption. Domain-lead should validate what the realistic range is for the target demographic.
- How does this interact with a household where one member has reports and another does not? The stepped onboarding should only fire for the zero-report member, not for the household view.

## Domain review

- domain-lead: pending
