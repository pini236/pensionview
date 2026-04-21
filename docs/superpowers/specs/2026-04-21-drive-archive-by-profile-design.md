# Drive Archive — Organize by Profile

**Date:** 2026-04-21
**Author:** Pini + Claude
**Status:** Draft, awaiting Pini approval
**Branch:** `feature/drive-archive-by-profile`

---

## 1. Context

Every PensionView report PDF is supposed to land in the user's Google Drive — both manually-uploaded reports (`/api/pipeline/backfill`) and Gmail-pulled reports (`/api/webhooks/gmail`). Both flows feed the same processing pipeline, which includes a `upload_drive` step at `app/api/pipeline/upload-drive/route.ts`.

The Drive integration is wired (OAuth `drive.file` scope, `googleapis` SDK, pipeline step exists, `reports.drive_file_id` column exists), but three gaps remain:

1. **No per-person organization.** Every PDF is dropped without a parent folder, so files land at the user's Drive root with name `PensionView-<report_date>.pdf`. With family mode (one household, many profiles), spouse/child reports get mixed in with self reports in a flat list.
2. **Spouse/child reports never reach Drive.** The step reads `report.profile.google_access_token`, but only the `is_self=true` profile populates Google credentials. Reports owned by non-self profiles silently skip the upload (line 30–33 of `upload-drive/route.ts`).
3. **No root folder is ever created.** `profile.google_drive_folder_id` is read but never written — the OAuth callback (`app/api/auth/google/callback/route.ts`) only stores tokens. The existing code falls back to no `parents` field, dumping files in the Drive root.

## 2. Goals & non-goals

**Goals**

- Lazily create a `PensionView` root folder in the user's Drive on first upload, persist its ID to the self profile's `google_drive_folder_id`.
- Place each report in a per-profile subfolder of that root: `PensionView/<profile.name>/<file>.pdf`.
- Archive reports for **all** household members, not just the self profile, using the self profile's Google credentials.
- Self-heal: if the user manually deletes/renames the root or any subfolder, the next upload re-creates it under the original name.
- No new schema, no new OAuth scopes, no new dependencies.

**Non-goals (v1)**

- No per-month subfolders. Flat: `<root>/<profile.name>/<file>.pdf`.
- No backfill of reports already uploaded to the flat root. New uploads only.
- No migration of files already sitting at the root — they stay where they are.
- No UI for managing the folder structure. Drive is the source of truth for folder layout once created.
- No persisted subfolder ID cache. Lookup-by-name on every upload.

## 3. Architecture decisions

| # | Decision | Rationale |
|---|---|---|
| D1 | Always use the **self profile's** Google credentials and `google_drive_folder_id`, regardless of which profile owns the report | Fixes the silent-skip gap for spouse/child reports. Only one Google account per household. |
| D2 | Resolve the per-profile subfolder by **lookup-by-name on every upload** (`drive.files.list`, create if missing) | No new schema. Self-healing. Perf is a non-issue (~1 extra Drive call per upload, reports come in at human pace). |
| D3 | Folder name = `profile.name`, sanitized (trim + collapse internal whitespace). Fallback `Profile-<short-id>` if name is empty | Drive accepts almost any character; minimal sanitization avoids surprises. |
| D4 | Filename stays `PensionView-<report_date>.pdf` | Self-identifying when downloaded; matches existing convention; uniqueness is already guaranteed by DB unique constraint `(profile_id, report_date)`. |
| D5 | Skip silently (existing behavior) if the self profile has no Google token connected | Preserves current pipeline contract — Drive archival is best-effort, not a hard pipeline dependency. |
| D6 | If the self profile has no `google_drive_folder_id`, **lazily create** a `PensionView` root folder in the user's Drive root on first upload, then persist the ID to the self profile | Same self-healing pattern as the per-profile subfolders. Avoids touching the OAuth callback (separate code path, separate failure modes). |
| D7 | Extract Drive upload logic into a small helper module (`lib/drive/archive.ts`) so the pipeline route stays thin | Pipeline routes should be HTTP plumbing; folder resolution + retry logic belongs in a unit-testable helper. |

