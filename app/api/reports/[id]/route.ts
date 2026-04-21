// =============================================================================
// PensionView — Report deletion API
//   DELETE /api/reports/[id]
//
// Order: auth → ownership → Drive (best-effort) → Storage (best-effort) → DB.
// DB CASCADE wipes report_summary, savings_products, insurance_products
// (→ insurance_coverages), report_insights, processing_queue.
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
  report_date: string;
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
      "id, profile_id, report_date, drive_file_id, profile:profiles(google_access_token, google_refresh_token)"
    )
    .eq("id", reportId)
    .in("profile_id", householdMemberIds)
    .maybeSingle();
  return (data as ReportRow | null) ?? null;
}

/**
 * Lists every object under both report-owned prefixes and removes them
 * in a single batch. Storage failures never abort the DB delete — the
 * worst case is a few orphan objects, which is recoverable.
 */
async function cleanupStorage(
  admin: ReturnType<typeof createAdminClient>,
  profileId: string,
  reportDate: string,
  reportId: string
): Promise<void> {
  const datePrefix = `${profileId}/${reportDate}`;
  const extractionsPrefix = `${profileId}/extractions/${reportId}`;

  // Hard limits keep the response time bounded. A pension report at normal scale
  // has 1 PDF in the date prefix and ~10–30 page JSONs in extractions; 100/200
  // is comfortable headroom. If a report ever exceeds these, the leftover
  // objects become orphans — recoverable but worth tracking if it happens.
  const [dateList, extractionsList] = await Promise.all([
    admin.storage.from("reports").list(datePrefix, { limit: 100 }),
    admin.storage.from("reports").list(extractionsPrefix, { limit: 200 }),
  ]);

  const paths: string[] = [];
  for (const entry of dateList.data ?? []) {
    paths.push(`${datePrefix}/${entry.name}`);
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
      reportId,
      error,
    });
  }
}

interface DeleteResponseBody {
  ok: true;
  drive: DriveDeleteResult["kind"];
  driveUrl?: string;
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
  await cleanupStorage(admin, report.profile_id, report.report_date, report.id);

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
