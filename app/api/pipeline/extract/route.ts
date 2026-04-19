import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { extractPage } from "@/lib/pipeline/extract";
import { triggerNextStep, failQueue } from "@/lib/pipeline/queue";

export async function POST(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const reportId = searchParams.get("reportId")!;
  const pageCount = Number(searchParams.get("pageCount") || 10);
  const page = Number(searchParams.get("page") || 1);
  const step = `extract_page_${page}`;

  try {
    const admin = createAdminClient();

    const { data: report } = await admin.from("reports")
      .select("decrypted_pdf_url, profile_id")
      .eq("id", reportId)
      .single();

    if (!report?.decrypted_pdf_url) throw new Error("No decrypted PDF");

    const { data: pdfData } = await admin.storage
      .from("reports")
      .download(report.decrypted_pdf_url);

    if (!pdfData) throw new Error("Could not download PDF");

    // Note: PDF page-to-image conversion library integration pending.
    // For now, send the entire PDF buffer as a single image — Claude Vision can handle PDFs directly when sent as base64.
    // This will need refinement to convert each page to a separate image (using pdf-to-img, pdfjs-dist, or similar).
    const pdfBuffer = Buffer.from(await pdfData.arrayBuffer());
    const base64 = pdfBuffer.toString("base64");

    const pageData = await extractPage(base64, "image/png");

    const storagePath = `reports/${report.profile_id}/extractions/${reportId}/page_${page}.json`;
    await admin.storage.from("reports").upload(
      storagePath,
      new Blob([JSON.stringify(pageData)], { type: "application/json" }),
      { upsert: true }
    );

    await triggerNextStep(reportId, step, pageCount);
    return NextResponse.json({ ok: true, page, pageData });
  } catch (error) {
    await failQueue(reportId, step, String(error));
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