## 4. Components

### 4.1 `lib/drive/archive.ts` (new)

Pure module, no Next.js coupling. Exports three functions:

```ts
// Resolve (or create) a folder by name under a given parent.
// Used both for the household root (parent='root') and for per-profile subfolders.
async function resolveFolder(opts: {
  drive: drive_v3.Drive;
  parentFolderId: string;  // 'root' for the user's Drive root
  folderName: string;
}): Promise<string>;

// Upload a PDF buffer to a specific Drive folder, return the new file ID.
async function uploadPdfToFolder(opts: {
  drive: drive_v3.Drive;
  parentFolderId: string;
  filename: string;
  buffer: Buffer;
}): Promise<string>;

// Sanitize a profile name for use as a folder name.
// Trims, collapses internal whitespace; falls back to "Profile-<short-id>" if empty.
function profileFolderName(profileName: string | null, profileId: string): string;
```

`resolveFolder` queries `drive.files.list` with:

```
q: name='<sanitized>' and '<parentFolderId>' in parents
   and mimeType='application/vnd.google-apps.folder'
   and trashed=false
```

If a match is found, return its ID. If not, create the folder via `drive.files.create` with `mimeType='application/vnd.google-apps.folder'` and return the new ID.

The pipeline route uses `resolveFolder` twice in sequence: once with `parent='root'` and `name='PensionView'` to get the household root, then again with that ID as parent and `profileFolderName(...)` as name to get the per-profile subfolder.

### 4.2 `app/api/pipeline/upload-drive/route.ts` (modified)

The pipeline route changes shape but keeps the same input/output contract (POST with `?reportId=...&pageCount=...`). New flow:

1. Load the `report` with its owner profile (existing).
2. Look up the **self profile** in the same household (`select * from profiles where household_id = <owner.household_id> and is_self = true and deleted_at is null`).
3. If the self profile has no `google_access_token` → skip silently, advance pipeline, return `{ ok: true, skipped: "no Google token on self profile" }`.
4. Build OAuth client from the self profile's tokens.
5. Resolve the household root folder ID:
   - If `selfProfile.google_drive_folder_id` is set, use it directly.
   - Otherwise call `resolveFolder({ parent: 'root', name: 'PensionView' })`, then persist the returned ID to `selfProfile.google_drive_folder_id` so subsequent uploads skip the lookup.
6. Resolve the per-profile subfolder ID via `resolveFolder({ parent: <root>, name: profileFolderName(owner.name, owner.id) })`.
7. Upload the PDF via `uploadPdfToFolder`.
8. Persist `drive_file_id` to the report (existing behavior).
9. Advance the pipeline (existing behavior).

### 4.3 No DB migration

No schema changes. The existing `profiles.google_drive_folder_id` continues to mean "household root folder" (set on the self profile). No `google_drive_subfolder_id` column.

## 5. Data flow

```
Manual upload  ─┐
                ├─► reports row created with profile_id (any household member)
Gmail webhook ─┘                                    │
                                                    ▼
                          processing pipeline (decrypt → upload_drive → extract...)
                                                    │
                                                    ▼
                                           upload_drive step
                                                    │
                                                    ▼
                          Look up self profile in same household
                                                    │
                                                    ▼
                          Self has Google credentials?
                                  │           │
                                 yes         no  ──► skip, advance pipeline
                                  │
                                  ▼
                Resolve PensionView root  (use cached ID, or lookup/create + persist)
                                  │
                                  ▼
                Resolve PensionView/<owner.name>/  (lookup or create)
                                  │
                                  ▼
                Upload PDF, persist drive_file_id, advance pipeline
```

## 6. Failure modes

