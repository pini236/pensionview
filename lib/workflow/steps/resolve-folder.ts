import { google } from "googleapis";
import { createAdminClient } from "@/lib/supabase/admin";
import { FatalError } from "workflow";
import {
  clearGoogleTokens,
  getAuthedOAuth2Client,
  isInvalidGrantError,
} from "@/lib/google-auth";
import { resolveFolder, profileFolderName } from "@/lib/drive/archive";
import { markCurrentStep } from "@/lib/workflow/mark-current-step";

const ROOT_FOLDER_NAME = "PensionView";

type ResolveFolderResult =
  | { subfolderId: string; selfProfileId: string }
  | { skipped: true; reason: string };

export async function resolveDriveFoldersStep({
  reportId,
}: {
  reportId: string;
}): Promise<ResolveFolderResult> {
  "use step";

  await markCurrentStep(reportId, "resolve_drive_folder");

  const admin = createAdminClient();
  const key = process.env.ENCRYPTION_KEY!;

  const { data: report } = await admin
    .from("reports")
    .select("*, profile:profiles(*)")
    .eq("id", reportId)
    .single();

  if (!report) throw new FatalError(`Report ${reportId} not found`);

  const ownerProfile = report.profile as Record<string, unknown> | null;
  if (!ownerProfile) throw new FatalError("Report has no owner profile");

  const { data: selfProfile } = await admin
    .from("profiles")
    .select("*")
    .eq("household_id", ownerProfile.household_id as string)
    .eq("is_self", true)
    .is("deleted_at", null)
    .maybeSingle();

  if (!selfProfile?.google_access_token) {
    return { skipped: true, reason: "no Google token on self profile" };
  }

  const oauth2Client = getAuthedOAuth2Client(
    {
      id: selfProfile.id as string,
      google_access_token: selfProfile.google_access_token as string,
      google_refresh_token: (selfProfile.google_refresh_token as string | null) ?? null,
      google_token_expiry: (selfProfile.google_token_expiry as string | null) ?? null,
    },
    admin,
    key
  );

  const drive = google.drive({ version: "v3", auth: oauth2Client });

  try {
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

    const subfolderId = await resolveFolder({
      drive,
      parentFolderId: rootFolderId,
      folderName: profileFolderName(
        ownerProfile.name as string | null,
        ownerProfile.id as string
      ),
    });

    return { subfolderId, selfProfileId: selfProfile.id as string };
  } catch (err) {
    // Revoked/expired refresh token → no retry will ever succeed. Clear
    // the dead tokens so Settings surfaces "Reconnect Gmail", and raise
    // a FatalError with a user-facing message instead of burning two
    // retries on the same 400.
    if (isInvalidGrantError(err)) {
      await clearGoogleTokens(admin, selfProfile.id as string);
      throw new FatalError(
        "Google connection expired. Reconnect Gmail in Settings and retry the report."
      );
    }
    throw err;
  }
}

// Google Drive list-then-create is mostly idempotent — default 3 attempts.
resolveDriveFoldersStep.maxRetries = 2;
