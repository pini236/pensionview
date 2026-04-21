# Drive Archive by Profile — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Place every uploaded report PDF into a per-profile subfolder of a `PensionView` root in the user's Google Drive, and fix a silent-skip bug where reports owned by non-self household profiles never reached Drive.

**Architecture:** Extract folder/upload logic into a pure helper module (`lib/drive/archive.ts`). Rewrite the existing pipeline step (`app/api/pipeline/upload-drive/route.ts`) to look up the household self profile, use its Google credentials regardless of report owner, lazily create the `PensionView` root folder on first upload, then resolve a per-profile subfolder by name (creating if missing) before uploading.

**Tech Stack:** Next.js 16 App Router (route handler), TypeScript, `googleapis` v171 (`drive_v3`), Supabase admin client, Vitest with `jsdom` env.

**Spec:** `docs/superpowers/specs/2026-04-21-drive-archive-by-profile-design.md`

---

## File Structure

| Path | Action | Responsibility |
|---|---|---|
| `lib/drive/archive.ts` | Create | Pure module: `resolveFolder`, `uploadPdfToFolder`, `profileFolderName`. No Next.js / Supabase coupling. |
| `__tests__/lib/drive/archive.test.ts` | Create | Unit tests for the helper, mocking only `drive_v3.Drive`. |
| `app/api/pipeline/upload-drive/route.ts` | Modify | Lookup self profile → use its credentials → resolve root → resolve subfolder → upload. |
| `__tests__/api/pipeline/upload-drive.test.ts` | Create | Integration tests for the route, mocking `googleapis`, Supabase admin, crypto, queue, and internal-auth helpers. |

The helper exists only because the route would otherwise grow into ~150 lines of Drive-specific logic mixed with HTTP plumbing. Three small functions in one file, ~80 LoC, easy to mock and read.

No DB migration. No new env vars. No new dependencies (`googleapis` already in `package.json`).

---

## Task 1: `profileFolderName` helper

**Files:**
- Create: `lib/drive/archive.ts`
- Test: `__tests__/lib/drive/archive.test.ts`

This is the simplest piece — a pure string function with no I/O. Establishing the helper module here lets the next two tasks add Drive-API functions to the same file.

- [ ] **Step 1: Write the failing test**

Create `__tests__/lib/drive/archive.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { profileFolderName } from "@/lib/drive/archive";

describe("profileFolderName", () => {
  it("returns the trimmed name when present", () => {
    expect(profileFolderName("  Pini  ", "id-1")).toBe("Pini");
  });

  it("collapses internal whitespace runs to a single space", () => {
    expect(profileFolderName("Yossi   Cohen", "id-1")).toBe("Yossi Cohen");
  });

  it("falls back to Profile-<first 8 chars of id> when name is null", () => {
    expect(profileFolderName(null, "abcdef0123456789-rest")).toBe("Profile-abcdef01");
  });

  it("falls back to Profile-<first 8 chars of id> when name is empty string", () => {
    expect(profileFolderName("", "abcdef0123456789-rest")).toBe("Profile-abcdef01");
  });

  it("falls back when name is whitespace only", () => {
    expect(profileFolderName("   \t  ", "abcdef0123456789-rest")).toBe("Profile-abcdef01");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- __tests__/lib/drive/archive.test.ts`
Expected: FAIL with module-not-found error for `@/lib/drive/archive`.

- [ ] **Step 3: Write minimal implementation**

Create `lib/drive/archive.ts`:

```ts
export function profileFolderName(profileName: string | null | undefined, profileId: string): string {
  const cleaned = (profileName ?? "").trim().replace(/\s+/g, " ");
  if (cleaned.length > 0) return cleaned;
  return `Profile-${profileId.slice(0, 8)}`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- __tests__/lib/drive/archive.test.ts`
Expected: PASS, 5/5 tests.

- [ ] **Step 5: Run full suite to confirm no regressions**

Run: `npm test`
Expected: PASS (25/25 — was 20, now +5).

- [ ] **Step 6: Commit**

```bash
git add lib/drive/archive.ts __tests__/lib/drive/archive.test.ts
git commit -m "feat(drive-archive): add profileFolderName helper"
```

---

## Task 2: `resolveFolder` helper

