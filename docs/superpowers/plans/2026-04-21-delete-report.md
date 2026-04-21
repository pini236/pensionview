# Delete Report Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permanently delete a single report and everything extracted from it — DB rows (via existing `ON DELETE CASCADE`), Supabase Storage objects, and the original PDF in the user's Google Drive — with a confirmation dialog reachable from both the reports list and the report detail page.

**Architecture:** Single synchronous `DELETE /api/reports/[id]` route, modeled on `app/api/members/[id]/route.ts`. Order of operations: auth → ownership check → best-effort Drive delete → best-effort Storage cleanup → DB delete (cascade). Frontend reuses the modal pattern from `MemberFormModal` and a new `danger` Button variant.

**Tech Stack:** Next.js 16 App Router, Supabase (admin client + Storage), `googleapis` Drive v3, vitest + @testing-library/react, next-intl, motion/react, lucide-react.

**Spec:** `docs/superpowers/specs/2026-04-21-delete-report-design.md`

---

## File map

**New:**
- `lib/google-drive.ts` — `deleteDriveFile()` helper
- `app/api/reports/[id]/route.ts` — DELETE handler
- `components/reports/DeleteReportDialog.tsx`
- `components/reports/ReportRowActions.tsx`
- `__tests__/lib/google-drive.test.ts`
- `__tests__/api/reports/delete.test.ts`
- `__tests__/components/reports/DeleteReportDialog.test.tsx`

**Modified:**
- `components/ui/Button.tsx` — add `danger` variant
- `app/globals.css` — add `--color-danger` token (light + dark)
- `messages/en.json`, `messages/he.json` — add `reports.delete.*` keys
- `app/[locale]/(app)/reports/page.tsx` — restructure each row to embed `<ReportRowActions>`
- `app/[locale]/(app)/reports/[id]/ReportDetail.tsx` — add trash trigger + dialog mount

---

## Task 0: Verify clean baseline

**Files:** none

- [ ] **Step 1: Run the test suite**

Run: `npm test`
Expected: 4 test files pass, 20 tests pass.

- [ ] **Step 2: Confirm working tree is clean**

Run: `git status`
Expected: `nothing to commit, working tree clean` on branch `feature/delete-report`.

If anything is dirty or red, stop and resolve before proceeding.

---

## Task 1: Add `--color-danger` token + Button `danger` variant

**Files:**
- Modify: `app/globals.css`
- Modify: `components/ui/Button.tsx`

This is a tiny visual change with no useful unit-test surface; verified in Task 9 manual flow.

- [ ] **Step 1: Add the danger token to both color blocks in `app/globals.css`**

Find the dark-theme block (where `--color-loss: #F59E0B;` lives) and add directly after it:

```css
  --color-danger: #EF4444;
```

Find the light-theme block (where `--color-loss: #D97706;` lives) and add directly after it:

```css
  --color-danger: #DC2626;
```

- [ ] **Step 2: Add the `danger` variant to `components/ui/Button.tsx`**

Update the `ButtonProps` variant union:

```tsx
variant?: "primary" | "secondary" | "ghost" | "danger";
```

Add a danger entry to the `variants` map (mirror the structure of `primary` — gradient + readable text):

```tsx
const variants: Record<NonNullable<ButtonProps["variant"]>, string> = {
  primary: "bg-gradient-to-br from-cta to-[#16a34a] text-background hover:opacity-95",
  secondary: "bg-surface text-text-primary hover:bg-surface-hover",
  ghost: "text-text-muted hover:text-text-primary hover:bg-surface",
  danger: "bg-gradient-to-br from-danger to-[#B91C1C] text-white hover:opacity-95",
};
```

- [ ] **Step 3: Run typecheck and lint**

Run: `npm run lint`
Expected: no errors.

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add app/globals.css components/ui/Button.tsx
git commit -m "feat(ui): add danger Button variant + --color-danger token"
```

---

## Task 2: Build `deleteDriveFile()` helper (TDD)

**Files:**
- Create: `lib/google-drive.ts`
- Test: `__tests__/lib/google-drive.test.ts`

The helper is a pure function with all I/O behind injectable mocks (the `googleapis` SDK and the encryption helper). All five classification branches are covered.

- [ ] **Step 1: Write the failing test file**

Create `__tests__/lib/google-drive.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock googleapis — single shared `filesDelete` we configure per test.
const filesDelete = vi.fn();
vi.mock("googleapis", () => ({
  google: {
    drive: () => ({ files: { delete: filesDelete } }),
  },
}));

// OAuth2 client just needs setCredentials — return a stub.
vi.mock("@/lib/google-auth", () => ({
  getGoogleOAuth2Client: () => ({ setCredentials: vi.fn() }),
}));

// Decrypt is identity for the tests.
vi.mock("@/lib/crypto", () => ({
  decrypt: (s: string) => s,
}));

// Import AFTER the mocks so the SUT picks them up.
import { deleteDriveFile } from "@/lib/google-drive";

const PROFILE_WITH_TOKENS = {
  google_access_token: "access",
  google_refresh_token: "refresh",
};

const PROFILE_NO_TOKENS = {
  google_access_token: null,
  google_refresh_token: null,
};

beforeEach(() => {
  filesDelete.mockReset();
});

