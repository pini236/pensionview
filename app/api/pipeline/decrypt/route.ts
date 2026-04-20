import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { decrypt } from "@/lib/crypto";
import { triggerNextStep, failQueue } from "@/lib/pipeline/queue";
import { decryptPdf } from "@/lib/pipeline/decrypt-pdf";
import { assertInternalRequest } from "@/lib/auth-internal";
import { logEvent } from "@/lib/observability";

export async function POST(request: NextRequest) {
  const unauth = assertInternalRequest(request);
  if (unauth) return unauth;

  const { searchParams } = new URL(request.url);
  const reportId = searchParams.get("reportId")!;
  const pageCount = Number(searchParams.get("pageCount") || 10);

  const startedAt = Date.now();

  try {
    const admin = createAdminClient();

    const { data: report } = await admin
      .from("reports")
      .select("*, profile:profiles(*)")
      .eq("id", reportId)
      .single();

    if (!report) throw new Error("Report not found");

    // Always run mupdf — it's idempotent. Plaintext PDFs pass through unchanged;
    // encrypted PDFs get decrypted with the national_id password.
    // Source path: prefer raw_pdf_url (Gmail flow) but fall back to decrypted_pdf_url
    // (backfill flow stores at this path even when the uploaded file is still encrypted).
    const sourcePath = report.raw_pdf_url ?? report.decrypted_pdf_url;
    if (!sourcePath) throw new Error("No PDF source path on report");

    const { data: pdfData } = await admin.storage
      .from("reports")
      .download(sourcePath);

    if (!pdfData) throw new Error("Could not download PDF from storage");

    const encryptedBuffer = Buffer.from(await pdfData.arrayBuffer());

    // Decrypt with national_id as the PDF password.
    // national_id is AES-256-CBC encrypted in the DB — unwrap it first.
    const encryptionKey = process.env.ENCRYPTION_KEY!;
    const profile = report.profile as { national_id: string } | null;
    if (!profile?.national_id) throw new Error("Profile has no national_id");

    const nationalId = decrypt(profile.national_id, encryptionKey);

    let decryptedBuffer: Buffer;
    try {
      decryptedBuffer = await decryptPdf(encryptedBuffer, nationalId);
    } catch (decryptError) {
      // Graceful fallback: if decryption fails (wrong password or file is not
      // encrypted), attempt to use the buffer as-is. This handles backfill of
      // files that were already decrypted before being stored.
      const errorMsg = String(decryptError);
      const isWrongPassword = errorMsg.includes("password is incorrect");
      const isNotEncrypted =
        !errorMsg.includes("password") &&
        !errorMsg.includes("encrypted");

      if (isWrongPassword) {
        // Re-throw — wrong password means we cannot proceed, no point continuing.
        throw decryptError;
      }

      if (isNotEncrypted) {
        // PDF opened fine but needsPassword() returned false — already plaintext.
        decryptedBuffer = encryptedBuffer;
      } else {
        throw decryptError;
      }
    }

    const decryptedPath = `reports/${report.profile_id}/${report.report_date}/decrypted.pdf`;
    await admin.storage.from("reports").upload(decryptedPath, decryptedBuffer, {
      contentType: "application/pdf",
      upsert: true,
    });

    await admin
      .from("reports")
      .update({ decrypted_pdf_url: decryptedPath })
      .eq("id", reportId);

    await triggerNextStep(reportId, "decrypt", pageCount);

    logEvent("pipeline.step.complete", {
      feature: "pipeline",
      step: "decrypt",
      reportId,
      durationMs: Date.now() - startedAt,
      pageCount,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    logEvent("pipeline.step.failed", {
      feature: "pipeline",
      step: "decrypt",
      reportId,
      durationMs: Date.now() - startedAt,
      pageCount,
      error,
    });
    await failQueue(reportId, "decrypt", String(error));
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