**Files:**
- Modify: `lib/drive/archive.ts`
- Modify: `__tests__/lib/drive/archive.test.ts`

Looks up a folder by name under a given parent. Creates it if not found. Used both for the household root (`parent='root'`) and for per-profile subfolders.

- [ ] **Step 1: Write the failing tests**

Append to `__tests__/lib/drive/archive.test.ts`:

```ts
import { vi } from "vitest";
import { resolveFolder } from "@/lib/drive/archive";
import type { drive_v3 } from "googleapis";

function fakeDrive(opts: {
  listResult?: { id: string; name: string }[];
  createId?: string;
}) {
  const list = vi.fn().mockResolvedValue({ data: { files: opts.listResult ?? [] } });
  const create = vi.fn().mockResolvedValue({ data: { id: opts.createId ?? "new-folder-id" } });
  return {
    drive: { files: { list, create } } as unknown as drive_v3.Drive,
    list,
    create,
  };
}

describe("resolveFolder", () => {
  it("returns the existing folder ID when one match exists", async () => {
    const { drive, list, create } = fakeDrive({ listResult: [{ id: "existing-id", name: "PensionView" }] });

    const id = await resolveFolder({ drive, parentFolderId: "root", folderName: "PensionView" });

    expect(id).toBe("existing-id");
    expect(create).not.toHaveBeenCalled();
    expect(list).toHaveBeenCalledOnce();
    const listArgs = list.mock.calls[0][0];
    expect(listArgs.q).toContain("name='PensionView'");
    expect(listArgs.q).toContain("'root' in parents");
    expect(listArgs.q).toContain("mimeType='application/vnd.google-apps.folder'");
    expect(listArgs.q).toContain("trashed=false");
  });

  it("creates a new folder under the parent when none exists", async () => {
    const { drive, create } = fakeDrive({ listResult: [], createId: "newly-made-id" });

    const id = await resolveFolder({ drive, parentFolderId: "root-id", folderName: "Pini" });

    expect(id).toBe("newly-made-id");
    expect(create).toHaveBeenCalledOnce();
    const createArgs = create.mock.calls[0][0];
    expect(createArgs.requestBody.name).toBe("Pini");
    expect(createArgs.requestBody.parents).toEqual(["root-id"]);
    expect(createArgs.requestBody.mimeType).toBe("application/vnd.google-apps.folder");
  });

  it("escapes single quotes in folder name to avoid breaking the query", async () => {
    const { drive, list } = fakeDrive({ listResult: [{ id: "x", name: "O'Brien" }] });

    await resolveFolder({ drive, parentFolderId: "root", folderName: "O'Brien" });

    const listArgs = list.mock.calls[0][0];
    expect(listArgs.q).toContain("name='O\\'Brien'");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- __tests__/lib/drive/archive.test.ts`
Expected: FAIL with import error for `resolveFolder`.

- [ ] **Step 3: Implement `resolveFolder`**

Append to `lib/drive/archive.ts`:

```ts
import type { drive_v3 } from "googleapis";

const FOLDER_MIME = "application/vnd.google-apps.folder";

function escapeDriveQueryValue(value: string): string {
  // Drive query language uses single-quoted strings; backslash-escape any internal single quotes.
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

export async function resolveFolder(opts: {
  drive: drive_v3.Drive;
  parentFolderId: string;
  folderName: string;
}): Promise<string> {
  const { drive, parentFolderId, folderName } = opts;
  const safeName = escapeDriveQueryValue(folderName);
  const safeParent = escapeDriveQueryValue(parentFolderId);

  const listResp = await drive.files.list({
    q: `name='${safeName}' and '${safeParent}' in parents and mimeType='${FOLDER_MIME}' and trashed=false`,
    fields: "files(id,name)",
    pageSize: 1,
  });

  const existing = listResp.data.files?.[0];
  if (existing?.id) return existing.id;

  const createResp = await drive.files.create({
    requestBody: {
      name: folderName,
      mimeType: FOLDER_MIME,
      parents: [parentFolderId],
    },
    fields: "id",
  });

  if (!createResp.data.id) {
    throw new Error("Drive returned no ID for created folder");
  }
  return createResp.data.id;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- __tests__/lib/drive/archive.test.ts`