describe("deleteDriveFile", () => {
  it("returns skipped:no_file_id when fileId is null", async () => {
    const result = await deleteDriveFile(null, PROFILE_WITH_TOKENS);
    expect(result).toEqual({ kind: "skipped", reason: "no_file_id" });
    expect(filesDelete).not.toHaveBeenCalled();
  });

  it("returns skipped:no_google_tokens when access token is missing", async () => {
    const result = await deleteDriveFile("file-1", PROFILE_NO_TOKENS);
    expect(result).toEqual({ kind: "skipped", reason: "no_google_tokens" });
    expect(filesDelete).not.toHaveBeenCalled();
  });

  it("returns deleted on Drive success", async () => {
    filesDelete.mockResolvedValue({});
    const result = await deleteDriveFile("file-1", PROFILE_WITH_TOKENS);
    expect(result).toEqual({ kind: "deleted" });
    expect(filesDelete).toHaveBeenCalledWith({ fileId: "file-1" });
  });

  it("returns missing on Drive 404", async () => {
    const err = Object.assign(new Error("Not Found"), {
      code: 404,
    });
    filesDelete.mockRejectedValue(err);
    const result = await deleteDriveFile("file-1", PROFILE_WITH_TOKENS);
    expect(result).toEqual({ kind: "missing" });
  });

  it("returns failed with driveUrl on other Drive errors", async () => {
    filesDelete.mockRejectedValue(new Error("rate limit"));
    const result = await deleteDriveFile("file-1", PROFILE_WITH_TOKENS);
    expect(result).toMatchObject({
      kind: "failed",
      driveUrl: "https://drive.google.com/file/d/file-1/view",
    });
    if (result.kind === "failed") {
      expect(result.error).toMatch(/rate limit/);
    }
  });
});
```

- [ ] **Step 2: Run the failing test**

Run: `npm test -- __tests__/lib/google-drive.test.ts`
Expected: FAIL with "Cannot find module '@/lib/google-drive'" (or similar).

- [ ] **Step 3: Create the helper**

Create `lib/google-drive.ts`:

```ts
import { google } from "googleapis";
import { getGoogleOAuth2Client } from "@/lib/google-auth";
import { decrypt } from "@/lib/crypto";

export type DriveDeleteResult =
  | { kind: "deleted" }
  | { kind: "missing" }
  | { kind: "skipped"; reason: "no_file_id" | "no_google_tokens" }
  | { kind: "failed"; driveUrl: string; error: string };

interface ProfileTokens {
  google_access_token: string | null;
  google_refresh_token: string | null;
}

function driveWebUrl(fileId: string): string {
  return `https://drive.google.com/file/d/${fileId}/view`;
}

/**
 * Best-effort Google Drive file deletion.
 *
 * Never throws. Caller switches on `result.kind` to decide UX.
 *
 * - `deleted`              → Drive API call succeeded
 * - `missing`              → Drive returned 404 (already gone — idempotent success)
 * - `skipped:no_file_id`   → no `drive_file_id` on the report
 * - `skipped:no_google_tokens` → profile has no Google access token
 * - `failed`               → any other error (auth, network, permission, 5xx).
 *                            `driveUrl` lets the caller surface a manual-cleanup link.
 */
export async function deleteDriveFile(
  fileId: string | null,
  profile: ProfileTokens
): Promise<DriveDeleteResult> {
  if (!fileId) {
    return { kind: "skipped", reason: "no_file_id" };
  }
  if (!profile.google_access_token) {
    return { kind: "skipped", reason: "no_google_tokens" };
  }

  const key = process.env.ENCRYPTION_KEY;
  if (!key) {
    return {
      kind: "failed",
      driveUrl: driveWebUrl(fileId),
      error: "ENCRYPTION_KEY missing",
    };
  }

  try {
    const oauth2Client = getGoogleOAuth2Client();
    oauth2Client.setCredentials({
      access_token: decrypt(profile.google_access_token, key),
      refresh_token: profile.google_refresh_token
        ? decrypt(profile.google_refresh_token, key)
        : undefined,
    });

    const drive = google.drive({ version: "v3", auth: oauth2Client });
    await drive.files.delete({ fileId });
    return { kind: "deleted" };
  } catch (err) {
    const code = (err as { code?: number | string }).code;
    if (code === 404 || code === "404") {
      return { kind: "missing" };
    }
    return {
      kind: "failed",
      driveUrl: driveWebUrl(fileId),
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
```

- [ ] **Step 4: Run the test — expect all 5 to pass**

Run: `npm test -- __tests__/lib/google-drive.test.ts`
Expected: 5 passed.

- [ ] **Step 5: Run the full suite**

Run: `npm test`
Expected: 5 test files pass, 25 tests pass.

- [ ] **Step 6: Commit**

```bash
git add lib/google-drive.ts __tests__/lib/google-drive.test.ts
git commit -m "feat(lib): add deleteDriveFile() best-effort helper"
```

---

## Task 3: Build `DELETE /api/reports/[id]` route (TDD)

**Files:**
- Create: `app/api/reports/[id]/route.ts`
- Test: `__tests__/api/reports/delete.test.ts`

Tests mock `createServerSupabase` (auth), `createAdminClient` (queries + storage), and `deleteDriveFile`. The route file contains the storage cleanup as a private function; no separate file.

- [ ] **Step 1: Write the failing route test**

Create `__tests__/api/reports/delete.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ---- Mocks ----------------------------------------------------------------
const getUser = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabase: () =>
    Promise.resolve({ auth: { getUser } }),
}));

// Tiny chainable query builder factory for `from(...).select/eq/in/single`.
function makeQuery(result: { data: unknown; error: unknown }) {
  const q: Record<string, unknown> = {
    select: vi.fn(() => q),
    eq: vi.fn(() => q),
    in: vi.fn(() => q),
    is: vi.fn(() => q),
    maybeSingle: vi.fn(() => Promise.resolve(result)),
    single: vi.fn(() => Promise.resolve(result)),
    delete: vi.fn(() => q),
  };
  return q;
}

