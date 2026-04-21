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
          // NOTE: chain shape mirrors the route's exact query (.select.eq.eq.is.maybeSingle).
          // If you add/remove a filter in the route, update this chain or the test will break confusingly.
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

  it("skips when no self profile exists in the household", async () => {
    // selfProfileRow stays null (the beforeEach default) → maybeSingle returns { data: null }
    selfProfileRow = null;

    const res = await POST(makeRequest());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.skipped).toMatch(/no Google token/i);
    expect(driveFilesList).not.toHaveBeenCalled();
    expect(driveFilesCreate).not.toHaveBeenCalled();
    expect(triggerNextStep).toHaveBeenCalledWith("report-id", "upload_drive", 10);
    expect(failQueue).not.toHaveBeenCalled();
  });

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
});
