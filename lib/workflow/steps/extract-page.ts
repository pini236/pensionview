import { getStepMetadata } from "workflow";
import { createAdminClient } from "@/lib/supabase/admin";
import { extractPage } from "@/lib/pipeline/extract";
import { FatalError } from "workflow";
import { logEvent } from "@/lib/observability";
import { markCurrentStep } from "@/lib/workflow/mark-current-step";

export async function extractPageStep({
  reportId,
  page,
  pageCount,
}: {
  reportId: string;
  page: number;
  pageCount: number;
}): Promise<void> {
  "use step";

  await markCurrentStep(reportId, "extract_page", { page, total_pages: pageCount });

  const admin = createAdminClient();

  const { data: report } = await admin
    .from("reports")
    .select("decrypted_pdf_url, profile_id")
    .eq("id", reportId)
    .single();

  if (!report?.decrypted_pdf_url) throw new FatalError(`No decrypted PDF for report ${reportId}`);

  const storagePath = `reports/${report.profile_id}/extractions/${reportId}/page_${page}.json`;

  // Skip the LLM call entirely if the extraction already exists in storage.
  // This covers the case where a step was partially retried after the Anthropic
  // call succeeded but the storage upload failed.
  const { data: existing } = await admin.storage.from("reports").download(storagePath);
  if (existing) return;

  const { data: pdfData } = await admin.storage
    .from("reports")
    .download(report.decrypted_pdf_url);

  if (!pdfData) throw new Error("Could not download decrypted PDF from storage");

  const pdfBuffer = Buffer.from(await pdfData.arrayBuffer());
  const base64 = pdfBuffer.toString("base64");

  const { stepId } = getStepMetadata();
  const startedAt = Date.now();

  const pageData = await extractPage(base64, page, stepId);

  await admin.storage.from("reports").upload(
    storagePath,
    new Blob([JSON.stringify(pageData)], { type: "application/json" }),
    { upsert: true }
  );

  logEvent("pipeline.step.complete", {
    feature: "pipeline",
    step: `extract_page_${page}`,
    reportId,
    durationMs: Date.now() - startedAt,
    page,
    pageCount,
  });
}
