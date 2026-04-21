---
pitched: 2026-04-21
pitched_by: trust-compliance-lead
status: pitched
size: M
monday_item: https://pinizolberg-company.monday.com/boards/5094997064/pulses/2857119857
---

## The idea

Build a self-serve data export and account deletion flow so members can exercise their legal rights without us having to do it manually.

## Why it matters

**חוק הגנת הפרטיות, 5741-1981, sections 13-17** grant individuals the right to inspect data held about them and to demand correction or erasure. The amended Privacy Protection Regulations (Data Security), 5777-2017 further require that a data controller have a documented process for handling such requests within 30 days.

PensionView currently has:
- No data export endpoint (no way for a member to download everything we hold about them in machine-readable form)
- No account deletion endpoint (the DELETE `/api/members/[id]` is soft-delete only and only covers household members, not the auth account or its associated data)
- No documented process for handling access requests

The soft-delete in `app/api/members/[id]/route.ts:264` sets `deleted_at` but leaves all PII intact in the database: `profiles.national_id` (AES-encrypted), `profiles.date_of_birth`, `profiles.google_refresh_token`, all `savings_products` and `insurance_products` rows, all `report_insights`. A deleted member's data is excluded from the live UI but persists forever.

For GDPR (applicable where EU residents use the product — Art. 17 Right to Erasure), the same gap applies.

The embarrassing scenario: a member emails asking to delete their account before a major life event (divorce, job change). We have no tooling. Someone has to SSH into Supabase and run manual queries against production pension data. That is itself a privacy incident in the making.

Why now: the cost of building this before the first deletion request is a few days of work. The cost after a formal data subject access request lands — with a 30-day legal deadline and no tooling — is much higher, and the reputational damage if we miss the deadline is disproportionate to a product at this trust tier.

## How it might work

- **Export (access right):** New API route `GET /api/account/export` — authenticated, rate-limited to 1/day. Returns a JSON (or ZIP with JSON + a placeholder listing what PDFs exist but not their contents, since decrypted PDFs are ephemeral). Include: profile fields (name, email, dob, relationship), all reports with dates and statuses, all savings_products rows, all insurance_products + coverages rows, all report_insights. Exclude: encrypted tokens (google_refresh_token), the raw national_id ciphertext (offer decrypted value of national_id in the export only if we can verify the member is the subject).
- **Account deletion:** New API route `DELETE /api/account` — authenticated, requires a confirmation token (email round-trip or re-auth). Cascades: hard-delete all profile rows for the household, all reports, all child rows, revoke Google token via Google API, delete Supabase auth user. Add a `scheduled_deletion_at` field with a 30-day grace period (gives us a recovery window and mirrors GDPR best practice).
- **UI:** "Data & Privacy" section in Settings with two buttons: "Download my data" and "Delete my account." Both flow through the API routes above.
- **Process log:** each export or deletion request writes a row to a new `data_subject_requests` table (`type`, `requested_at`, `completed_at`, `requesting_email`) so we have an auditable record.

## What we don't know

- Whether the export should include a human-readable PDF summary (more useful, more work) or structured JSON only (faster to ship).
- Grace period length: 30 days mirrors GDPR Art. 17 processing timelines; Israeli law is less specific. Legal review may be needed.
- How to handle deletion for the household head vs. household members — does deleting the head cascade to all members? Probably yes, but needs a deliberate decision.
- Storage cleanup: deleted PDFs in the Supabase `reports` bucket currently have no lifecycle policy. Deletion flow must include explicit storage object deletion via the admin client.

## Domain review

<!-- Each reviewer appends: -->
<!-- - reviewer-name: LGTM | CONCERNS: <reasoning> | VETO: <reasoning> -->
