import { getStepMetadata } from "workflow";
import { generateInsight } from "@/lib/pipeline/insight";
import { logEvent } from "@/lib/observability";
import { markCurrentStep } from "@/lib/workflow/mark-current-step";

export async function insightStep({ reportId }: { reportId: string }): Promise<void> {
  "use step";

  await markCurrentStep(reportId, "generate_insight");

  const startedAt = Date.now();
  const { stepId } = getStepMetadata();

  await generateInsight(reportId, stepId);

  logEvent("pipeline.step.complete", {
    feature: "pipeline",
    step: "generate_insight",
    reportId,
    durationMs: Date.now() - startedAt,
  });
}
