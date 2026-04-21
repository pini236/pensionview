import { createAdminClient } from "@/lib/supabase/admin";
import { decrypt } from "@/lib/crypto";
import { decryptPdf } from "@/lib/pipeline/decrypt-pdf";
import { FatalError } from "workflow";
import { logEvent } from "@/lib/observability";
import { markCurrentStep } from "@/lib/workflow/mark-current-step";
import mupdf from "mupdf";

export async function decryptStep({
  reportId,
}: {
  reportId: string;
}): Promise<{ decryptedPath: string; pageCount: number }> {
  "use step";

  await markCurrentStep(reportId, "decrypt");

  const startedAt = Date.now();
  const admin = createAdminClient();

  const { data: report } = await admin
    .from("reports")
    .select("*, profile:profiles(*)")
    .eq("id", reportId)
    .single();

  if (!report) throw new FatalError(`Report ${reportId} not found`);

  const sourcePath = report.raw_pdf_url ?? report.decrypted_pdf_url;
  if (!sourcePath) throw new FatalError("No PDF source path on report");

  const { data: pdfData } = await admin.storage.from("reports").download(sourcePath);
  if (!pdfData) throw new Error("Could not download PDF from storage");

  const encryptedBuffer = Buffer.from(await pdfData.arrayBuffer());

  const encryptionKey = process.env.ENCRYPTION_KEY!;
  const profile = report.profile as { national_id: string } | null;
  if (!profile?.national_id) throw new FatalError("Profile has no national_id");

  const nationalId = decrypt(profile.national_id, encryptionKey);

  // Try opening the PDF without a password first to determine whether it is
  // encrypted. If needsPassword() returns false, the buffer is plaintext and
  // we pass an empty password so decryptPdf returns it as-is. If it returns
  // true, we pass the national_id; a wrong password causes decryptPdf to
  // throw with no string-matching fallback — the error propagates correctly.
  // This avoids brittle substring checks on MuPDF error messages that may
  // change across MuPDF versions.
  const probe = mupdf.Document.openDocument(encryptedBuffer, "application/pdf");
  const needsPassword = probe.needsPassword();
  probe.destroy();

  // decryptPdf calls needsPassword() internally and skips auth when false, so
  // passing an empty string for plaintext PDFs is safe and correct.
  const password = needsPassword ? nationalId : "";
  const decryptedBuffer = await decryptPdf(encryptedBuffer, password);

  // Count pages from the decrypted PDF so the pipeline uses the real count,
  // not a hardcoded fallback. mupdf is synchronous here — no await needed.
  const doc = mupdf.Document.openDocument(decryptedBuffer, "application/pdf");
  const pageCount = doc.countPages();
  doc.destroy();

  const decryptedPath = `reports/${report.profile_id}/${report.report_date}/decrypted.pdf`;
  await admin.storage.from("reports").upload(decryptedPath, decryptedBuffer, {
    contentType: "application/pdf",
    upsert: true,
  });

  await admin.from("reports").update({ decrypted_pdf_url: decryptedPath }).eq("id", reportId);

  logEvent("pipeline.step.complete", {
    feature: "pipeline",
    step: "decrypt",
    reportId,
    durationMs: Date.now() - startedAt,
    pageCount,
  });

  return { decryptedPath, pageCount };
}
