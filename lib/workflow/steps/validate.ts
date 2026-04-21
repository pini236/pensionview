import { createAdminClient } from "@/lib/supabase/admin";
import { validateAndStore } from "@/lib/pipeline/validate";
import { logEvent } from "@/lib/observability";
import { markCurrentStep } from "@/lib/workflow/mark-current-step";

export async function validateStep({
  reportId,
  pageCount,
}: {
  reportId: string;
  pageCount: number;
}): Promise<void> {
  "use step";

  await markCurrentStep(reportId, "validate");

  const startedAt = Date.now();
  const admin = createAdminClient();

  const { data: report } = await admin
    .from("reports")
    .select("profile_id")
    .eq("id", reportId)
    .single();

  if (!report) throw new Error(`Report ${reportId} not found`);

  const pages = [];
  for (let i = 1; i <= pageCount; i++) {
    const path = `reports/${report.profile_id}/extractions/${reportId}/page_${i}.json`;
    const { data } = await admin.storage.from("reports").download(path);
    if (data) {
      const text = await data.text();
      pages.push(JSON.parse(text));
    }
  }

  await validateAndStore(reportId, pages);

  logEvent("pipeline.step.complete", {
    feature: "pipeline",
    step: "validate",
    reportId,
    durationMs: Date.now() - startedAt,
    pagesProcessed: pages.length,
    pageCount,
  });
}
