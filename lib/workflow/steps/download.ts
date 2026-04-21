import { createAdminClient } from "@/lib/supabase/admin";
import { decrypt } from "@/lib/crypto";
import { FatalError } from "workflow";
import { markCurrentStep } from "@/lib/workflow/mark-current-step";

export async function downloadStep({ reportId }: { reportId: string }): Promise<{ rawPdfPath: string }> {
  "use step";

  await markCurrentStep(reportId, "download");

  const admin = createAdminClient();

  const { data: report } = await admin
    .from("reports")
    .select("*, profile:profiles(*)")
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

  const profile = report.profile as { national_id: string } | null;
  if (!profile?.national_id) throw new FatalError("Profile has no national_id");

  const nationalId = decrypt(profile.national_id, process.env.ENCRYPTION_KEY!);

  const pdfResponse = await fetch(downloadUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password: nationalId }),
  });

  if (!pdfResponse.ok) {
    throw new Error(`Surense API returned ${pdfResponse.status}`);
  }

  const pdfBuffer = Buffer.from(await pdfResponse.arrayBuffer());

  const storagePath = `reports/${report.profile_id}/${report.report_date}/encrypted.pdf`;
  await admin.storage.from("reports").upload(storagePath, pdfBuffer, {
    contentType: "application/pdf",
    upsert: true,
  });

  await admin.from("reports").update({ raw_pdf_url: storagePath }).eq("id", reportId);

  return { rawPdfPath: storagePath };
}

// External Surense API + storage upload — transient failures are common.
downloadStep.maxRetries = 4;
