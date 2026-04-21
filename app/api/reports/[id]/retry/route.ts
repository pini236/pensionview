// =============================================================================
// PensionView — Report retry API
//   POST /api/reports/[id]/retry
//
// Verifies caller owns the report (household ownership, same as DELETE),
// then calls startReportPipeline with isBackfill:true. start.ts's Option C
// path sees the stale terminal workflow_run_id, NULLs it out, and starts a
// fresh run. Returns { ok, runId, alreadyRunning }.
// =============================================================================

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { startReportPipeline } from "@/lib/workflow/start";

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

export async function POST(
  _request: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;

  // --- Auth ---
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const admin = createAdminClient();

  // --- Resolve caller's household ---
  const { data: self } = await admin
    .from("profiles")
    .select("id, household_id")
    .eq("email", user.email)
    .eq("is_self", true)
    .is("deleted_at", null)
    .maybeSingle();

  if (!self) {
    return NextResponse.json(
      { error: "No self profile for caller" },
      { status: 403 }
    );
  }

  // --- Ownership check: report must belong to a household member ---
  const householdMemberIds = await getHouseholdMemberIds(
    admin,
    self.household_id
  );

  const { data: report } = await admin
    .from("reports")
    .select("id, status")
    .eq("id", id)
    .in("profile_id", householdMemberIds)
    .maybeSingle();

  if (!report) {
    return NextResponse.json({ error: "Report not found" }, { status: 404 });
  }

  // --- Start (or detect already-running) pipeline ---
  const { runId, alreadyRunning } = await startReportPipeline({
    reportId: id,
    isBackfill: true,
  });

  return NextResponse.json({ ok: true, runId, alreadyRunning }, { status: 200 });
}
