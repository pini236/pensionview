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
    then: (onFulfilled: (v: unknown) => unknown) =>
      Promise.resolve(result).then(onFulfilled),
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
  return makeQuery({
    data: { id: SELF_PROFILE_ID, household_id: HOUSEHOLD_ID },
    error: null,
  });
}

function setHouseholdMembers() {
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
      .mockReturnValueOnce(makeQuery({ data: null, error: null }));
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

    expect(deleteDriveFile).toHaveBeenCalledWith("drive-1", {
      google_access_token: "tok",
      google_refresh_token: "ref",
    });
    expect(storageRemove).toHaveBeenCalledWith([
      `${PROFILE_ID}/2026-04-01/decrypted.pdf`,
      `${PROFILE_ID}/extractions/${REPORT_ID}/page_1.json`,
    ]);
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

  it("returns 500 when DB delete fails", async () => {
    setAuthedUser();
    deleteDriveFile.mockResolvedValue({ kind: "deleted" });
    const dbError = makeQuery({ data: null, error: { message: "boom" } });
    adminFrom
      .mockReturnValueOnce(setSelfProfile())
      .mockReturnValueOnce(setHouseholdMembers())
      .mockReturnValueOnce(setReport())
      .mockReturnValueOnce(dbError);

    const res = await DELETE(makeReq(), { params: Promise.resolve({ id: REPORT_ID }) });
    const body = await res.json();
    expect(res.status).toBe(500);
    expect(body.error).toBe("boom");
  });
});
