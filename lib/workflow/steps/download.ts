import { createAdminClient } from "@/lib/supabase/admin";
import { FatalError } from "workflow";
import { markCurrentStep } from "@/lib/workflow/mark-current-step";

export async function downloadStep({ reportId }: { reportId: string }): Promise<{ rawPdfPath: string }> {
  "use step";

  await markCurrentStep(reportId, "download");

  const admin = createAdminClient();

  const { data: report } = await admin
    .from("reports")
    .select("id, profile_id, raw_pdf_url")
    .eq("id", reportId)
    .single();

  if (!report) throw new FatalError(`Report ${reportId} not found`);

  // Idempotency guard: if raw_pdf_url is already a storage path (written by a
  // prior successful run of this step), skip the download and return early.
  // This prevents a re-invocation from POSTing to a storage-bucket URL.
  if (report.raw_pdf_url?.startsWith("reports/")) {
    return { rawPdfPath: report.raw_pdf_url };
  }

  const downloadUrl = report.raw_pdf_url;
  if (!downloadUrl) throw new FatalError("No download URL on report");

  // The URL Surense issues for inbound report links is a pre-signed access
  // URL (?sig=…&exp=…). Pre-signed URLs are GET-only — POSTing returns 405
  // Method Not Allowed. national_id is NOT needed for HTTP access (the
  // signature in the URL authenticates the request); it only encrypts the
  // PDF itself, which decryptStep handles next.
  const pdfResponse = await fetch(downloadUrl, { method: "GET" });

  if (!pdfResponse.ok) {
    throw new Error(`Surense API returned ${pdfResponse.status}`);
  }

  const pdfBuffer = Buffer.from(await pdfResponse.arrayBuffer());

  // reportId-keyed path: report_date may be null until the validate step
  // extracts it from the PDF, so we can't rely on it for storage layout.
  const storagePath = `reports/${report.profile_id}/${reportId}/encrypted.pdf`;
  await admin.storage.from("reports").upload(storagePath, pdfBuffer, {
    contentType: "application/pdf",
    upsert: true,
  });

  await admin.from("reports").update({ raw_pdf_url: storagePath }).eq("id", reportId);

  return { rawPdfPath: storagePath };
}

// External Surense API + storage upload — transient failures are common.
downloadStep.maxRetries = 4;