// Storage stub — list() returns whatever we set; remove() is a spy.
const storageList = vi.fn();
const storageRemove = vi.fn();

const adminFrom = vi.fn();
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: adminFrom,
    storage: {
      from: () => ({
        list: storageList,
        remove: storageRemove,
      }),
    },
  }),
}));

const deleteDriveFile = vi.fn();
vi.mock("@/lib/google-drive", () => ({
  deleteDriveFile: (...args: unknown[]) => deleteDriveFile(...args),
}));

// Import AFTER mocks
import { DELETE } from "@/app/api/reports/[id]/route";

const REPORT_ID = "rep-1";
const PROFILE_ID = "prof-1";
const SELF_PROFILE_ID = "self-1";
const HOUSEHOLD_ID = "house-1";

function makeReq() {
  return new NextRequest(`http://localhost/api/reports/${REPORT_ID}`, {
    method: "DELETE",
  });
}

function setAuthedUser(email = "user@example.com") {
  getUser.mockResolvedValue({ data: { user: { email } } });
}

function setSelfProfile() {
  // First admin.from("profiles") call resolves the self-profile lookup
  return makeQuery({
    data: { id: SELF_PROFILE_ID, household_id: HOUSEHOLD_ID },
    error: null,
  });
}

function setHouseholdMembers() {
  // Second admin.from("profiles") call lists household member ids
  return makeQuery({
    data: [{ id: PROFILE_ID }, { id: SELF_PROFILE_ID }],
    error: null,
  });
}

function setReport(opts: { drive_file_id?: string | null } = {}) {
  return makeQuery({
    data: {
      id: REPORT_ID,
      profile_id: PROFILE_ID,
      report_date: "2026-04-01",
      drive_file_id: opts.drive_file_id ?? "drive-1",
      profile: {
        google_access_token: "tok",
        google_refresh_token: "ref",
      },
    },
    error: null,
  });
}

function setDeleteOk() {
  return makeQuery({ data: null, error: null });
}

beforeEach(() => {
  getUser.mockReset();
  adminFrom.mockReset();
  storageList.mockReset();
  storageRemove.mockReset();
  deleteDriveFile.mockReset();
  storageList.mockResolvedValue({ data: [], error: null });
  storageRemove.mockResolvedValue({ data: [], error: null });
});

