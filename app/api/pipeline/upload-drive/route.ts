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
    // Supabase admin client returns `any`; the cast keeps the null branch precise below.
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
