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
  const { data: current } = await admin
    .from("reports")
    .select("current_step_detail")
    .eq("id", reportId)
    .single();

  await admin
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

  logEvent("pipeline.run.failed", {
    feature: "pipeline",
    reportId,
    errorMessage,
    isFatal,
  });
}

// Deterministic single-DB-write step — retry won't help.
recordPipelineFailureStep.maxRetries = 0;