describe("DELETE /api/reports/[id]", () => {
  it("returns 401 when no user", async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    const res = await DELETE(makeReq(), { params: Promise.resolve({ id: REPORT_ID }) });
    expect(res.status).toBe(401);
  });

  it("returns 404 when report is not in caller's household", async () => {
    setAuthedUser();
    adminFrom
      .mockReturnValueOnce(setSelfProfile())
      .mockReturnValueOnce(setHouseholdMembers())
      .mockReturnValueOnce(makeQuery({ data: null, error: null })); // report select → null
    const res = await DELETE(makeReq(), { params: Promise.resolve({ id: REPORT_ID }) });
    expect(res.status).toBe(404);
  });

  it("happy path returns ok + drive: deleted and runs cleanup in order", async () => {
    setAuthedUser();
    deleteDriveFile.mockResolvedValue({ kind: "deleted" });
    storageList
      .mockResolvedValueOnce({ data: [{ name: "decrypted.pdf" }], error: null })
      .mockResolvedValueOnce({ data: [{ name: "page_1.json" }], error: null });
    const reportQ = setReport();
    const deleteQ = setDeleteOk();
    adminFrom
      .mockReturnValueOnce(setSelfProfile())
      .mockReturnValueOnce(setHouseholdMembers())
      .mockReturnValueOnce(reportQ)
      .mockReturnValueOnce(deleteQ);

    const res = await DELETE(makeReq(), { params: Promise.resolve({ id: REPORT_ID }) });
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body).toEqual({ ok: true, drive: "deleted" });

    // Drive call shape
    expect(deleteDriveFile).toHaveBeenCalledWith("drive-1", {
      google_access_token: "tok",
      google_refresh_token: "ref",
    });
    // Storage cleanup invoked the right paths
    expect(storageRemove).toHaveBeenCalledWith([
      `${PROFILE_ID}/2026-04-01/decrypted.pdf`,
      `${PROFILE_ID}/extractions/${REPORT_ID}/page_1.json`,
    ]);
    // DB delete invoked
    expect(deleteQ.delete).toHaveBeenCalled();
  });

  it("returns drive: failed with driveUrl when Drive deletion fails", async () => {
    setAuthedUser();
    deleteDriveFile.mockResolvedValue({
      kind: "failed",
      driveUrl: "https://drive.google.com/file/d/drive-1/view",
      error: "rate limit",
    });
    adminFrom
      .mockReturnValueOnce(setSelfProfile())
      .mockReturnValueOnce(setHouseholdMembers())
      .mockReturnValueOnce(setReport())
      .mockReturnValueOnce(setDeleteOk());

    const res = await DELETE(makeReq(), { params: Promise.resolve({ id: REPORT_ID }) });
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body).toEqual({
      ok: true,
      drive: "failed",
      driveUrl: "https://drive.google.com/file/d/drive-1/view",
    });
  });

  it("storage list/remove failure does not abort the DB delete", async () => {
    setAuthedUser();
    deleteDriveFile.mockResolvedValue({ kind: "deleted" });
    storageList.mockResolvedValue({ data: null, error: { message: "boom" } });
    const deleteQ = setDeleteOk();
    adminFrom
      .mockReturnValueOnce(setSelfProfile())
      .mockReturnValueOnce(setHouseholdMembers())
      .mockReturnValueOnce(setReport())
      .mockReturnValueOnce(deleteQ);

    const res = await DELETE(makeReq(), { params: Promise.resolve({ id: REPORT_ID }) });
    expect(res.status).toBe(200);
    expect(deleteQ.delete).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the failing test**

Run: `npm test -- __tests__/api/reports/delete.test.ts`
Expected: FAIL with "Cannot find module '@/app/api/reports/[id]/route'".

- [ ] **Step 3: Create the route file**

Create `app/api/reports/[id]/route.ts`:

```ts
// =============================================================================
// PensionView — Report deletion API
//   DELETE /api/reports/[id]
//
// Order: auth → ownership → Drive (best-effort) → Storage (best-effort) → DB.
// DB CASCADE wipes report_summary, savings_products, insurance_products
// (→ insurance_coverages), report_insights, processing_queue.
// =============================================================================

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { deleteDriveFile, type DriveDeleteResult } from "@/lib/google-drive";

interface CallerContext {
  email: string;
  selfProfileId: string;
  householdId: string;
}

async function getCallerContext(): Promise<
  | { ok: true; ctx: CallerContext }
  | { ok: false; status: number; error: string }
> {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) return { ok: false, status: 401, error: "Not authenticated" };

  const admin = createAdminClient();
  const { data: self } = await admin
    .from("profiles")
    .select("id, household_id")
    .eq("email", user.email)
    .eq("is_self", true)
    .is("deleted_at", null)
    .maybeSingle();

  if (!self) {
    return {
      ok: false,
      status: 403,
      error: "No self profile for caller; backfill not run?",
    };
  }
  return {
    ok: true,
    ctx: {
      email: user.email,
      selfProfileId: self.id,
      householdId: self.household_id,
    },
  };
}

async function getHouseholdMemberIds(
  admin: ReturnType<typeof createAdminClient>,
  householdId: string
): Promise<string[]> {
  const { data } = await admin
    .from("profiles")
    .select("id")
    .eq("household_id", householdId)
    .is("deleted_at", null);
  return (data ?? []).map((p) => p.id as string);
}

interface ReportRow {
  id: string;
  profile_id: string;
  report_date: string;
  drive_file_id: string | null;
  profile: {
    google_access_token: string | null;
    google_refresh_token: string | null;
  };
}

async function loadOwnedReport(
  admin: ReturnType<typeof createAdminClient>,
  reportId: string,
  householdMemberIds: string[]
): Promise<ReportRow | null> {
  const { data } = await admin
    .from("reports")
    .select(
      "id, profile_id, report_date, drive_file_id, profile:profiles(google_access_token, google_refresh_token)"
    )
    .eq("id", reportId)
    .in("profile_id", householdMemberIds)
    .maybeSingle();
  return (data as ReportRow | null) ?? null;
}

/**
 * Lists every object under both report-owned prefixes and removes them
 * in a single batch. Storage failures never abort the DB delete — the
 * worst case is a few orphan objects, which is recoverable.
 */
async function cleanupStorage(
  admin: ReturnType<typeof createAdminClient>,
  profileId: string,
  reportDate: string,
  reportId: string
): Promise<void> {
  const datePrefix = `${profileId}/${reportDate}`;
  const extractionsPrefix = `${profileId}/extractions/${reportId}`;

  const [dateList, extractionsList] = await Promise.all([
    admin.storage.from("reports").list(datePrefix, { limit: 100 }),
    admin.storage.from("reports").list(extractionsPrefix, { limit: 200 }),
  ]);

  const paths: string[] = [];
  for (const entry of dateList.data ?? []) {
    paths.push(`${datePrefix}/${entry.name}`);
  }
  for (const entry of extractionsList.data ?? []) {
    paths.push(`${extractionsPrefix}/${entry.name}`);
  }

  if (paths.length === 0) return;

  const { error } = await admin.storage.from("reports").remove(paths);
  if (error) {
    // Log but do not throw. The report-row delete still proceeds; orphan
    // storage objects are a recoverable degradation.
    console.warn(
      `[reports/delete] storage cleanup partial for report ${reportId}: ${error.message}`
    );
  }
}

interface DeleteResponseBody {
  ok: true;
  drive: DriveDeleteResult["kind"];
  driveUrl?: string;
}

export async function DELETE(
  _request: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;

  const auth = await getCallerContext();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const admin = createAdminClient();
  const householdMemberIds = await getHouseholdMemberIds(
    admin,
    auth.ctx.householdId
  );

  const report = await loadOwnedReport(admin, id, householdMemberIds);
  if (!report) {
    // Don't leak existence of other households' reports.
    return NextResponse.json({ error: "Report not found" }, { status: 404 });
  }

  // 1. Drive (best-effort, never throws)
  const driveResult = await deleteDriveFile(report.drive_file_id, report.profile);

  // 2. Storage (best-effort)
  await cleanupStorage(admin, report.profile_id, report.report_date, report.id);

  // 3. DB (CASCADE wipes everything extracted)
  const { error: dbError } = await admin
    .from("reports")
    .delete()
    .eq("id", id);

  if (dbError) {
    return NextResponse.json(
      { error: dbError.message },
      { status: 500 }
    );
  }

  const body: DeleteResponseBody = { ok: true, drive: driveResult.kind };
  if (driveResult.kind === "failed") {
    body.driveUrl = driveResult.driveUrl;
  }
  return NextResponse.json(body, { status: 200 });
}
```

- [ ] **Step 4: Run the route test — expect all 5 to pass**

Run: `npm test -- __tests__/api/reports/delete.test.ts`
Expected: 5 passed.

- [ ] **Step 5: Run the full suite**

Run: `npm test`
Expected: 6 test files, 30 tests, all green.

- [ ] **Step 6: Run typecheck and lint**

Run: `npx tsc --noEmit`
Expected: no errors.

Run: `npm run lint`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add app/api/reports/[id]/route.ts __tests__/api/reports/delete.test.ts
git commit -m "feat(api): DELETE /api/reports/[id] with Drive + Storage cleanup"
```

---

## Task 4: Add `reports.delete.*` i18n keys

**Files:**
- Modify: `messages/en.json`
- Modify: `messages/he.json`

- [ ] **Step 1: Add the English block to `messages/en.json` under `reports`**

Inside the `reports` object (after `tableHeaders`), insert a new `delete` key:

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

Make sure the preceding key has a trailing comma.

- [ ] **Step 2: Add the matching Hebrew block to `messages/he.json` under `reports`**

```json
"delete": {
  "trigger": "מחק דוח",
  "title": "למחוק את הדוח הזה?",
  "body": "הפעולה תסיר לצמיתות את הדוח ואת כל הנתונים שחולצו ממנו. לא ניתן לבטל פעולה זו.",
  "cancel": "ביטול",
  "confirm": "מחק",
  "submitting": "מוחק...",
  "successTitle": "הדוח נמחק",
  "driveFailedBody": "לא הצלחנו להסיר את הקובץ מ-Google Drive שלך. ניתן למחוק אותו ידנית:",
  "openInDrive": "פתח ב-Drive",
  "done": "סיום",
  "errorGeneric": "לא ניתן היה למחוק את הדוח. נסה שוב."
}
```

- [ ] **Step 3: Verify the JSON is valid**

Run: `node -e "JSON.parse(require('fs').readFileSync('messages/en.json','utf8'));JSON.parse(require('fs').readFileSync('messages/he.json','utf8'));console.log('ok')"`
Expected: `ok`.

- [ ] **Step 4: Run typecheck (next-intl will fail if a key is referenced and missing later)**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add messages/en.json messages/he.json
git commit -m "i18n(reports): add delete-dialog strings for en + he"
```

---

## Task 5: Build `DeleteReportDialog` component

**Files:**
- Create: `components/reports/DeleteReportDialog.tsx`
- Test: `__tests__/components/reports/DeleteReportDialog.test.tsx`

Owns its API call, two visual states, and inline error handling. Uses next-intl for strings.

- [ ] **Step 1: Write the failing component test**

Create `__tests__/components/reports/DeleteReportDialog.test.tsx`:

```tsx
import type React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { NextIntlClientProvider } from "next-intl";

import { DeleteReportDialog } from "@/components/reports/DeleteReportDialog";

// Minimal locale messages — enough for the dialog.
const messages = {
  reports: {
    delete: {
      trigger: "Delete report",
      title: "Delete this report?",
      body: "Permanent.",
      cancel: "Cancel",
      confirm: "Delete",
      submitting: "Deleting...",
      successTitle: "Report deleted",
      driveFailedBody: "Drive failed.",
      openInDrive: "Open in Drive",
      done: "Done",
      errorGeneric: "Could not delete report. Please try again.",
    },
  },
};

function renderDialog(props: Partial<React.ComponentProps<typeof DeleteReportDialog>> = {}) {
  const onClose = vi.fn();
  const onDeleted = vi.fn();
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <DeleteReportDialog
        reportId="rep-1"
        reportDate="2026-04-01"
        totalSavings={1234567}
        ownerName={null}
        onClose={onClose}
        onDeleted={onDeleted}
        {...props}
      />
    </NextIntlClientProvider>
  );
  return { onClose, onDeleted };
}

beforeEach(() => {
  // Fresh fetch mock per test
  global.fetch = vi.fn() as unknown as typeof fetch;
});

describe("DeleteReportDialog", () => {
  it("renders the confirm state with title and body", () => {
    renderDialog();
    expect(screen.getByText("Delete this report?")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Delete" })).toBeInTheDocument();
  });

  it("calls onClose when Cancel is clicked", () => {
    const { onClose } = renderDialog();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onClose).toHaveBeenCalled();
  });

  it("calls DELETE /api/reports/[id] and fires onDeleted when drive=deleted", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ ok: true, drive: "deleted" }),
    });
    const { onDeleted, onClose } = renderDialog();
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith("/api/reports/rep-1", {
        method: "DELETE",
      });
    });
    await waitFor(() => {
      expect(onDeleted).toHaveBeenCalled();
      expect(onClose).toHaveBeenCalled();
    });
  });

  it("transitions to drive-failed state when drive=failed", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        ok: true,
        drive: "failed",
        driveUrl: "https://drive.google.com/file/d/drive-1/view",
      }),
    });
    const { onDeleted } = renderDialog();
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    await waitFor(() =>
      expect(screen.getByText("Report deleted")).toBeInTheDocument()
    );
    const link = screen.getByRole("link", { name: "Open in Drive" });
    expect(link).toHaveAttribute(
      "href",
      "https://drive.google.com/file/d/drive-1/view"
    );
    // onDeleted not yet — only fires on Done click
    expect(onDeleted).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    await waitFor(() => expect(onDeleted).toHaveBeenCalled());
  });

  it("shows generic error and re-enables Delete on 500", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ error: "boom" }),
    });
    renderDialog();
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    await waitFor(() =>
      expect(
        screen.getByText("Could not delete report. Please try again.")
      ).toBeInTheDocument()
    );
    expect(screen.getByRole("button", { name: "Delete" })).not.toBeDisabled();
  });
});
```

- [ ] **Step 2: Run the failing test**

Run: `npm test -- __tests__/components/reports/DeleteReportDialog.test.tsx`
Expected: FAIL with "Cannot find module '@/components/reports/DeleteReportDialog'".

- [ ] **Step 3: Create the dialog component**

Create `components/reports/DeleteReportDialog.tsx`:

```tsx
"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { motion, AnimatePresence } from "motion/react";
import { ExternalLink, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { formatCurrency } from "@/lib/format";

type Phase = "confirm" | "drive_failed" | "submitting";

interface DeleteReportDialogProps {
  reportId: string;
  reportDate: string;
  totalSavings: number;
  ownerName?: string | null;
  onClose: () => void;
  onDeleted?: () => void;
}

export function DeleteReportDialog({
  reportId,
  reportDate,
  totalSavings,
  ownerName,
  onClose,
  onDeleted,
}: DeleteReportDialogProps) {
  const t = useTranslations("reports.delete");
  const locale = useLocale();
  const fullLocale = locale === "he" ? "he-IL" : "en-IL";
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement | null>(null);

  const [phase, setPhase] = useState<Phase>("confirm");
  const [error, setError] = useState<string | null>(null);
  const [driveUrl, setDriveUrl] = useState<string | null>(null);

  // Esc to close
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && phase !== "submitting") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose, phase]);

  // Lock body scroll while open
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  const dateLabel = new Date(reportDate).toLocaleDateString(fullLocale, {
    month: "long",
    year: "numeric",
  });

  async function handleConfirm() {
    setError(null);
    setPhase("submitting");
    try {
      const res = await fetch(`/api/reports/${reportId}`, { method: "DELETE" });
      // 404 is treated as success — the report is already gone from someone's POV.
      if (res.status === 404) {
        onDeleted?.();
        onClose();
        return;
      }
      if (!res.ok) {
        setPhase("confirm");
        setError(t("errorGeneric"));
        return;
      }
      const body = (await res.json()) as {
        ok: true;
        drive: "deleted" | "missing" | "skipped" | "failed";
        driveUrl?: string;
      };
      if (body.drive === "failed" && body.driveUrl) {
        setDriveUrl(body.driveUrl);
        setPhase("drive_failed");
        return;
      }
      onDeleted?.();
      onClose();
    } catch {
      setPhase("confirm");
      setError(t("errorGeneric"));
    }
  }

  function handleDriveFailedDone() {
    onDeleted?.();
    onClose();
  }

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.15 }}
        className="fixed inset-0 z-[100] flex items-end justify-center bg-black/60 p-0 backdrop-blur-sm sm:items-center sm:p-4"
        onClick={(e) => {
          if (e.target === e.currentTarget && phase !== "submitting") onClose();
        }}
      >
        <motion.div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          initial={{ y: 20, opacity: 0, scale: 0.98 }}
          animate={{ y: 0, opacity: 1, scale: 1 }}
          exit={{ y: 20, opacity: 0, scale: 0.98 }}
          transition={{ duration: 0.2, ease: [0.32, 0.72, 0, 1] }}
          className="flex w-full max-h-[90vh] max-w-md flex-col overflow-hidden rounded-t-2xl bg-surface shadow-2xl sm:rounded-2xl"
        >
          <div className="flex flex-shrink-0 items-center justify-between border-b border-background/40 p-6 pb-4">
            <h2
              id={titleId}
              className="text-lg font-semibold text-text-primary"
            >
              {phase === "drive_failed" ? t("successTitle") : t("title")}
            </h2>
            <button
              type="button"
              onClick={onClose}
              disabled={phase === "submitting"}
              aria-label={t("cancel")}
              className="flex h-8 w-8 items-center justify-center rounded-full text-text-muted transition-colors hover:bg-surface-hover hover:text-text-primary cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <X size={16} />
            </button>
          </div>

          <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-6">
            {phase !== "drive_failed" && (
              <>
                <p className="text-sm text-text-muted">{t("body")}</p>
                <div className="rounded-lg bg-background p-4">
                  <p className="text-sm font-medium text-text-primary">
                    {dateLabel}
                    {ownerName ? ` · ${ownerName}` : ""}
                  </p>
                  <p className="mt-1 text-sm text-text-muted">
                    <bdi>{formatCurrency(totalSavings, fullLocale)}</bdi>
                  </p>
                </div>
                {error && (
                  <p className="text-sm text-loss" role="alert">
                    {error}
                  </p>
                )}
              </>
            )}

            {phase === "drive_failed" && driveUrl && (
              <>
                <p className="text-sm text-text-muted">{t("driveFailedBody")}</p>
                <a
                  href={driveUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 rounded-lg bg-background px-3 py-2 text-sm font-medium text-text-primary hover:bg-surface-hover"
                >
                  <ExternalLink size={14} />
                  {t("openInDrive")}
                </a>
              </>
            )}
          </div>

          <div className="flex flex-shrink-0 items-center justify-end gap-2 border-t border-background/40 p-6 pt-4">
            {phase === "drive_failed" ? (
              <Button type="button" variant="primary" onClick={handleDriveFailedDone}>
                {t("done")}
              </Button>
            ) : (
              <>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={onClose}
                  disabled={phase === "submitting"}
                >
                  {t("cancel")}
                </Button>
                <Button
                  type="button"
                  variant="danger"
                  onClick={handleConfirm}
                  disabled={phase === "submitting"}
                >
                  {phase === "submitting" ? t("submitting") : t("confirm")}
                </Button>
              </>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
```

- [ ] **Step 4: Run the test — expect all 5 to pass**

Run: `npm test -- __tests__/components/reports/DeleteReportDialog.test.tsx`
Expected: 5 passed.

- [ ] **Step 5: Run the full suite + typecheck + lint**

Run: `npm test`
Expected: 7 test files, 35 tests, all green.

Run: `npx tsc --noEmit`
Expected: no errors.

Run: `npm run lint`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add components/reports/DeleteReportDialog.tsx __tests__/components/reports/DeleteReportDialog.test.tsx
git commit -m "feat(reports): add DeleteReportDialog component"
```

---

## Task 6: Build `ReportRowActions` component

**Files:**
- Create: `components/reports/ReportRowActions.tsx`

Tiny client component — owns the dialog open/close state and renders a trash icon trigger. After successful delete, calls `router.refresh()` to re-render the server-rendered list.

- [ ] **Step 1: Create the file**

Create `components/reports/ReportRowActions.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { DeleteReportDialog } from "./DeleteReportDialog";

interface ReportRowActionsProps {
  reportId: string;
  reportDate: string;
  totalSavings: number;
  ownerName?: string | null;
}

export function ReportRowActions({
  reportId,
  reportDate,
  totalSavings,
  ownerName,
}: ReportRowActionsProps) {
  const t = useTranslations("reports.delete");
  const router = useRouter();
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen(true);
        }}
        aria-label={t("trigger")}
        className="me-2 flex h-9 w-9 items-center justify-center rounded-full text-text-muted opacity-50 transition-all hover:bg-surface-hover hover:text-text-primary hover:opacity-100 sm:opacity-100 cursor-pointer"
      >
        <Trash2 size={16} />
      </button>
      {open && (
        <DeleteReportDialog
          reportId={reportId}
          reportDate={reportDate}
          totalSavings={totalSavings}
          ownerName={ownerName}
          onClose={() => setOpen(false)}
          onDeleted={() => router.refresh()}
        />
      )}
    </>
  );
}
```

Note on the opacity: `opacity-50` default + `hover:opacity-100` on the button. We rely on the parent `group` pattern only if the parent row uses `group`; for now keep the button independently visible on mobile (`sm:opacity-100`).

- [ ] **Step 2: Run typecheck and lint**

Run: `npx tsc --noEmit`
Expected: no errors.

Run: `npm run lint`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add components/reports/ReportRowActions.tsx
git commit -m "feat(reports): add ReportRowActions trigger component"
```

