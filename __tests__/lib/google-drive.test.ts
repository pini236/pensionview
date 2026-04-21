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
  process.env.ENCRYPTION_KEY = "test";
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
