import { describe, it, expect } from "vitest";
import { vi } from "vitest";
import { profileFolderName, resolveFolder, uploadPdfToFolder } from "@/lib/drive/archive";
import type { drive_v3 } from "googleapis";

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
    expect(listArgs.spaces).toBe("drive");
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