---

## Task 7: Wire `ReportRowActions` into the reports list page

**Files:**
- Modify: `app/[locale]/(app)/reports/page.tsx`

Restructure each row from a single `<Link>` into a `<div>` containing the `<Link>` (nav) and `<ReportRowActions>` (delete). No nested interactives.

- [ ] **Step 1: Add the import**

In `app/[locale]/(app)/reports/page.tsx`, add to the imports block:

```ts
import { ReportRowActions } from "@/components/reports/ReportRowActions";
```

- [ ] **Step 2: Replace the row JSX**

Find the existing `grouped[year]!.map((report) => { ... })` block. Replace the returned `<Link>` with this structure:

```tsx
return (
  <div
    key={report.id}
    className="group flex items-center gap-2 rounded-lg bg-surface transition-colors hover:bg-surface-hover"
  >
    <Link
      href={`/${locale}/reports/${report.id}`}
      className="flex flex-1 items-center justify-between gap-3 p-4 cursor-pointer"
    >
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-text-primary">
          {new Date(report.report_date).toLocaleDateString(
            fullLocale,
            { month: "long", year: "numeric" }
          )}
        </p>
        {isCombined && reportMember && (
          <p className="mt-0.5 text-xs text-text-muted">
            {reportMember.name}
          </p>
        )}
      </div>
      <div className="flex items-center gap-3">
        <p className="text-sm font-medium text-text-primary">
          <bdi>{formatCurrency(total, fullLocale)}</bdi>
        </p>
        {isCombined && reportMember && (
          <MemberAvatar member={reportMember} size="sm" />
        )}
      </div>
    </Link>
    <ReportRowActions
      reportId={report.id}
      reportDate={report.report_date}
      totalSavings={total}
      ownerName={isCombined ? reportMember?.name ?? null : null}
    />
  </div>
);
```

