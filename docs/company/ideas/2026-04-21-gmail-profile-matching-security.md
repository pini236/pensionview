---
pitched: 2026-04-21
pitched_by: engineering-lead
status: pitched
size: S
monday_item: https://pinizolberg-company.monday.com/boards/5094997064/pulses/2857105113
---

## The idea

Replace the ILIKE-based profile-matching in the Gmail webhook with an exact-token lookup so a crafted sender greeting cannot route a report to the wrong household member.

## Why it matters

In `lib/gmail.ts`, a report arriving from Surense is matched to a profile by extracting the recipient's first name from the email body and running:

```
.ilike("name", `%${recipientName}%`)
```

There is a `sanitizeIlikeTerm()` function that strips `%` and `_` wildcards, but the underlying attack surface remains:

1. **Family member collision is almost certain at scale**: if a household has a member named "אורן" and another named "שאורן" (a valid Hebrew name), the ILIKE `%אורן%` matches both. `.single()` will throw a "multiple rows" error. Today this manifests as the report being silently dropped (`if (!matchedProfile) continue`). In a multi-member household, real users will hit this and never see their report.

2. **Cross-household match risk**: `sanitizeIlikeTerm` removes wildcard chars, but a common first name (e.g., "דוד") will match every "דוד" across all households. The query has no household scoping. Today there is a `TODO` comment in the code acknowledging this: "when supporting multiple households, also filter by household_id". That day is now — Family Mode (migration 003) already assigns `household_id`.

3. **The code's own comment acknowledges the TODO**: `lib/gmail.ts` line 115 says "TODO: replace ILIKE with a stable `email_recipient_token` column so we can do exact lookups instead of fuzzy substring matching." This is a self-identified hazard that was deferred.

The fix is not optional if we want Family Mode (multiple members per household) to work reliably. Getting a report routed to the wrong family member — or dropped because two names substring-match — is a data integrity failure, not a UX quirk.

## How it might work

- **Add `email_recipient_token` column to `profiles`**: a normalized, lowercased, diacritic-stripped version of the name as it appears in the Surense greeting. Populated on profile creation and kept in sync with `name` updates. Migration: `ALTER TABLE profiles ADD COLUMN email_recipient_token text`.
- **Populate for existing profiles**: a one-time data migration normalizes existing names into the column.
- **Match on exact equality**: `WHERE email_recipient_token = normalize(rawRecipientName) AND household_id = (profile's household)`. Zero fuzzy matching. If no match, log a structured event and skip (the existing behavior, but now for the right reason).
- **Defense in depth (the existing TODO)**: after page-1 extraction, compare `extracted client_name` against the matched profile name. If they differ by more than a threshold (Levenshtein distance > 2), mark the report `failed` with `error: recipient_mismatch` and log a structured alert. This is the secondary check the code's own TODO already requests.
- **Scope the household filter**: the Gmail webhook already has the `profileEmail` of the auth user who set up the watch. Join through that email to `household_id` and filter all candidate profiles to that household.

## What we don't know

- What normalization function to use for Hebrew names (strip nikud? strip prefixes like ה/ל/ב?). Need domain-lead input on Hebrew name equivalence rules before implementing the token.
- Whether existing Surense greeting formats for non-Ashkenazi names (transliterated Arabic names, etc.) cause normalization edge cases.
- trust-compliance-lead should review: storing a derived token from the user's name on the same row as the encrypted national_id is fine from an encryption standpoint, but worth confirming the token itself is not sensitive (it is derived from the display name which is plaintext anyway).

## Domain review

- trust-compliance-lead: pending
