// =============================================================================
// PensionView — Report API
//   GET    /api/reports/[id]   — status poll (workflow progress)
//   PATCH  /api/reports/[id]   — manual report_date edit (for null / wrong dates)
//   DELETE /api/reports/[id]   — full removal (Drive → Storage → DB cascade)
// =============================================================================

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { deleteDriveFile, type DriveDeleteResult } from "@/lib/google-drive";
import { logEvent } from "@/lib/observability";

interface CallerContext {
  email: string;
  selfProfileId: string;
  householdId: string;
}

async function getCallerContext(): Promise<
  | { ok: true; ctx: CallerContext }
  | { ok: false; status: number; error: string }
> {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) return { ok: false, status: 401, error: "Not authenticated" };

  const admin = createAdminClient();
  const { data: self } = await admin
    .from("profiles")
    .select("id, household_id")
    .eq("email", user.email)
    .eq("is_self", true)
    .is("deleted_at", null)
    .maybeSingle();

  if (!self) {
    return {
      ok: false,
      status: 403,
      error: "No self profile for caller; backfill not run?",
    };
  }
  return {
    ok: true,
    ctx: {
      email: user.email,
      selfProfileId: self.id,
      householdId: self.household_id,
    },
  };
}

async function getHouseholdMemberIds(
  admin: ReturnType<typeof createAdminClient>,
  householdId: string
): Promise<string[]> {
  const { data } = await admin
    .from("profiles")
    .select("id")
    .eq("household_id", householdId)
    .is("deleted_at", null);
  return (data ?? []).map((p) => p.id as string);
}

interface ReportRow {
  id: string;
  profile_id: string;
  report_date: string | null;
  raw_pdf_url: string | null;
  decrypted_pdf_url: string | null;
  drive_file_id: string | null;
  profile: {
    google_access_token: string | null;
    google_refresh_token: string | null;
  };
}

async function loadOwnedReport(
  admin: ReturnType<typeof createAdminClient>,
  reportId: string,
  householdMemberIds: string[]
): Promise<ReportRow | null> {
  const { data } = await admin
    .from("reports")
    .select(
      "id, profile_id, report_date, raw_pdf_url, decrypted_pdf_url, drive_file_id, profile:profiles(google_access_token, google_refresh_token)"
    )
    .eq("id", reportId)
    .in("profile_id", householdMemberIds)
    .maybeSingle();
  return (data as ReportRow | null) ?? null;
}

// Storage URLs are bucket-prefixed (`reports/...`) but list/remove operate on
// bucket-relative paths. Derive the directory prefix from a stored URL so we
// transparently handle both layouts: legacy (`{profile_id}/{report_date}/`)
// and current (`{profile_id}/{report_id}/`).
function pdfPrefixFromUrl(storedUrl: string | null): string | null {
  if (!storedUrl) return null;
  if (!storedUrl.startsWith("reports/")) return null;
  const withoutBucket = storedUrl.slice("reports/".length);
  const lastSlash = withoutBucket.lastIndexOf("/");
  if (lastSlash === -1) return null;
  return withoutBucket.slice(0, lastSlash);
}

/**
 * Lists every object under both report-owned prefixes and removes them
 * in a single batch. Storage failures never abort the DB delete — the
 * worst case is a few orphan objects, which is recoverable.
 */
async function cleanupStorage(
  admin: ReturnType<typeof createAdminClient>,
  report: ReportRow
): Promise<void> {
  // The decrypted/raw URLs share the same parent directory, so either one
  // is a valid prefix for the report's PDF storage. If neither was ever
  // written (e.g. a download step that failed before upload), there's
  // nothing to list under that prefix and we skip the call.
  const pdfPrefix =
    pdfPrefixFromUrl(report.decrypted_pdf_url) ??
    pdfPrefixFromUrl(report.raw_pdf_url);
  const extractionsPrefix = `${report.profile_id}/extractions/${report.id}`;

  // Hard limits keep the response time bounded. A pension report at normal scale
  // has 1 PDF in the pdf prefix and ~10–30 page JSONs in extractions; 100/200
  // is comfortable headroom. If a report ever exceeds these, the leftover
  // objects become orphans — recoverable but worth tracking if it happens.
  const [pdfList, extractionsList] = await Promise.all([
    pdfPrefix
      ? admin.storage.from("reports").list(pdfPrefix, { limit: 100 })
      : Promise.resolve({ data: [], error: null }),
    admin.storage.from("reports").list(extractionsPrefix, { limit: 200 }),
  ]);

  const paths: string[] = [];
  if (pdfPrefix) {
    for (const entry of pdfList.data ?? []) {
      paths.push(`${pdfPrefix}/${entry.name}`);
    }
  }
  for (const entry of extractionsList.data ?? []) {
    paths.push(`${extractionsPrefix}/${entry.name}`);
  }

  if (paths.length === 0) return;

  const { error } = await admin.storage.from("reports").remove(paths);
  if (error) {
    logEvent("report.storage_cleanup_failed", {
      feature: "reports",
      step: "storage_cleanup",
      reportId: report.id,
      error,
    });
  }
}

