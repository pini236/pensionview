// =============================================================================
// PensionView — Bulk in-flight reports poll endpoint
//   GET /api/reports/processing
//
// Returns all reports for the caller's household that are still processing
// or have failed. The reports list page's ProcessingReportsProvider polls
// this single endpoint once every 3s instead of per-row.
// =============================================================================

import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

interface CallerContext {
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
  return { ok: true, ctx: { householdId: self.household_id } };
}

export interface ProcessingReportStatus {
  id: string;
  status: string;
  current_step: string | null;
  current_step_detail: Record<string, unknown> | null;
  report_date: string;
}

interface ProcessingReportsResponse {
  reports: ProcessingReportStatus[];
}

export async function GET() {
  const auth = await getCallerContext();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const admin = createAdminClient();

  // Fetch all household members first so we can scope reports to the household.
  const { data: profiles } = await admin
    .from("profiles")
    .select("id")
    .eq("household_id", auth.ctx.householdId)
    .is("deleted_at", null);

  const householdMemberIds = (profiles ?? []).map((p) => p.id as string);

  if (householdMemberIds.length === 0) {
    return NextResponse.json({ reports: [] }, { status: 200 });
  }

  const { data } = await admin
    .from("reports")
    .select("id, status, current_step, current_step_detail, report_date")
    .in("profile_id", householdMemberIds)
    .in("status", ["processing", "failed"]);

  const reports: ProcessingReportStatus[] = (data ?? []).map((row) => ({
    id: row.id as string,
    status: row.status as string,
    current_step: (row.current_step as string | null) ?? null,
    current_step_detail:
      (row.current_step_detail as Record<string, unknown> | null) ?? null,
    report_date: row.report_date as string,
  }));

  const body: ProcessingReportsResponse = { reports };
  return NextResponse.json(body, { status: 200 });
}
