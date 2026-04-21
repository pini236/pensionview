---
pitched: 2026-04-21
pitched_by: growth-lead
status: pitched
size: M
monday_item: https://pinizolberg-company.monday.com/boards/5094997064/pulses/2857129988
---

## The idea

Let users share a read-only, privacy-controlled "pension snapshot" link — a single-number card showing total household savings and on-track status — designed to be forwarded to a spouse, sibling, or financial advisor without exposing raw fund details.

## Why it matters

Household mode is already shipped (migration 003). The product has an explicit concept of a household with multiple members. But adding a spouse or parent as a household member requires them to sign up for PensionView and go through the Gmail OAuth flow themselves.

The share link inverts this: the existing user creates a shareable view. The recipient sees enough to understand why they should sign up — without needing an account first. This is the most natural viral loop for a household-finance product in Israel: couples discuss finances, parents and adult children compare pensions, financial advisors want to see the consolidated view before a consultation.

The emotional hook: "I just saw we're sitting on ₪2.1M together and we're 73% of the way to our goal" is a sentence people say out loud. Right now there's no artifact to forward.

Targeted metric: **new signups attributed to share link** (a distinct acquisition channel with zero media spend).

## How it might work

- User generates a share token (UUID, stored in a new `share_tokens` table with `profile_id`, `household_id`, `expires_at`, `view_type`).
- View type for v1: "household summary only" — shows total savings, on-track %, member count, but no fund names, provider names, or balances per fund.
- Public route: `/share/[token]` — server-rendered, no auth required, reads only through the share_token join (not household RLS), respects expiry.
- The shared card has a "Track your pension too" CTA below the numbers.
- Privacy: the share link is revocable, expires in 90 days by default, and shows only aggregate numbers. No PDF, no fund details, no insurance data.
- Generation UX: "Share your snapshot" button in the HouseholdHero or a settings panel, generates a link the user copies.

This is M-sized: new DB table + public route + share generation UI + the shared view component. No new auth flow, no third-party dependency.

## What we don't know

- Whether users are comfortable sharing even aggregate numbers (Israeli cultural sensitivity around money is real — this needs user research or at minimum a domain-lead sanity check on what level of detail feels "safe to share").
- Whether the "Track your pension too" CTA on the shared view converts meaningfully, or whether people who see the link are already PensionView users (the household member they want to show it to).
- Whether trust-compliance-lead has concerns about a public URL containing financial data, even in aggregated form.
- Token security: we need to ensure the UUID tokens are cryptographically random and the route doesn't leak any query-level info that reconstructs the underlying data.
- Whether sharing a "household is on track" message could be considered financial advice under Israeli law (domain-lead veto risk).

## Domain review

- domain-lead: pending
- trust-compliance-lead: pending
