import { createAdminClient } from "@/lib/supabase/admin";

export async function markCurrentStep(
  reportId: string,
  stepName: string,
  detail?: Record<string, unknown>
): Promise<void> {
  const admin = createAdminClient();
  await admin
    .from("reports")
    .update({
      current_step: stepName,
      current_step_detail: {
        ...detail,
        started_at: new Date().toISOString(),
      },
    })
    .eq("id", reportId);
}