| Case | Behavior | Notes |
|---|---|---|
| Self profile has no Google token | Skip, advance pipeline, return `skipped: "no Google token on self profile"` | Same as today. Drive archive is best-effort. |
| Self profile has no `google_drive_folder_id` (first upload ever) | Lazily create `PensionView` folder in Drive root, persist ID to self profile, continue | Path through D6. Happens once per household. |
| Self profile's stored root folder ID points to a deleted folder | `drive.files.create` (subfolder under deleted parent) returns 404 → step fails via existing `failQueue` path | Acceptable. Operator/user can clear `google_drive_folder_id` to trigger re-creation, or reconnect Google. Out-of-scope to auto-recover. |
| Owner profile's `name` is empty | Use `Profile-<short-id>` (first 8 chars of profile.id) | Edge case, shouldn't happen in normal product usage. |
| Two profiles in the same household share a name (e.g., two children both named "Yossi") | Both get the same subfolder. Files inside are still uniquely named by date. | Edge case. If it bites, add `<name>-<short-id>` later. Not worth the friction now. |
| Drive API returns 401 (token expired) | `googleapis` auto-refreshes via the refresh token (existing behavior). | The OAuth client is constructed with both tokens; no change needed. |
| Drive API returns 5xx / network error | Step fails via existing `failQueue` path; pipeline retries via existing retry mechanism. | No new retry logic added. |

## 7. Testing

**Unit tests** for `lib/drive/archive.ts` (Vitest, mock `drive_v3.Drive`):

- `resolveFolder` returns existing folder ID when one match exists under the given parent.
- `resolveFolder` creates a new folder under the parent and returns the new ID when no match exists.
- `resolveFolder` works with `parent='root'` for the household root case.
- `profileFolderName` trims and collapses whitespace.
- `profileFolderName` falls back to `Profile-<first-8-chars-of-id>` when name is null/empty.
- `uploadPdfToFolder` calls `drive.files.create` with correct parents, mimeType, and body.

**Integration test** for the route (Vitest, mock Supabase admin client + `googleapis`):

- Skips when self profile has no Google token.
- For a report owned by a non-self profile, uses the self profile's tokens (regression test for the bug being fixed).
- When self profile has no `google_drive_folder_id`, creates the `PensionView` root and persists the ID back to the self profile.
- When self profile already has a `google_drive_folder_id`, skips the root lookup and uses it directly.
- Persists `drive_file_id` to the report on success.

**Manual verification** (after deploy to local dev):

- First upload after Google connect → `PensionView` folder is created in Drive root, ID is persisted on the self profile.
- Upload a self-owned report → file appears in `PensionView/<self.name>/`.
- Upload a spouse-owned report → file appears in `PensionView/<spouse.name>/`.
- Delete the spouse subfolder in Drive UI; upload another spouse report → subfolder is recreated.

## 8. Open questions

None. Ready to plan.

## 9. Out-of-scope follow-ups (not part of this spec)

- One-shot backfill script that re-files existing flat-root files into per-profile subfolders.
- Per-month subfolders (`<root>/<profile.name>/<YYYY-MM>/`) if folders get noisy.
- Settings UI to show "X reports archived in Drive" and a "Reconnect" button.
- Persisted subfolder ID cache (Approach B from brainstorming) if Drive lookup latency ever becomes a bottleneck.
- Audit Supabase write call sites in the pipeline routes — `update().eq()` results are routinely discarded across the pipeline. A failed DB write on `drive_file_id` (or other persistence steps) currently lands as a silent gap (file in Drive, no row link) instead of triggering pipeline retry. Codebase-wide cleanup, not specific to this feature.
- Idempotency on `upload_drive` retry — if `uploadPdfToFolder` succeeds but `triggerNextStep` fails, the pipeline retries this step and a duplicate file is uploaded. Cheap fix: gate the upload on `report.drive_file_id` being null. Acceptable per the "best-effort" framing; revisit if duplicates become visible to users.
