import { createAdminClient } from "@/lib/supabase/admin";
import { extractPage } from "@/lib/pipeline/extract";
import { FatalError } from "workflow";
import { logEvent } from "@/lib/observability";
import { markCurrentStep } from "@/lib/workflow/mark-current-step";

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

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

  // WDK step memoization + storage-existence guard handle dedup; Anthropic Messages API has no client idempotency header.
  const startedAt = Date.now();

  const pageData = await extractPage(base64, page);

  await admin.storage.from("reports").upload(
    storagePath,
    new Blob([JSON.stringify(pageData)], { type: "application/json" }),
    { upsert: true }
  );

  // Opportunistic date fill: cover/letter pages return report_date, and the
  // cover is page 1 so this typically fires after the first extraction. The
  // CAS-style WHERE report_date IS NULL prevents us from clobbering a value
  // the user set manually or that an earlier page already provided. Errors
  // (incl. unique violation when another report at this date exists) are
  // swallowed — validate's date logic is the authoritative backstop and
  // surfaces dup conflicts as a fatal failure with a clear message.
  const extractedDate = (pageData as { report_date?: unknown }).report_date;
  if (typeof extractedDate === "string" && ISO_DATE_RE.test(extractedDate)) {
    const { error: dateErr } = await admin
      .from("reports")
      .update({ report_date: extractedDate })
      .eq("id", reportId)
      .is("report_date", null);
    if (dateErr) {
      logEvent("pipeline.extract.date_update_failed", {
        feature: "pipeline",
        reportId,
        page,
        extractedDate,
        error: dateErr,
      });
    }
  }

  logEvent("pipeline.step.complete", {
    feature: "pipeline",
    step: `extract_page_${page}`,
    reportId,
    durationMs: Date.now() - startedAt,
    page,
    pageCount,
  });
}

// Anthropic API calls — 529 overloads + transient errors are common.
extractPageStep.maxRetries = 4;