The wrapping `<div>` carries the row's hover background. The `<Link>` stretches across the row content; `<ReportRowActions>` sits as a sibling so the trash button is its own click target.

- [ ] **Step 3: Run typecheck and lint**

Run: `npx tsc --noEmit`
Expected: no errors.

Run: `npm run lint`
Expected: no errors.

- [ ] **Step 4: Run the full suite (regression check)**

Run: `npm test`
Expected: still 35 passing.

- [ ] **Step 5: Commit**

```bash
git add "app/[locale]/(app)/reports/page.tsx"
git commit -m "feat(reports): wire delete trigger into reports list rows"
```

---

## Task 8: Wire delete trigger + dialog into `ReportDetail`

**Files:**
- Modify: `app/[locale]/(app)/reports/[id]/ReportDetail.tsx`

Add a trash icon at the top-right of the date/total card. Same dialog component. After successful delete, navigate back to the list.

- [ ] **Step 1: Add the imports**

At the top of `ReportDetail.tsx`, add:

```tsx
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { DeleteReportDialog } from "@/components/reports/DeleteReportDialog";
```

The `useState` import already exists.

- [ ] **Step 2: Add an `id` prop to the component**

Update the `ReportDetailProps` interface:

```tsx
interface ReportDetailProps {
  reportId: string;
  reportDate: string;
  locale: string;
  summary: ReportSummary | null;
  savings: SavingsProduct[];
  insurance: InsuranceWithCoverages[];
  ownerMember?: Member | null;
}
```

