import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { decrypt } from "@/lib/crypto";
import { triggerNextStep, failQueue } from "@/lib/pipeline/queue";
import { google } from "googleapis";
import { getGoogleOAuth2Client } from "@/lib/google-auth";
import { Readable } from "stream";

export async function POST(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const reportId = searchParams.get("reportId")!;
  const pageCount = Number(searchParams.get("pageCount") || 10);

  try {
    const admin = createAdminClient();
    const key = process.env.ENCRYPTION_KEY!;

    const { data: report } = await admin.from("reports")
      .select("*, profile:profiles(*)")
      .eq("id", reportId)
      .single();

    if (!report) throw new Error("Report not found");

    const profile = report.profile;
    if (!profile.google_access_token) {
      await triggerNextStep(reportId, "upload_drive", pageCount);
      return NextResponse.json({ ok: true, skipped: "no Google token" });
    }

    const { data: pdfData } = await admin.storage
      .from("reports")
      .download(report.decrypted_pdf_url!);

    if (!pdfData) throw new Error("Could not download decrypted PDF");

    const oauth2Client = getGoogleOAuth2Client();
    oauth2Client.setCredentials({
      access_token: decrypt(profile.google_access_token, key),
      refresh_token: profile.google_refresh_token ? decrypt(profile.google_refresh_token, key) : undefined,
    });

    const drive = google.drive({ version: "v3", auth: oauth2Client });
    const buffer = Buffer.from(await pdfData.arrayBuffer());

    const fileMetadata: Record<string, unknown> = {
      name: `PensionView-${report.report_date}.pdf`,
    };
    if (profile.google_drive_folder_id) {
      fileMetadata.parents = [profile.google_drive_folder_id];
    }

    const response = await drive.files.create({
      requestBody: fileMetadata,
      media: {
        mimeType: "application/pdf",
        body: Readable.from(buffer),
      },
      fields: "id",
    });

    await admin.from("reports")
      .update({ drive_file_id: response.data.id })
      .eq("id", reportId);

    await triggerNextStep(reportId, "upload_drive", pageCount);
    return NextResponse.json({ ok: true, driveFileId: response.data.id });
  } catch (error) {
    await failQueue(reportId, "upload_drive", String(error));
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
