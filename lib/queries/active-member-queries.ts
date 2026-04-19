// =============================================================================
// PensionView — Query helpers scoped to the active member / household
// =============================================================================
//
// All page-level data fetches should funnel through these helpers so the
// "single vs combined" branch is decided once, in one place. RLS still
// enforces household isolation; these helpers just save callers from
// reimplementing the same `.in("profile_id", ids)` plumbing everywhere.
// =============================================================================

import { createServerSupabase } from "@/lib/supabase/server";
import { getActiveMember, type ActiveMember } from "@/lib/active-member";
import type { Member, ReportStatus } from "@/lib/types";

// ---------------------------------------------------------------------------
// Selection helpers
// ---------------------------------------------------------------------------

/**
 * Returns the list of profile IDs the current view is scoped to.
 *
 * - `kind: "single"` -> `[memberId]` (exactly one element)
 * - `kind: "all"`    -> every household member ID (non-deleted)
 *
 * Use this to drive `.in("profile_id", ids)` on any report-shaped query.
 * Single-member is just `ids.length === 1`, so the call site never branches.
 */
export function getHouseholdMemberIds(active: ActiveMember): string[] {
  return active.householdMemberIds;
}

/**
 * Returns every member in the household (including the active one), in
 * deterministic order: self first, then by created_at ascending. Useful for
 * rendering the switcher and the per-member share bar.
 */
export function getHouseholdMembers(active: ActiveMember): Member[] {
  return active.members;
}

/**
 * Convenience for pages: resolve the active context from `searchParams`.
 *
 * Pages in Next 16 receive `searchParams` as a Promise — callers must
 * `await searchParams` before passing it in.
 */
export async function getActiveProfile(
  searchParams: { member?: string } = {}
): Promise<ActiveMember> {
  return getActiveMember(searchParams);
}

/**
 * Narrow guard: did the user pick a single member?
 * (Saves a `.kind === "single"` repetition at call sites.)
 */
export function isSingleMember(
  active: ActiveMember
): active is Extract<ActiveMember, { kind: "single" }> {
  return active.kind === "single";
}

/**
 * Find a member in the active household by id. Returns null when not found.
 * Useful when joining a query result back to a member for rendering.
 */
export function findMember(active: ActiveMember, id: string): Member | null {
  return active.members.find((m) => m.id === id) ?? null;
}

// ---------------------------------------------------------------------------
// Report queries
// ---------------------------------------------------------------------------

export interface ReportRowForList {
  id: string;
  profile_id: string;
  report_date: string;
  status: ReportStatus;
}

export interface ReportListOptions {
  status?: ReportStatus;
  limit?: number;
}

/**
 * List reports for whatever members the active context covers.
 * One code path for both single + combined views.
 */
export async function queryReportsForActiveMember(
  active: ActiveMember,
  opts: ReportListOptions = {}
): Promise<ReportRowForList[]> {
  const supabase = await createServerSupabase();
  const ids = getHouseholdMemberIds(active);
  if (ids.length === 0) return [];

  const { data, error } = await supabase
    .from("reports")
    .select("id, profile_id, report_date, status")
    .in("profile_id", ids)
    .eq("status", opts.status ?? "done")
    .order("report_date", { ascending: false })
    .limit(opts.limit ?? 100);

  if (error) {
    throw new Error(`queryReportsForActiveMember: ${error.message}`);
  }
  return (data ?? []) as ReportRowForList[];
}

/**
 * Returns the latest "done" report ID for each member in the active context.
 *
 * For combined / household views this is what every aggregation hangs off:
 * "the most recent snapshot per member, summed". Returns one row per member
 * even if some members have no reports (those are simply omitted).
 */
export async function getLatestReportIdsPerMember(
  active: ActiveMember
): Promise<Array<{ profileId: string; reportId: string; reportDate: string }>> {
  const reports = await queryReportsForActiveMember(active, {
    status: "done",
    limit: 500,
  });

  // Group by profile_id, pick the most recent (already sorted desc).
  const byMember = new Map<string, { reportId: string; reportDate: string }>();
  for (const r of reports) {
    if (!byMember.has(r.profile_id)) {
      byMember.set(r.profile_id, { reportId: r.id, reportDate: r.report_date });
    }
  }

  return Array.from(byMember.entries()).map(([profileId, v]) => ({
    profileId,
    reportId: v.reportId,
    reportDate: v.reportDate,
  }));
}