Update the function signature destructuring to include `reportId`.

- [ ] **Step 3: Add the dialog state + trash button + dialog mount**

Inside the `ReportDetail` function, after the existing `useState` for `tab`, add:

```tsx
const router = useRouter();
const [deleteOpen, setDeleteOpen] = useState(false);
```

Replace the existing date/total card block:

```tsx
<div className="rounded-xl bg-surface p-6">
  <p className="text-sm text-text-muted">{dateLabel}</p>
  <p className="mt-1 text-2xl font-medium text-text-primary">
    <bdi>{formatCurrency(summary?.total_savings ?? 0, fullLocale)}</bdi>
  </p>
</div>
```

with:

```tsx
<div className="rounded-xl bg-surface p-6">
  <div className="flex items-start justify-between gap-3">
    <div>
      <p className="text-sm text-text-muted">{dateLabel}</p>
      <p className="mt-1 text-2xl font-medium text-text-primary">
        <bdi>{formatCurrency(summary?.total_savings ?? 0, fullLocale)}</bdi>
      </p>
    </div>
    <button
      type="button"
      onClick={() => setDeleteOpen(true)}
      aria-label={t("delete.trigger")}
      className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full text-text-muted transition-colors hover:bg-surface-hover hover:text-text-primary cursor-pointer"
    >
      <Trash2 size={16} />
    </button>
  </div>
</div>
{deleteOpen && (
  <DeleteReportDialog
    reportId={reportId}
    reportDate={reportDate}
    totalSavings={summary?.total_savings ?? 0}
    ownerName={ownerMember?.name ?? null}
    onClose={() => setDeleteOpen(false)}
    onDeleted={() => router.push(`/${locale}/reports`)}
  />
)}
```

