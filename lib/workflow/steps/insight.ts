import { generateInsight } from "@/lib/pipeline/insight";
import { logEvent } from "@/lib/observability";
import { markCurrentStep } from "@/lib/workflow/mark-current-step";

export async function insightStep({ reportId }: { reportId: string }): Promise<void> {
  "use step";

  await markCurrentStep(reportId, "generate_insight");

  // WDK step memoization + storage-existence guard handle dedup; Anthropic Messages API has no client idempotency header.
  const startedAt = Date.now();

  await generateInsight(reportId);

  logEvent("pipeline.step.complete", {
    feature: "pipeline",
    step: "generate_insight",
    reportId,
    durationMs: Date.now() - startedAt,
  });
}

// Anthropic API call — 529 overloads + transient errors are common.
insightStep.maxRetries = 4;
