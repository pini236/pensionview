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