Expected: PASS, 8/8 tests (5 previous + 3 new).

- [ ] **Step 5: Commit**

```bash
git add lib/drive/archive.ts __tests__/lib/drive/archive.test.ts
git commit -m "feat(drive-archive): add resolveFolder helper with single-quote escaping"
```

---

## Task 3: `uploadPdfToFolder` helper

**Files:**
- Modify: `lib/drive/archive.ts`
- Modify: `__tests__/lib/drive/archive.test.ts`

Uploads a PDF buffer to a specific folder.

- [ ] **Step 1: Write the failing test**

Append to `__tests__/lib/drive/archive.test.ts`:

```ts
import { uploadPdfToFolder } from "@/lib/drive/archive";

describe("uploadPdfToFolder", () => {
  it("calls drive.files.create with PDF mime, name, parent, and stream body", async () => {
    const create = vi.fn().mockResolvedValue({ data: { id: "uploaded-file-id" } });
    const drive = { files: { create } } as unknown as drive_v3.Drive;

    const id = await uploadPdfToFolder({
      drive,
      parentFolderId: "subfolder-id",
      filename: "PensionView-2026-04-21.pdf",
      buffer: Buffer.from("hello pdf"),
    });

    expect(id).toBe("uploaded-file-id");
    expect(create).toHaveBeenCalledOnce();
    const args = create.mock.calls[0][0];
    expect(args.requestBody.name).toBe("PensionView-2026-04-21.pdf");
    expect(args.requestBody.parents).toEqual(["subfolder-id"]);
    expect(args.media.mimeType).toBe("application/pdf");
    expect(args.media.body).toBeDefined(); // Readable stream
    expect(args.fields).toBe("id");
  });

  it("throws when Drive returns no file ID", async () => {
    const create = vi.fn().mockResolvedValue({ data: {} });
    const drive = { files: { create } } as unknown as drive_v3.Drive;

    await expect(
      uploadPdfToFolder({
        drive,
        parentFolderId: "subfolder-id",
        filename: "x.pdf",
        buffer: Buffer.from(""),
      })
    ).rejects.toThrow(/no ID/i);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- __tests__/lib/drive/archive.test.ts`
Expected: FAIL with import error for `uploadPdfToFolder`.

- [ ] **Step 3: Implement `uploadPdfToFolder`**

Append to `lib/drive/archive.ts`:

```ts
import { Readable } from "stream";

export async function uploadPdfToFolder(opts: {
  drive: drive_v3.Drive;
  parentFolderId: string;
  filename: string;
  buffer: Buffer;
}): Promise<string> {
  const { drive, parentFolderId, filename, buffer } = opts;
  const resp = await drive.files.create({
    requestBody: {
      name: filename,
      parents: [parentFolderId],
    },
    media: {
      mimeType: "application/pdf",
      body: Readable.from(buffer),
    },
    fields: "id",
  });
  if (!resp.data.id) {
    throw new Error("Drive returned no ID for uploaded file");
  }
  return resp.data.id;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- __tests__/lib/drive/archive.test.ts`
Expected: PASS, 10/10 tests.

- [ ] **Step 5: Run full suite**

Run: `npm test`
Expected: PASS (30/30 — was 20, now +10 from this helper).

- [ ] **Step 6: Commit**

```bash
git add lib/drive/archive.ts __tests__/lib/drive/archive.test.ts
git commit -m "feat(drive-archive): add uploadPdfToFolder helper"
```

---

## Task 4: Rewrite the `upload_drive` pipeline route

**Files:**
- Modify: `app/api/pipeline/upload-drive/route.ts`
- Create: `__tests__/api/pipeline/upload-drive.test.ts`

The route now:
1. Looks up the self profile in the report owner's household.
2. Uses the **self profile's** tokens (regardless of report owner — the bug fix).
3. Lazily creates a `PensionView` root folder if `selfProfile.google_drive_folder_id` is null, persists the new ID.
4. Resolves a per-profile subfolder named after the report owner.
5. Uploads, persists `drive_file_id`, advances the pipeline.

This task uses TDD: write each integration test, run it (fails), update the route, run it (passes), then move to the next test. Commit at the end of the task.

The mocking surface is large — read all of Step 1 before starting so you understand the shared setup.

