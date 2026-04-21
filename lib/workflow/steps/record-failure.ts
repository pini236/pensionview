import { createAdminClient } from "@/lib/supabase/admin";
import { logEvent } from "@/lib/observability";

export async function recordPipelineFailureStep({
  reportId,
  errorMessage,
  isFatal,
}: {
  reportId: string;
  errorMessage: string;
  isFatal: boolean;
}): Promise<void> {
  "use step";

  const admin = createAdminClient();

  // Read existing detail so we preserve the in-flight context (page number, etc.)
  // that markCurrentStep wrote at step entry.
  const { data: current, error: readErr } = await admin
    .from("reports")
    .select("current_step_detail")
    .eq("id", reportId)
    .single();

  if (readErr) {
    logEvent("pipeline.failure_record.read_error", {
      feature: "pipeline",
      reportId,
      error: readErr,
    });
    // Continue with empty detail rather than abort — recording the failure
    // (even without in-flight context) is more important than perfect detail.
  }

  const { error: writeErr } = await admin
    .from("reports")
    .update({
      status: "failed",
      current_step_detail: {
        ...(current?.current_step_detail ?? {}),
        failure_reason: errorMessage,
        failed_at: new Date().toISOString(),
        is_fatal: isFatal,
      },
    })
    .eq("id", reportId);

  if (writeErr) {
    logEvent("pipeline.failure_record.write_error", {
      feature: "pipeline",
      reportId,
      error: writeErr,
    });
    throw writeErr; // let WDK retry the step (maxRetries is 0, so this throws once
                    // and surfaces in the workflow run as a failed step — visible
                    // in the WDK dashboard, much better than silent stuck-in-processing)
  }

  logEvent("pipeline.run.failed", {
    feature: "pipeline",
    reportId,
    errorMessage,
    isFatal,
  });
}

// Deterministic single-DB-write step — retry won't help.
recordPipelineFailureStep.maxRetries = 0;
