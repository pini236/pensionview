import { createAdminClient } from "@/lib/supabase/admin";
import { logEvent } from "@/lib/observability";
import { markCurrentStep } from "@/lib/workflow/mark-current-step";

export async function finalizeStep({ reportId }: { reportId: string }): Promise<void> {
  "use step";

  await markCurrentStep(reportId, "complete");

  const admin = createAdminClient();

  await admin
    .from("reports")
    .update({
      status: "done",
      current_step: null,
      current_step_detail: null,
    })
    .eq("id", reportId);

  logEvent("pipeline.step.complete", {
    feature: "pipeline",
    step: "complete",
    reportId,
  });
}
