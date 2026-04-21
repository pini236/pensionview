import { start, getRun } from "workflow/api";
import { createAdminClient } from "@/lib/supabase/admin";
import { runReportPipeline } from "@/lib/workflow/pipeline";

export async function startReportPipeline({
  reportId,
  isBackfill,
}: {
  reportId: string;
  isBackfill: boolean;
}): Promise<{ runId: string; alreadyRunning: boolean }> {
  const admin = createAdminClient();

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
  }

  const run = await start(runReportPipeline, [{ reportId, isBackfill }]);
  const runId = run.runId;

  const { error: updateError } = await admin
    .from("reports")
    .update({
      workflow_run_id: runId,
      status: "processing",
      current_step: null,
      current_step_detail: null,
    })
    .eq("id", reportId);

  // The partial unique index on workflow_run_id closes a race window: if two
  // callers both called start() before either wrote the DB, the second write
  // fails with a unique-violation. Re-read who won and return their runId.
  if (updateError) {
    const isUniqueViolation =
      (updateError.code === "23505") ||
      updateError.message?.includes("unique");

    if (isUniqueViolation) {
      const { data: winner } = await admin
        .from("reports")
        .select("workflow_run_id")
        .eq("id", reportId)
        .single();

      const winnerRunId = winner?.workflow_run_id as string | null | undefined;
      if (winnerRunId) {
        return { runId: winnerRunId, alreadyRunning: true };
      }
    }

    throw new Error(`Failed to update report with workflow_run_id: ${updateError.message}`);
  }

  return { runId, alreadyRunning: false };
}