- [ ] **Step 1: Create the integration test file with shared mocks and the first failing test**

Create `__tests__/api/pipeline/upload-drive.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------- Mocks ----------
vi.mock("@/lib/auth-internal", () => ({
  assertInternalRequest: vi.fn(() => null), // null = authorized
}));

vi.mock("@/lib/crypto", () => ({
  decrypt: vi.fn((v: string) => `decrypted:${v}`),
}));

vi.mock("@/lib/google-auth", () => ({
  getGoogleOAuth2Client: vi.fn(() => ({
    setCredentials: vi.fn(),
  })),
}));

const triggerNextStep = vi.fn();
const failQueue = vi.fn();
vi.mock("@/lib/pipeline/queue", () => ({
  triggerNextStep: (...args: unknown[]) => triggerNextStep(...args),
  failQueue: (...args: unknown[]) => failQueue(...args),
}));

const driveFilesList = vi.fn();
const driveFilesCreate = vi.fn();
vi.mock("googleapis", () => ({
  google: {
    drive: vi.fn(() => ({
      files: { list: driveFilesList, create: driveFilesCreate },
    })),
  },
}));

// Supabase admin client mock — chainable builder + storage download
const reportRow = {
  id: "report-id",
  report_date: "2026-04-21",
  decrypted_pdf_url: "decrypted/path.pdf",
  profile: {
    id: "owner-id",
    name: "Miri",
    household_id: "house-1",
    is_self: false,
  },
};

let selfProfileRow: Record<string, unknown> | null = null;
let updatedProfile: Record<string, unknown> | null = null;
let updatedReport: Record<string, unknown> | null = null;

const downloadResult = { data: { arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer } };

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      if (table === "reports") {
        return {
          select: () => ({
            eq: () => ({
              single: async () => ({ data: reportRow }),
            }),
          }),
          update: (patch: Record<string, unknown>) => ({
            eq: async () => {
              updatedReport = patch;
              return { error: null };
            },
          }),
        };
      }
      if (table === "profiles") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                is: () => ({
                  maybeSingle: async () => ({ data: selfProfileRow }),
                }),
              }),
            }),
          }),
          update: (patch: Record<string, unknown>) => ({
            eq: async () => {
              updatedProfile = patch;
              return { error: null };
            },
          }),
        };
      }
      throw new Error(`Unexpected table: ${table}`);
    },
    storage: {
      from: () => ({ download: async () => downloadResult }),
    },
  }),
}));

// ---------- Helpers ----------
import { POST } from "@/app/api/pipeline/upload-drive/route";
import { NextRequest } from "next/server";

function makeRequest() {
  return new NextRequest("http://localhost/api/pipeline/upload-drive?reportId=report-id&pageCount=10", {
    method: "POST",
    headers: { "x-pipeline-secret": "irrelevant-mocked" },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  triggerNextStep.mockReset();
  failQueue.mockReset();
  driveFilesList.mockReset();
  driveFilesCreate.mockReset();
  selfProfileRow = null;
  updatedProfile = null;
  updatedReport = null;
});

// ---------- Test 1: skip when self profile has no token ----------
describe("upload-drive route", () => {
  it("skips silently and advances the pipeline when self profile has no Google token", async () => {
    selfProfileRow = {
      id: "self-id",
      google_access_token: null,
      google_refresh_token: null,
      google_drive_folder_id: null,
    };

    const res = await POST(makeRequest());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.skipped).toMatch(/no Google token/i);
    expect(driveFilesList).not.toHaveBeenCalled();
    expect(driveFilesCreate).not.toHaveBeenCalled();
    expect(triggerNextStep).toHaveBeenCalledWith("report-id", "upload_drive", 10);
    expect(failQueue).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the failing test to confirm the route doesn't yet meet the new contract**

Run: `npm test -- __tests__/api/pipeline/upload-drive.test.ts`
Expected: FAIL — the existing route reads `report.profile.google_access_token`, not the self profile, so it won't query the `profiles` table the way the test expects. The test will fail in the mock (`Unexpected table` won't fire, but `selfProfileRow` won't be consulted — instead the route looks at `reportRow.profile.google_access_token` which is undefined and triggers a different code path). Capture the actual error to confirm.

- [ ] **Step 3: Rewrite the route**

Replace the entire contents of `app/api/pipeline/upload-drive/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { google } from "googleapis";
import { createAdminClient } from "@/lib/supabase/admin";
import { decrypt } from "@/lib/crypto";
import { getGoogleOAuth2Client } from "@/lib/google-auth";
import { triggerNextStep, failQueue } from "@/lib/pipeline/queue";
import { assertInternalRequest } from "@/lib/auth-internal";
import { resolveFolder, uploadPdfToFolder, profileFolderName } from "@/lib/drive/archive";

