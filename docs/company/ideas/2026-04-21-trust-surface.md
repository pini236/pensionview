---
pitched: 2026-04-21
pitched_by: trust-compliance-lead
status: pitched
size: S
monday_item: https://pinizolberg-company.monday.com/boards/5094997064/pulses/2857121347
---

## The idea

Add a privacy notice and terms page so members know what they are agreeing to before they hand over Gmail access and pension data.

## Why it matters

Right now the login page (`app/[locale]/login/page.tsx`) presents a Google Sign-In button and an email/password form with zero disclosure. The Google OAuth consent screen at `lib/google-auth.ts:14-19` requests `gmail.readonly` and `drive.file` scopes — access to a member's full Gmail inbox for reading and Google Drive for writing. This is an unusually powerful permission set, and no explanation appears in the product before the member clicks.

**What חוק הגנת הפרטיות requires (s.11, as amended):** Before collecting personal data, the data controller must inform the subject of: the purpose of collection, whether disclosure is required by law or voluntary, and who will receive the data. We do not do any of this.

**What Google's OAuth API policies require:** Apps requesting sensitive scopes (`gmail.readonly` is a restricted scope) must have a publicly accessible privacy policy linked from the consent screen. If we do not have one, we are out of compliance with Google's own terms, which creates an independent risk of OAuth app suspension — which would immediately break the Gmail ingestion pipeline for all users.

**The brand-trust angle:** PensionView holds more sensitive financial data than most consumer apps. A member who is even slightly skeptical will look for a privacy policy before connecting Gmail. Finding none is the kind of thing that stops a signup cold — and correctly so, from the member's perspective.

**What the login page lacks today:**
- No link to a privacy notice
- No link to terms of use
- No explanation of what "connect Gmail" means or why
- The Gmail connect flow in Settings (`connectGmail()` in `app/[locale]/(app)/settings/page.tsx:86`) has no pre-click disclosure

## How it might work

- Create `/[locale]/privacy` — a simple, plain-Hebrew (and English) privacy notice covering: what data we collect, why (pension tracking), who processes it (Supabase/Vercel/Anthropic as sub-processors), retention periods, member rights (access, correction, deletion), contact for requests. This page does not need to be a legal document — it needs to be honest and readable.
- Create `/[locale]/terms` — minimal terms of use: the product is an information tool (reinforces the advisor disclosure pitch), not a licensed financial service; the member is responsible for their own financial decisions; how to contact us.
- Add footer links to both pages on the login page.
- Add a one-line pre-click disclosure before the Gmail connect button in Settings: "Connecting Gmail lets PensionView read emails from pension providers to import your reports automatically. We do not access other emails." Link to the privacy page.
- Register the privacy page URL in the Google OAuth consent screen configuration.

## What we don't know

- Whether the privacy notice needs legal review before publication — given it is the first public-facing disclosure, a legal-counsel read would be prudent (escalation: Out-of-scope if we need external Israeli privacy counsel).
- Sub-processor disclosure: Anthropic receives full pension data snapshots on every AI advisor query. Members should know this. Whether "Anthropic (AI processing)" in the sub-processors list is sufficient, or whether we need explicit consent, depends on the data categories involved.
- Whether a cookie notice is needed — the product sets Supabase auth cookies (functional, no consent needed under most interpretations) but this should be stated.

## Domain review

<!-- Each reviewer appends: -->
<!-- - reviewer-name: LGTM | CONCERNS: <reasoning> | VETO: <reasoning> -->
