import type { drive_v3 } from "googleapis";
import { Readable } from "stream";

const FOLDER_MIME = "application/vnd.google-apps.folder";

export function profileFolderName(profileName: string | null | undefined, profileId: string): string {
  const cleaned = (profileName ?? "").trim().replace(/\s+/g, " ");
  if (cleaned.length > 0) return cleaned;
  return `Profile-${profileId.slice(0, 8)}`;
}

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
    spaces: "drive",
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
