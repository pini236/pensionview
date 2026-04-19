import { NextRequest, NextResponse } from "next/server";
import { processGmailNotification } from "@/lib/gmail";
import { createAdminClient } from "@/lib/supabase/admin";
import { createQueueEntries, triggerNextStep } from "@/lib/pipeline/queue";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const data = JSON.parse(Buffer.from(body.message.data, "base64").toString());
    const { emailAddress, historyId } = data;

    const reports = await processGmailNotification(historyId, emailAddress);
    const admin = createAdminClient();

    for (const { profileId, downloadUrl, reportDate } of reports) {
      const { data: existing } = await admin.from("reports")
        .select("id")
        .eq("profile_id", profileId)
        .eq("report_date", reportDate)
        .maybeSingle();

      if (existing) continue;

      const { data: report } = await admin.from("reports").insert({
        profile_id: profileId,
        report_date: reportDate,
        status: "processing",
        raw_pdf_url: downloadUrl,
      }).select("id").single();

      if (report) {
        await createQueueEntries(report.id, 10);
        await triggerNextStep(report.id, "", 10);
      }
    }

    return NextResponse.json({ ok: true, processed: reports.length });
  } catch (error) {
    console.error("Gmail webhook error:", error);
    return NextResponse.json({ ok: true });
  }
}
