import { start, getRun } from "workflow/api";
import { createAdminClient } from "@/lib/supabase/admin";
import { runReportPipeline } from "@/lib/workflow/pipeline";
import { logEvent } from "@/lib/observability";

const TERMINAL_STATUSES = new Set(["done", "failed", "cancelled"]);

export async function startReportPipeline({
  reportId,
  isBackfill,
}: {
  reportId: string;
  isBackfill: boolean;
}): Promise<{ runId: string; alreadyRunning: boolean }> {
  const admin = createAdminClient();

  // --- Pre-check ---
  const { data: report } = await admin
    .from("reports")
    .select("workflow_run_id")
    .eq("id", reportId)
    .single();

  const existingRunId = report?.workflow_run_id as string | null | undefined;

  if (existingRunId) {
    const run = getRun(existingRunId);
    const status = await run.status;

    if (status === "running") {
      return { runId: existingRunId, alreadyRunning: true };
    }

    if (TERMINAL_STATUSES.has(status)) {
      // Option C: a prior run finished — clear the stale runId so the CAS
      // UPDATE below can proceed with a fresh run. If two callers both reach
      // this branch concurrently the second NULL-out is a harmless no-op.
      await admin
        .from("reports")
        .update({ workflow_run_id: null })
        .eq("id", reportId)
        .eq("workflow_run_id", existingRunId);
    }
  }

  // --- Start WDK run ---
  const run = await start(runReportPipeline, [{ reportId, isBackfill }]);
  const newRunId = run.runId;

  // --- CAS UPDATE: win the slot only if no other caller beat us ---
  // WHERE workflow_run_id IS NULL ensures at most one caller succeeds; the
  // partial unique index on workflow_run_id is retained as belt-and-braces.
  const { data: casResult, error: casError } = await admin
    .from("reports")
    .update({
      workflow_run_id: newRunId,
      status: "processing",
      current_step: null,
      current_step_detail: null,
    })
    .eq("id", reportId)
    .is("workflow_run_id", null)
    .select("workflow_run_id");

  if (casError) {
    throw new Error(
      `CAS UPDATE failed for report ${reportId}: ${casError.message}`
    );
  }

  if (casResult && casResult.length === 1) {
    // We won the race.
    return { runId: newRunId, alreadyRunning: false };
  }

  // We lost the race — another caller wrote their runId first. Our WDK run
  // is now an orphan. The WDK API does not expose run cancellation; log a
  // warning so the leak is visible in observability tooling.
  const { data: winner } = await admin
    .from("reports")
    .select("workflow_run_id")
    .eq("id", reportId)
    .single();

  const winnerRunId = winner?.workflow_run_id as string | null | undefined;

  logEvent("pipeline.orphan_run", {
    feature: "pipeline",
    reportId,
    orphanRunId: newRunId,
    winnerRunId: winnerRunId ?? "unknown",
    warning:
      "WDK run started but lost CAS race; run will execute untracked. " +
      "WDK API does not expose cancellation — manual cleanup may be required.",
  });

  return { runId: winnerRunId ?? newRunId, alreadyRunning: true };
}
