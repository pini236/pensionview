---
pitched: 2026-04-21
pitched_by: product-lead
status: pitched
size: S
monday_item: https://pinizolberg-company.monday.com/boards/5094997064/pulses/2857121735
---

## The idea

Let users generate a clean, shareable PDF summary of their pension snapshot to hand to their human financial advisor — turning PensionView into the bridge between self-service and professional advice.

## Why it matters

PensionView users with complex situations (multiple members, gaps in coverage, high-fee funds) will eventually consult a licensed financial advisor (יועץ פנסיוני) or insurance agent. Today, that advisor has no structured view of the client's data — they ask the client to forward the original raw pension PDFs, or they request portal access from each provider separately. This is painful.

PensionView already has everything a professional would need:
- Total portfolio breakdown by product type
- Fee analysis with market comparison
- Insurance coverage matrix
- Deposit verification alerts
- Retirement goal progress

A one-tap "Export for Advisor" that generates a clean Hebrew-language PDF (or shareable link) positions PensionView as a professional tool, not just a personal tracker. It also creates an organic growth channel: advisors who receive well-formatted PensionView exports start asking their other clients to sign up.

Why now: this is an S-size feature that delivers outsized word-of-mouth impact. It does not require new data models — only a rendering layer on top of what already exists.

## How it might work

- A "שתף עם יועץ" (Share with advisor) button on the dashboard, visible only when at least one report exists.
- Generates a server-side PDF (or a print-optimized HTML page behind a token-authenticated URL, e.g. `/share/[token]`):
  - Header: PensionView logo, member name, report date.
  - Section 1: Portfolio summary table — fund name, product type, balance, monthly deposit, fee %.
  - Section 2: Fee analysis — current fees vs. market average, annual cost delta in ₪.
  - Section 3: Insurance coverage matrix.
  - Section 4: Deposit alerts (if any).
  - Section 5: Retirement goal progress bar + gap.
  - Footer: "מסמך זה הופק על ידי PensionView ואינו ייעוץ פיננסי".
- Share link expires after 7 days. No auth required to view, but no raw data is included — only the pre-rendered summary (no national ID, no account numbers beyond last 4 digits).
- The token and expiry are stored in a `shared_reports` table.
- Household view: share covers all household members in one document.

## What we don't know

- Does exposing a non-authenticated summary link create GDPR/Israeli privacy law risk? Even redacted pension data may be sensitive. `trust-compliance-lead` must assess the minimum viable redaction level.
- PDF rendering on the server: does our current infra support Puppeteer or a React-to-PDF library without extra cost? `engineering-lead` should weigh in on the simplest path (print-CSS vs. headless browser vs. a PDF library).
- Do Israeli financial advisors actually want this format, or do they prefer raw PDFs? Worth a quick user interview or sales-channel signal before building.
- What data is safe to include? Fund numbers, balances, and fees feel safe. National ID and bank account numbers should be excluded. What about employer name?
- Token security: 7-day expiry is a starting point — what should the revocation mechanism be if a user shares by mistake?

## Domain review

- trust-compliance-lead: pending
