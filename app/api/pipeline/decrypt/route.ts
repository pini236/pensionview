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

    // Backfill: file is already decrypted and stored at decrypted_pdf_url. Skip the work.
    if (!report.raw_pdf_url && report.decrypted_pdf_url) {
      await triggerNextStep(reportId, "decrypt", pageCount);
      return NextResponse.json({ ok: true, skipped: "already decrypted" });
    }

    const sourcePath = report.raw_pdf_url;
    if (!sourcePath) throw new Error("No PDF source path on report");

    const { data: pdfData } = await admin.storage
      .from("reports")
      .download(sourcePath);

    if (!pdfData) throw new Error("Could not download PDF from storage");

    // Note: PDF decryption library integration pending — pdf-lib does not support password-protected PDFs out of the box.
    // For now, store as-is (assuming PDF is already decrypted by upstream caller, e.g. backfill upload of pre-decrypted file).
    // For Surense PDFs which are password-protected, this step will need pdf-lib + a password unlock library, OR muhammara.
    // TODO: integrate password decryption for production Gmail-driven flow.
    const pdfBuffer = Buffer.from(await pdfData.arrayBuffer());
    void decrypt; // suppress unused import warning while password integration is pending

    const decryptedPath = `reports/${report.profile_id}/${report.report_date}/decrypted.pdf`;
    await admin.storage.from("reports").upload(decryptedPath, pdfBuffer, {
      contentType: "application/pdf",
      upsert: true,
    });

    await admin.from("reports")
      .update({ decrypted_pdf_url: decryptedPath })
      .eq("id", reportId);

    await triggerNextStep(reportId, "decrypt", pageCount);
    return NextResponse.json({ ok: true });
  } catch (error) {
    await failQueue(reportId, "decrypt", String(error));
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