- [ ] **Step 4: Update the page that renders this component to pass `reportId`**

In `app/[locale]/(app)/reports/[id]/page.tsx`, find the `<ReportDetail ...>` call and add `reportId={report.id}` to the props:

```tsx
<ReportDetail
  reportId={report.id}
  reportDate={report.report_date}
  locale={locale}
  summary={summary}
  savings={savings || []}
  insurance={insurance || []}
  ownerMember={ownerMember}
/>
```

- [ ] **Step 5: Run typecheck and lint**

Run: `npx tsc --noEmit`
Expected: no errors.

Run: `npm run lint`
Expected: no errors.

- [ ] **Step 6: Run the full suite (regression check)**

Run: `npm test`
Expected: still 35 passing.

- [ ] **Step 7: Commit**

```bash
git add "app/[locale]/(app)/reports/[id]/ReportDetail.tsx" "app/[locale]/(app)/reports/[id]/page.tsx"
git commit -m "feat(reports): add delete trigger to report detail page"
```

---

## Task 9: Manual verification on the dev server

**Files:** none

Tests verify the units; this verifies the actual flow. The codebase convention for UI work is hands-on browser verification.

- [ ] **Step 1: Start the dev server**

Run: `npm run dev`
Wait for the "Ready" line.

- [ ] **Step 2: Sign in and navigate to `/reports`**

Open `http://localhost:3000/en/reports` (or `/he/reports`) in the browser. Confirm:
- Each report row shows a trash icon at the end
- Hovering a row keeps the row hover state intact
- Clicking the trash icon opens the dialog without navigating to the report detail page

- [ ] **Step 3: Verify the dialog content**

The dialog should show:
- Title "Delete this report?" (or Hebrew equivalent)
- Body text explaining the action is permanent
- A summary card with the report month, the owner name (in family-mode `?member=all`), and the total savings
- "Cancel" and "Delete" buttons (Delete styled red/danger)

- [ ] **Step 4: Test cancel paths**

- Click "Cancel" → dialog closes, report still in the list
- Reopen, press Esc → dialog closes
- Reopen, click outside the dialog → dialog closes

- [ ] **Step 5: Pick a non-precious test report and delete it**

Click "Delete". Verify:
- Button shows "Deleting..." briefly
- Dialog closes on success
- Report disappears from the list (router.refresh fired)
- The Drive copy is gone (check the user's `PensionView` Drive folder if you have access)

- [ ] **Step 6: Drill into a different report's detail page**

Navigate to `/reports/<id>` for a remaining test report. Confirm:
- A trash icon sits at the top-right of the date/total card
- Clicking it opens the same dialog
- Confirming the delete redirects back to `/reports`

- [ ] **Step 7: Smoke-test the Drive-failed branch (optional, if reproducible)**

If you can simulate a Drive failure (e.g., temporarily revoke Drive permission in your Google account), trigger a delete and verify:
- The dialog transitions to "Report deleted" state
- An "Open in Drive" link is rendered with the correct URL
- Clicking "Done" closes the dialog and navigates/refreshes as appropriate

If not reproducible: note as "drive-failed UI verified by component test only" and move on.

- [ ] **Step 8: Stop the dev server (Ctrl-C)**

- [ ] **Step 9: Final regression check**

Run: `npm test`
Expected: all green.

Run: `npx tsc --noEmit && npm run lint`
Expected: no errors.

- [ ] **Step 10: Confirm git status is clean**

Run: `git status`
Expected: working tree clean. All work is committed across the previous tasks.
