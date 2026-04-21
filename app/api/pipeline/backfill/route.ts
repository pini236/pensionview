import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { startReportPipeline } from "@/lib/workflow/start";

// Hard caps (defence in depth — Vercel/Next has its own body limit too).
const MAX_BYTES = 25_000_000; // 25 MB
const PDF_MAGIC = "%PDF-";

// Accepts either filename-derived MM-YYYY or an explicit `reportDate` form
// field (YYYY-MM-DD). The explicit field always wins. Returns null when no
// date can be inferred — the workflow's validate step will then pull the
// date out of the PDF's cover page.
function parseReportDate(
  explicit: string | null,
  fileName: string
): string | null {
  if (explicit) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(explicit)) return null;
    // sanity: month 01–12, day 01–31
    const parts = explicit.split("-").map(Number);
    const m = parts[1];
    const d = parts[2];
    if (m < 1 || m > 12 || d < 1 || d > 31) return null;
    return explicit;
  }

  const dateMatch = fileName.match(/(\d{2})-(\d{4})/);
  if (!dateMatch) return null;
  const month = dateMatch[1];
  const year = dateMatch[2];
  const monthNum = Number(month);
  if (monthNum < 1 || monthNum > 12) return null;
  const lastDay = new Date(Number(year), monthNum, 0).getDate();
  return `${year}-${month}-${String(lastDay).padStart(2, "0")}`;
}

export async function POST(request: NextRequest) {
  try {
    // ---------- AuthN: who is calling? ------------------------------------
    const userClient = await createServerSupabase();
    const {
      data: { user },
    } = await userClient.auth.getUser();
    if (!user?.email) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    // ---------- Cheap guard: refuse oversized uploads early ---------------
    const contentLength = Number(request.headers.get("content-length") || 0);
    if (contentLength && contentLength > MAX_BYTES) {
      return NextResponse.json(
        { error: `File too large (max ${MAX_BYTES} bytes)` },
        { status: 400 }
      );
    }

    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const profileId = formData.get("profileId") as string | null;
    const explicitDate = (formData.get("reportDate") as string | null) || null;

    if (!file || !profileId) {
      return NextResponse.json({ error: "Missing file or profileId" }, { status: 400 });
    }

    // ---------- Size + magic-byte validation ------------------------------
    if (file.size > MAX_BYTES) {
      return NextResponse.json(
        { error: `File too large (max ${MAX_BYTES} bytes)` },
        { status: 400 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    if (buffer.subarray(0, 5).toString() !== PDF_MAGIC) {
      return NextResponse.json(
        { error: "File does not look like a PDF (magic bytes mismatch)" },
        { status: 400 }
      );
    }

    // ---------- AuthZ: caller must own a profile in the same household ---
    const admin = createAdminClient();

    const { data: selfProfile } = await admin
      .from("profiles")
      .select("id, household_id")
      .eq("email", user.email)
      .eq("is_self", true)
      .is("deleted_at", null)
      .maybeSingle();

    if (!selfProfile) {
      return NextResponse.json(
        { error: "No self profile for caller" },
        { status: 403 }
      );
    }

    const { data: profileCheck } = await admin
      .from("profiles")
      .select("id, household_id, deleted_at")
      .eq("id", profileId)
      .maybeSingle();

    if (!profileCheck) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 });
    }
    if (profileCheck.household_id !== selfProfile.household_id) {
      return NextResponse.json(
        { error: "Profile is not in your household" },
        { status: 403 }
      );
    }
    if (profileCheck.deleted_at) {
      return NextResponse.json(
        { error: "Profile is archived; restore before uploading reports" },
        { status: 410 }
      );
    }

    // ---------- Report date: best-effort (may be null) -------------------
    // Missing dates are no longer fatal — validate step will pull the date
    // out of the PDF's cover page. Early dup check only runs when we have a
    // date in hand; otherwise dup detection is deferred to validate.
    const reportDate = parseReportDate(explicitDate, file.name);

    if (reportDate) {
      const { data: existing } = await admin
        .from("reports")
        .select("id")
        .eq("profile_id", profileId)
        .eq("report_date", reportDate)
        .maybeSingle();

      if (existing) {
        return NextResponse.json(
          { error: "Report already exists for this date" },
          { status: 409 }
        );
      }
    }

    // ---------- Store + enqueue ------------------------------------------
    // Storage paths are keyed by reportId so we can write the file before we
    // know the date. Old reports (date-keyed paths) keep their stored URLs
    // and remain reachable; new reports use the reportId-keyed layout.
    const reportId = randomUUID();
    const decryptedPath = `reports/${profileId}/${reportId}/decrypted.pdf`;
    await admin.storage.from("reports").upload(decryptedPath, buffer, {
      contentType: "application/pdf",
      upsert: true,
    });

    const { data: report } = await admin.from("reports").insert({
      id: reportId,
      profile_id: profileId,
      report_date: reportDate,
      status: "processing",
      decrypted_pdf_url: decryptedPath,
    }).select("id").single();

    if (!report) throw new Error("Failed to create report");

    let runId: string;
    let alreadyRunning: boolean;
    try {
      ({ runId, alreadyRunning } = await startReportPipeline({
        reportId: report.id,
        isBackfill: true,
      }));
    } catch (startError) {
      await admin
        .from("reports")
        .update({ status: "failed" })
        .eq("id", report.id);
      return NextResponse.json(
        { error: `Workflow start failed: ${String(startError)}` },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true, reportId: report.id, reportDate, runId, alreadyRunning });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
