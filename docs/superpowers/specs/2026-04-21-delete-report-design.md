# Delete Report — Design Spec

**Date:** 2026-04-21
**Branch:** `feature/delete-report`
**Status:** Approved (brainstorm)

## Goal

Let a household member permanently delete one of their reports along with everything that was extracted from it: DB rows, Storage objects (PDFs + per-page extraction JSON), and the original PDF in their Google Drive.

This is the first slice of broader "manage reports" work. Scope here is intentionally narrow.

## Decisions

| # | Question | Decision |
|---|---|---|
| 1 | Soft delete or hard delete? | **Hard delete.** Source PDFs live in the user's Drive; the pipeline can re-extract if needed. |
| 2 | Where does the action live? | **Both surfaces** — list page (per-row trash icon) and detail page (top-right trash). |
| 3 | Confirmation UX | **Simple dialog** showing report identity (month + member + total). |
| 4 | Drive file: delete it too? | **Yes.** Use the user's stored OAuth tokens. |
| 5 | When Drive deletion fails | **Best-effort.** DB + Storage delete always commits. Return the Drive web URL so the user can clean up manually. |

## Architecture

### Data linkage (already exists)

Every extracted-data table references `reports(id)` with `ON DELETE CASCADE`:

- `report_summary`
- `savings_products`
- `insurance_products` → `insurance_coverages` (also CASCADE)
- `report_insights`
- `processing_queue`

A single `DELETE FROM reports WHERE id = ?` removes all extracted DB data.

### What CASCADE doesn't cover

- **Supabase Storage** under bucket `reports`:
  - `{profile_id}/{report_date}/decrypted.pdf` (and any other date-keyed artifacts)
  - `{profile_id}/extractions/{report_id}/page_*.json`
- **Google Drive** file referenced by `reports.drive_file_id` (uploaded by `app/api/pipeline/upload-drive/route.ts`)

Both must be cleaned up by the API route.

## API

### Endpoint

`DELETE /api/reports/[id]` — new file `app/api/reports/[id]/route.ts`. Modeled on `app/api/members/[id]/route.ts`.

### Request

No body.

### Response — success (200)

```json
{
  "ok": true,
  "drive": "deleted" | "missing" | "skipped" | "failed",
  "driveUrl": "https://drive.google.com/file/d/<id>/view"
}
```

`driveUrl` is present only when `drive === "failed"`.

`drive` values:
- `"deleted"` — Drive API call succeeded
- `"missing"` — Drive returned 404 (file already gone — treated as idempotent success)
- `"skipped"` — `drive_file_id` was null OR profile has no Google tokens
- `"failed"` — any other Drive error (auth, network, permission, 5xx)

### Errors

- `401` — not authenticated
- `403` — caller has no self profile (backfill not run)
- `404` — report not found OR not owned by caller's household (single response, don't leak existence)
- `500` — DB delete failed (rare; see "Order trade-off")

## Backend flow

```
DELETE /api/reports/[id]
  │
  ├─ 1. Auth        getCallerContext() → { selfProfileId, householdId } | error
  │
  ├─ 2. Ownership   admin.from("reports")
  │                   .select("id, profile_id, report_date, drive_file_id")
  │                   .eq("id", id)
  │                   .in("profile_id", householdMemberIds)
  │                 → 404 if not found
  │                 Also load profile.google_access_token / google_refresh_token
  │
  ├─ 3. Drive       deleteDriveFile(drive_file_id, profile)
  │                 → DriveDeleteResult (best-effort, never throws)
  │
  ├─ 4. Storage     cleanupStorage(admin, profile_id, report_date, report_id)
  │                 → list two prefixes, batch remove
  │                 errors logged, do not abort
  │
  └─ 5. DB          admin.from("reports").delete().eq("id", id)
                    CASCADE handles the rest
                    on failure → 500 (acknowledged trade-off)
```

### Order trade-off

DB last (rather than first):

| Scenario | Drive | Storage | DB | User-visible |
|---|---|---|---|---|
| All succeed | OK | OK | OK | Report gone, success toast |
| Drive fails | Fail | OK | OK | "Deleted — Drive copy still exists, [Open in Drive]" |
| Storage partial | OK | partial | OK | Report gone (orphans logged for ops) |
| DB fails | OK/skipped | OK | Fail | 500 — report still visible. Drive copy is gone. Retry: Drive returns missing, Storage returns empty list, DB delete retried. |

Why this order:
- DB-first would lose `drive_file_id` and storage paths on failure → un-cleanable orphans.
- Drive-first respects the Q5 decision (synchronous Drive failure → return URL to user).
- Postgres `delete by id` after a successful `select by id` is the most reliable step in the chain, so putting it last minimizes the bad-state window.

## New helper

**`lib/google-drive.ts`** — small new file, single export:

```ts
export type DriveDeleteResult =
  | { kind: "deleted" }
  | { kind: "missing" }
  | { kind: "skipped"; reason: "no_file_id" | "no_google_tokens" }
  | { kind: "failed"; driveUrl: string; error: string };

export async function deleteDriveFile(
  fileId: string | null,
  profile: { google_access_token: string | null; google_refresh_token: string | null }
): Promise<DriveDeleteResult>;
```

- Decrypts tokens with `ENCRYPTION_KEY` (matches `app/api/pipeline/upload-drive/route.ts`).
- Builds OAuth2 client via `getGoogleOAuth2Client()` + `setCredentials({ access_token, refresh_token })`.
- googleapis SDK auto-refreshes access tokens when refresh token is supplied.
- Calls `drive.files.delete({ fileId })`.
- 404 → `missing`. Other errors → `failed` with `driveUrl = https://drive.google.com/file/d/${fileId}/view`.

