import { google } from "googleapis";
import { createAdminClient } from "@/lib/supabase/admin";
import { decrypt } from "@/lib/crypto";
import { FatalError } from "workflow";
import { getGoogleOAuth2Client } from "@/lib/google-auth";
import { uploadPdfToFolder } from "@/lib/drive/archive";
import { markCurrentStep } from "@/lib/workflow/mark-current-step";

export async function uploadDriveStep({
  reportId,
  subfolderId,
}: {
  reportId: string;
  subfolderId: string;
}): Promise<{ driveFileId: string; skipped?: boolean }> {
  "use step";

  await markCurrentStep(reportId, "upload_drive");

  const admin = createAdminClient();
  const key = process.env.ENCRYPTION_KEY!;

  const { data: report } = await admin
    .from("reports")
    .select("*, profile:profiles(*)")
    .eq("id", reportId)
    .single();

  if (!report) throw new FatalError(`Report ${reportId} not found`);

  // Idempotency: skip re-upload if the file was already archived on a prior attempt.
  if (report.drive_file_id) {
    return { driveFileId: report.drive_file_id, skipped: true };
  }

  if (!report.decrypted_pdf_url) throw new FatalError("No decrypted PDF path on report");

  const { data: pdfData } = await admin.storage
    .from("reports")
    .download(report.decrypted_pdf_url);
  if (!pdfData) throw new Error("Could not download decrypted PDF from storage");

  // Drive credentials always come from the self profile — resolved by resolveDriveFoldersStep.
  // We need the self profile here to get the access token.
  const ownerProfile = report.profile as Record<string, unknown> | null;
  if (!ownerProfile) throw new FatalError("Report has no owner profile");

  const { data: selfProfile } = await admin
    .from("profiles")
    .select("google_access_token, google_refresh_token")
    .eq("household_id", ownerProfile.household_id as string)
    .eq("is_self", true)
    .is("deleted_at", null)
    .maybeSingle();

  if (!selfProfile?.google_access_token) {
    throw new FatalError("Self profile lost Google token between resolve and upload steps");
  }

  const oauth2Client = getGoogleOAuth2Client();
  oauth2Client.setCredentials({
    access_token: decrypt(selfProfile.google_access_token as string, key),
    refresh_token: selfProfile.google_refresh_token
      ? decrypt(selfProfile.google_refresh_token as string, key)
      : undefined,
  });

  const drive = google.drive({ version: "v3", auth: oauth2Client });

  const buffer = Buffer.from(await pdfData.arrayBuffer());
  const driveFileId = await uploadPdfToFolder({
    drive,
    parentFolderId: subfolderId,
    filename: `PensionView-${report.report_date}.pdf`,
    buffer,
  });

  await admin.from("reports").update({ drive_file_id: driveFileId }).eq("id", reportId);

  return { driveFileId };
}