interface DeleteResponseBody {
  ok: true;
  drive: DriveDeleteResult["kind"];
  driveUrl?: string;
}

// ---------------------------------------------------------------------------
// GET /api/reports/[id]
//
// Tiny status-poll endpoint used by the in-flight report row in the reports
// list. Returns just the workflow-progress columns (status / current_step /
// current_step_detail) plus the report_date for display. RLS isn't engaged
// here — we use the admin client so we can keep the SELECT minimal — but
// ownership is enforced the same way as DELETE: the caller must own a
// profile in the same household as the report's owning profile.
// ---------------------------------------------------------------------------

interface ReportStatusResponse {
  id: string;
  status: string;
  current_step: string | null;
  current_step_detail: Record<string, unknown> | null;
  report_date: string | null;
}

export async function GET(
  _request: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;

  const auth = await getCallerContext();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const admin = createAdminClient();
  const householdMemberIds = await getHouseholdMemberIds(
    admin,
    auth.ctx.householdId
  );

  const { data } = await admin
    .from("reports")
    .select("id, status, current_step, current_step_detail, report_date")
    .eq("id", id)
    .in("profile_id", householdMemberIds)
    .maybeSingle();

  if (!data) {
    return NextResponse.json({ error: "Report not found" }, { status: 404 });
  }

  const body: ReportStatusResponse = {
    id: data.id as string,
    status: data.status as string,
    current_step: (data.current_step as string | null) ?? null,
    current_step_detail:
      (data.current_step_detail as Record<string, unknown> | null) ?? null,
    report_date: (data.report_date as string | null) ?? null,
  };
  return NextResponse.json(body, { status: 200 });
}

// ---------------------------------------------------------------------------
// PATCH /api/reports/[id]
//
// Lets the user fix a report's date after the fact — either because the PDF
// extractor couldn't find a date (so it stayed null), or because the date
// extracted from the PDF was wrong. Body shape: { report_date: "YYYY-MM-DD" }.
// Validates ownership the same way as DELETE/GET; on duplicate (another
// report at the same date for this profile already exists) returns HTTP 409.
// ---------------------------------------------------------------------------

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const PG_UNIQUE_VIOLATION = "23505";

function isValidIsoDate(value: string): boolean {
  if (!ISO_DATE_RE.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  // Round-trip parse to catch invalid combinations like 2024-02-30.
  const dt = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(dt.getTime())) return false;
  return (
    dt.getUTCFullYear() === y &&
    dt.getUTCMonth() + 1 === m &&
    dt.getUTCDate() === d
  );
}

export async function PATCH(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;

  const auth = await getCallerContext();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  let payload: { report_date?: unknown };
  try {
    payload = (await request.json()) as { report_date?: unknown };
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const newDate = payload.report_date;
  if (typeof newDate !== "string" || !isValidIsoDate(newDate)) {
    return NextResponse.json(
      { error: "report_date must be a valid YYYY-MM-DD" },
      { status: 400 }
    );
  }

  const admin = createAdminClient();
  const householdMemberIds = await getHouseholdMemberIds(
    admin,
    auth.ctx.householdId
  );

  // Ownership check before the UPDATE so non-members can't probe report ids.
  const { data: existing } = await admin
    .from("reports")
    .select("id, report_date")
    .eq("id", id)
    .in("profile_id", householdMemberIds)
    .maybeSingle();

  if (!existing) {
    return NextResponse.json({ error: "Report not found" }, { status: 404 });
  }

  const { error: updErr } = await admin
    .from("reports")
    .update({ report_date: newDate })
    .eq("id", id);

  if (updErr) {
    if (updErr.code === PG_UNIQUE_VIOLATION) {
      return NextResponse.json(
        { error: `Another report already exists for ${newDate}` },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: updErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, report_date: newDate }, { status: 200 });
}

export async function DELETE(
  _request: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;

  const auth = await getCallerContext();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const admin = createAdminClient();
  const householdMemberIds = await getHouseholdMemberIds(
    admin,
    auth.ctx.householdId
  );

  const report = await loadOwnedReport(admin, id, householdMemberIds);
  if (!report) {
    return NextResponse.json({ error: "Report not found" }, { status: 404 });
  }

  // 1. Drive (best-effort, never throws)
  const driveResult = await deleteDriveFile(report.drive_file_id, report.profile);

  if (driveResult.kind === "failed") {
    logEvent("report.drive_delete_failed", {
      feature: "reports",
      step: "drive_delete",
      reportId: report.id,
      error: driveResult.error,
    });
  }

  // 2. Storage (best-effort)
  await cleanupStorage(admin, report);

  // 3. DB (CASCADE wipes everything extracted)
  const { error: dbError } = await admin
    .from("reports")
    .delete()
    .eq("id", id);

  if (dbError) {
    return NextResponse.json(
      { error: dbError.message },
      { status: 500 }
    );
  }

  const body: DeleteResponseBody = { ok: true, drive: driveResult.kind };
  if (driveResult.kind === "failed") {
    body.driveUrl = driveResult.driveUrl;
  }
  return NextResponse.json(body, { status: 200 });
}
