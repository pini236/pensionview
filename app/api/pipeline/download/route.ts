import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { decrypt } from "@/lib/crypto";
import { triggerNextStep, failQueue } from "@/lib/pipeline/queue";

export async function POST(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const reportId = searchParams.get("reportId")!;
  const pageCount = Number(searchParams.get("pageCount") || 10);

  try {
    const admin = createAdminClient();

    const { data: report } = await admin.from("reports")
      .select("*, profile:profiles(*)")
      .eq("id", reportId)
      .single();

    if (!report) throw new Error("Report not found");

    const downloadUrl = report.raw_pdf_url;
    if (!downloadUrl) throw new Error("No download URL");

    const nationalId = decrypt(report.profile.national_id, process.env.ENCRYPTION_KEY!);

    const pdfResponse = await fetch(downloadUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: nationalId }),
    });

    if (!pdfResponse.ok) throw new Error(`Surense API returned ${pdfResponse.status}`);

    const pdfBuffer = Buffer.from(await pdfResponse.arrayBuffer());

    const storagePath = `reports/${report.profile_id}/${report.report_date}/encrypted.pdf`;
    await admin.storage.from("reports").upload(storagePath, pdfBuffer, {
      contentType: "application/pdf",
      upsert: true,
    });

    await admin.from("reports").update({ raw_pdf_url: storagePath }).eq("id", reportId);

    await triggerNextStep(reportId, "download", pageCount);
    return NextResponse.json({ ok: true });
  } catch (error) {
    await failQueue(reportId, "download", String(error));
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
