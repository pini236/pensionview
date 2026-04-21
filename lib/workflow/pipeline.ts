import { FatalError } from "workflow";
import { createAdminClient } from "@/lib/supabase/admin";
import { logEvent } from "@/lib/observability";
import { downloadStep } from "@/lib/workflow/steps/download";
import { decryptStep } from "@/lib/workflow/steps/decrypt";
import { resolveDriveFoldersStep } from "@/lib/workflow/steps/resolve-folder";
import { uploadDriveStep } from "@/lib/workflow/steps/upload-drive";
import { extractPageStep } from "@/lib/workflow/steps/extract-page";
import { validateStep } from "@/lib/workflow/steps/validate";
import { insightStep } from "@/lib/workflow/steps/insight";
import { finalizeStep } from "@/lib/workflow/steps/finalize";

export async function runReportPipeline({
  reportId,
  isBackfill,
}: {
  reportId: string;
  isBackfill: boolean;
}): Promise<void> {
  "use workflow";

  try {
    if (!isBackfill) {
      await downloadStep({ reportId });
    }

    const { pageCount } = await decryptStep({ reportId });

    const driveResult = await resolveDriveFoldersStep({ reportId });

    if (!("skipped" in driveResult)) {
      await uploadDriveStep({ reportId, subfolderId: driveResult.subfolderId });
    }

    for (let p = 1; p <= pageCount; p++) {
      await extractPageStep({ reportId, page: p, pageCount });
    }

    await validateStep({ reportId, pageCount });
    await insightStep({ reportId });
    await finalizeStep({ reportId });
  } catch (error) {
    // FatalError and errors exhausting WDK's retry budget both land here.
    // Re-throw anything that is a FatalError — WDK needs to see it to mark
    // the run as failed. For everything else we write status=failed and then
    // rethrow so the run record also reflects failure.
    const isFatal = error instanceof FatalError;
    const errorMessage = error instanceof Error ? error.message : String(error);

    const admin = createAdminClient();

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
        },
      })
      .eq("id", reportId);

    logEvent("pipeline.step.failed", {
      feature: "pipeline",
      step: "pipeline",
      reportId,
      error,
      isFatal,
    });

    throw error;
  }
}