const ROOT_FOLDER_NAME = "PensionView";

export async function POST(request: NextRequest) {
  const unauth = assertInternalRequest(request);
  if (unauth) return unauth;

  const { searchParams } = new URL(request.url);
  const reportId = searchParams.get("reportId")!;
  const pageCount = Number(searchParams.get("pageCount") || 10);

  try {
    const admin = createAdminClient();
    const key = process.env.ENCRYPTION_KEY!;

    const { data: report } = await admin
      .from("reports")
      .select("*, profile:profiles(*)")
      .eq("id", reportId)
      .single();

    if (!report) throw new Error("Report not found");
    const ownerProfile = report.profile;
    if (!ownerProfile) throw new Error("Report has no owner profile");

    // Always use the SELF profile's Google credentials, regardless of which
    // household member owns the report. Family member profiles never have
    // tokens of their own.
    const { data: selfProfile } = await admin
      .from("profiles")
      .select("*")
      .eq("household_id", ownerProfile.household_id)
      .eq("is_self", true)
      .is("deleted_at", null)
      .maybeSingle();

    if (!selfProfile?.google_access_token) {
      await triggerNextStep(reportId, "upload_drive", pageCount);
      return NextResponse.json({ ok: true, skipped: "no Google token on self profile" });
    }

    const { data: pdfData } = await admin.storage
      .from("reports")
      .download(report.decrypted_pdf_url!);
    if (!pdfData) throw new Error("Could not download decrypted PDF");

    const oauth2Client = getGoogleOAuth2Client();
    oauth2Client.setCredentials({
      access_token: decrypt(selfProfile.google_access_token, key),
      refresh_token: selfProfile.google_refresh_token
        ? decrypt(selfProfile.google_refresh_token, key)
        : undefined,
    });

    const drive = google.drive({ version: "v3", auth: oauth2Client });

    // Resolve household root: use cached ID if present, otherwise create
    // a "PensionView" folder under the user's Drive root and persist its ID.
    let rootFolderId = selfProfile.google_drive_folder_id as string | null;
    if (!rootFolderId) {
      rootFolderId = await resolveFolder({
        drive,
        parentFolderId: "root",
        folderName: ROOT_FOLDER_NAME,
      });
      await admin
        .from("profiles")
        .update({ google_drive_folder_id: rootFolderId })
        .eq("id", selfProfile.id);
    }

    // Resolve per-profile subfolder by name (lookup or create on every upload).
    const subfolderId = await resolveFolder({
      drive,
      parentFolderId: rootFolderId,
      folderName: profileFolderName(ownerProfile.name, ownerProfile.id),
    });

    const buffer = Buffer.from(await pdfData.arrayBuffer());
    const driveFileId = await uploadPdfToFolder({
      drive,
      parentFolderId: subfolderId,
      filename: `PensionView-${report.report_date}.pdf`,
      buffer,
    });

    await admin.from("reports").update({ drive_file_id: driveFileId }).eq("id", reportId);
    await triggerNextStep(reportId, "upload_drive", pageCount);
    return NextResponse.json({ ok: true, driveFileId });
  } catch (error) {
    await failQueue(reportId, "upload_drive", String(error));
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- __tests__/api/pipeline/upload-drive.test.ts`
Expected: PASS, 1/1 test.

- [ ] **Step 5: Add the "spouse report uses self credentials" test (the bug-fix regression test)**

Append inside the existing `describe("upload-drive route", ...)` block:

```ts
it("uses the self profile's tokens for a non-self report owner (regression: spouse report)", async () => {
  selfProfileRow = {
    id: "self-id",
    google_access_token: "enc-self-access",
    google_refresh_token: "enc-self-refresh",
    google_drive_folder_id: "root-folder-id",
  };
  // Subfolder lookup: not found → create
  driveFilesList.mockResolvedValueOnce({ data: { files: [] } });
  driveFilesCreate.mockResolvedValueOnce({ data: { id: "miri-folder-id" } });
  // PDF upload
  driveFilesCreate.mockResolvedValueOnce({ data: { id: "uploaded-file-id" } });

  const res = await POST(makeRequest());
  const body = await res.json();

  expect(res.status).toBe(200);
  expect(body.driveFileId).toBe("uploaded-file-id");
  expect(failQueue).not.toHaveBeenCalled();

  // Subfolder created under the cached root, named after the report owner ("Miri").
  const subfolderCreate = driveFilesCreate.mock.calls[0][0];
  expect(subfolderCreate.requestBody.name).toBe("Miri");
  expect(subfolderCreate.requestBody.parents).toEqual(["root-folder-id"]);
  expect(subfolderCreate.requestBody.mimeType).toBe("application/vnd.google-apps.folder");

  // Upload landed in the subfolder.
  const uploadCall = driveFilesCreate.mock.calls[1][0];
  expect(uploadCall.requestBody.name).toBe("PensionView-2026-04-21.pdf");
  expect(uploadCall.requestBody.parents).toEqual(["miri-folder-id"]);
  expect(uploadCall.media.mimeType).toBe("application/pdf");

  expect(updatedReport).toEqual({ drive_file_id: "uploaded-file-id" });
});
```

- [ ] **Step 6: Run and verify it passes**

Run: `npm test -- __tests__/api/pipeline/upload-drive.test.ts`
Expected: PASS, 2/2.

- [ ] **Step 7: Add the "lazy create root + persist" test**

Append inside the same `describe` block:

```ts
it("lazily creates the PensionView root folder and persists its ID when self profile has none", async () => {
  selfProfileRow = {
    id: "self-id",
    google_access_token: "enc-self-access",
    google_refresh_token: null,
    google_drive_folder_id: null, // no root yet
  };
  // Root lookup: not found → create
  driveFilesList.mockResolvedValueOnce({ data: { files: [] } });
  driveFilesCreate.mockResolvedValueOnce({ data: { id: "newly-made-root-id" } });
  // Subfolder lookup: not found → create
  driveFilesList.mockResolvedValueOnce({ data: { files: [] } });
  driveFilesCreate.mockResolvedValueOnce({ data: { id: "miri-folder-id" } });
  // Upload
  driveFilesCreate.mockResolvedValueOnce({ data: { id: "uploaded-file-id" } });

  const res = await POST(makeRequest());
  expect(res.status).toBe(200);

  // First create: PensionView root, parent='root'
  const rootCreate = driveFilesCreate.mock.calls[0][0];
  expect(rootCreate.requestBody.name).toBe("PensionView");
  expect(rootCreate.requestBody.parents).toEqual(["root"]);
  expect(rootCreate.requestBody.mimeType).toBe("application/vnd.google-apps.folder");

  // Self profile updated with the new root folder ID
  expect(updatedProfile).toEqual({ google_drive_folder_id: "newly-made-root-id" });

  // Subfolder created under the new root
  const subfolderCreate = driveFilesCreate.mock.calls[1][0];
  expect(subfolderCreate.requestBody.parents).toEqual(["newly-made-root-id"]);
});
```

- [ ] **Step 8: Run and verify it passes**

Run: `npm test -- __tests__/api/pipeline/upload-drive.test.ts`
Expected: PASS, 3/3.

- [ ] **Step 9: Add the "reuse cached root" test**

Append:

```ts
it("uses the cached root folder ID without an extra lookup when one is set", async () => {
  selfProfileRow = {
    id: "self-id",
    google_access_token: "enc-self-access",
    google_refresh_token: null,
    google_drive_folder_id: "cached-root-id",
  };
  // Subfolder lookup: found existing
  driveFilesList.mockResolvedValueOnce({ data: { files: [{ id: "miri-folder-id", name: "Miri" }] } });
  // Upload
  driveFilesCreate.mockResolvedValueOnce({ data: { id: "uploaded-file-id" } });

  const res = await POST(makeRequest());
  expect(res.status).toBe(200);

  // No root creation, no profile update.
  expect(updatedProfile).toBeNull();
  // Only one Drive list call (for the subfolder), no list for the root.
  expect(driveFilesList).toHaveBeenCalledOnce();
  // Only the upload create — no folder creates.
  expect(driveFilesCreate).toHaveBeenCalledOnce();
  expect(driveFilesCreate.mock.calls[0][0].media.mimeType).toBe("application/pdf");
});
```

- [ ] **Step 10: Run and verify it passes**

Run: `npm test -- __tests__/api/pipeline/upload-drive.test.ts`
Expected: PASS, 4/4.

- [ ] **Step 11: Add the "Drive failure routes through failQueue" test**

Append:

```ts
it("calls failQueue and returns 500 when Drive throws", async () => {
  selfProfileRow = {
    id: "self-id",
    google_access_token: "enc-self-access",
    google_refresh_token: null,
    google_drive_folder_id: "cached-root-id",
  };
  driveFilesList.mockRejectedValueOnce(new Error("Drive 503"));

  const res = await POST(makeRequest());
  expect(res.status).toBe(500);
  expect(failQueue).toHaveBeenCalledWith("report-id", "upload_drive", expect.stringContaining("Drive 503"));
  expect(triggerNextStep).not.toHaveBeenCalled();
});
```

- [ ] **Step 12: Run and verify it passes**

Run: `npm test -- __tests__/api/pipeline/upload-drive.test.ts`
Expected: PASS, 5/5.

- [ ] **Step 13: Run the full suite to confirm no regressions**

Run: `npm test`
Expected: PASS (35/35).

- [ ] **Step 14: Run lint and typecheck**

Run: `npm run lint`
Expected: clean. Fix any warnings before committing.

Run: `npx tsc --noEmit`
Expected: clean. Fix any errors before committing.

- [ ] **Step 15: Commit**

```bash
git add app/api/pipeline/upload-drive/route.ts __tests__/api/pipeline/upload-drive.test.ts
git commit -m "feat(drive-archive): organize uploads into per-profile subfolders

- Use self profile's Google credentials regardless of report owner
  (fixes silent skip for spouse/child reports).
- Lazily create PensionView root folder on first upload, persist ID.
- Resolve per-profile subfolder by name on every upload (self-healing).
- File path is now PensionView/<profile.name>/PensionView-<date>.pdf."
```

---

## Task 5: Manual smoke verification (local dev)

**Files:** none (verification only)

This task does not modify code. It verifies the feature works end-to-end against a real Google Drive. Skip if the executing agent cannot run a local dev server with real Google OAuth.

- [ ] **Step 1: Start dev server and connect Google**

Run: `npm run dev`

In a browser:
1. Sign in to the app.
2. Go to `/he/settings`, click "Connect Google" if not already connected.
3. Confirm OAuth flow completes and returns to settings with `connected=true`.

- [ ] **Step 2: Trigger a manual upload**

Upload a pension PDF via the app's manual upload flow. Wait for processing to reach the `upload_drive` step.

In Google Drive (drive.google.com), confirm:
- A `PensionView` folder exists at the root of My Drive.
- Inside it, a folder named after the self profile (e.g. "Pini").
- Inside that, a file named `PensionView-<date>.pdf`.

- [ ] **Step 3: Verify the self profile's `google_drive_folder_id` was persisted**

Open the Supabase SQL editor (or `psql`) and run:

```sql
select id, name, google_drive_folder_id
from profiles
where is_self = true and email = '<your-email>';
```

Expected: `google_drive_folder_id` is non-null.

- [ ] **Step 4: Verify spouse/child report archival (skip if no family member configured)**

If a spouse/child profile exists in your household, trigger an upload owned by that profile. Confirm the file lands in `PensionView/<spouse-name>/`.

- [ ] **Step 5: Verify self-healing**

Delete the spouse subfolder in the Drive UI. Trigger another spouse upload. Confirm the subfolder is recreated and the file lands in it.

- [ ] **Step 6: No commit needed**

Verification only.

---

## Done criteria

- All 35 tests pass (`npm test`).
- `npm run lint` and `npx tsc --noEmit` are clean.
- 4 commits on the feature branch (one per code task; no commit for Task 5).
- Manual smoke (Task 5) confirms the folder structure in the user's Drive.