## Storage cleanup

Path convention (from migration 006):

- `{profile_id}/{report_date}/` — decrypted PDF and date-keyed artifacts
- `{profile_id}/extractions/{report_id}/` — page extraction JSON

Implementation:

```ts
async function cleanupStorage(
  admin: SupabaseAdminClient,
  profileId: string,
  reportDate: string,
  reportId: string
): Promise<{ removed: number; failed: number; errors: string[] }>;
```

- `admin.storage.from("reports").list(\`${profileId}/${reportDate}\`, { limit: 100 })` → collect names → prefix
- `admin.storage.from("reports").list(\`${profileId}/extractions/${reportId}\`, { limit: 200 })` → collect → prefix
- Single `admin.storage.from("reports").remove(allPaths)`
- Failures logged but never abort the DB delete

The `unique(profile_id, report_date)` constraint on `reports` guarantees a date directory belongs to exactly one report.

## Frontend

### New components

**`components/reports/DeleteReportDialog.tsx`** — client component, mirrors `MemberFormModal` pattern (motion overlay, rounded-2xl surface, Esc-to-close, body-scroll-lock).

Props:

```ts
{
  reportId: string;
  reportDate: string;
  totalSavings: number;
  ownerName?: string | null;
  onClose: () => void;
  onDeleted?: () => void;
}
```

Two states:

- **State A — confirm:** Title "Delete this report?". Body shows month + (owner name if present) + total. Ghost "Cancel" + danger "Delete".
- **State B — drive-failed warning** (only when API returns `drive: "failed"`): Title "Report deleted". Body explains Drive cleanup is needed; renders `driveUrl` as an external link (`lucide-react` `ExternalLink` icon). Single "Done" button. On dismiss: `onDeleted()` fires.

For other `drive` values (`deleted` / `missing` / `skipped`): close dialog and fire `onDeleted()` immediately.

**`components/reports/ReportRowActions.tsx`** — small client component, single trash icon button (`lucide-react Trash2`). Owns the dialog open/close state. Always visible on mobile; opacity-50 → 100 on parent row hover on desktop.

### Modified

**`app/[locale]/(app)/reports/page.tsx`** — restructure each row from a single `<Link>` to a `<div>` containing the `<Link>` (nav) + `<ReportRowActions>` (delete) as siblings. No nested interactives.

**`app/[locale]/(app)/reports/[id]/ReportDetail.tsx`** — add a trash icon trigger at the top-right of the date/total card. Same dialog component. `onDeleted` → `router.push(\`/${locale}/reports\`)`.

**`components/ui/Button.tsx`** — add a `danger` variant (red gradient consuming `--color-danger`).

**`app/globals.css`** — add `--color-danger` to both light and dark blocks (`#DC2626` light / `#EF4444` dark).

**`messages/en.json` and `messages/he.json`** — add under `reports`:

```json
"delete": {
  "trigger": "Delete report",
  "title": "Delete this report?",
  "body": "This permanently removes the report and all extracted data. This cannot be undone.",
  "cancel": "Cancel",
  "confirm": "Delete",
  "submitting": "Deleting...",
  "successTitle": "Report deleted",
  "driveFailedBody": "We couldn't remove the file from your Google Drive. You can delete it manually:",
  "openInDrive": "Open in Drive",
  "done": "Done",
  "errorGeneric": "Could not delete report. Please try again."
}
```

Hebrew mirrors with the same keys.

### Frontend error handling matrix

| API result | Dialog behavior |
|---|---|
| 200 + `drive: "deleted" \| "missing" \| "skipped"` | Close, fire `onDeleted` |
| 200 + `drive: "failed"` | Transition to State B with `driveUrl` |
| 401 / 403 | Show generic error inline; user clicks Cancel |
| 404 | Treat as success (idempotent) — close + fire `onDeleted` |
| 500 / network | Show generic error inline; "Delete" re-enables for retry |

## Testing

**Unit:**

- `__tests__/lib/google-drive.test.ts` — `deleteDriveFile()` classification: skipped (no fileId, no tokens), missing (404), failed (returns driveUrl), deleted (happy path). Mock googleapis.
- `__tests__/api/reports/delete.test.ts` — DELETE route handler:
  - 401 with no auth
  - 404 when report belongs to a different household
  - happy path — returns `{ ok, drive: "deleted" }`, verifies the admin client received the expected `delete().eq("id", ...)` call and `storage.remove([...paths])` call (mocked admin client via vitest `vi.mock`)
  - drive-failed — returns `driveUrl`
  - storage cleanup non-blocking — mocked storage failure still returns 200

**No new E2E tests in this slice.** No Playwright wired up. Manual verification on the dev server before shipping.

## Out of scope (future work)

- Bulk delete (multi-select on list page)
- Soft delete + trash + restore
- Suppressing re-import after Drive deletion (`deleted_drive_file_ids` table)
- Managing reports in non-`done` status (pending/processing/failed) — current list filters to `status='done'`, so this UI never reaches them
- Replacing/re-extracting a report (different feature)

## File touch list

**New:**
- `app/api/reports/[id]/route.ts`
- `lib/google-drive.ts`
- `components/reports/DeleteReportDialog.tsx`
- `components/reports/ReportRowActions.tsx`
- `__tests__/lib/google-drive.test.ts`
- `__tests__/api/reports/delete.test.ts`

**Modified:**
- `app/[locale]/(app)/reports/page.tsx`
- `app/[locale]/(app)/reports/[id]/ReportDetail.tsx`
- `components/ui/Button.tsx`
- `app/globals.css`
- `messages/en.json`
- `messages/he.json`
