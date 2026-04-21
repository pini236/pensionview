import { FatalError } from "workflow";
import { downloadStep } from "@/lib/workflow/steps/download";
import { decryptStep } from "@/lib/workflow/steps/decrypt";
import { resolveDriveFoldersStep } from "@/lib/workflow/steps/resolve-folder";
import { uploadDriveStep } from "@/lib/workflow/steps/upload-drive";
import { extractPageStep } from "@/lib/workflow/steps/extract-page";
import { validateStep } from "@/lib/workflow/steps/validate";
import { insightStep } from "@/lib/workflow/steps/insight";
import { finalizeStep } from "@/lib/workflow/steps/finalize";
import { recordPipelineFailureStep } from "@/lib/workflow/steps/record-failure";

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
    // The workflow sandbox forbids Node.js modules — use a "use step" helper
    // so the DB write runs in a normal Node.js context.
    const isFatal = error instanceof FatalError;
    const errorMessage = error instanceof Error ? error.message : String(error);

    try {
      await recordPipelineFailureStep({ reportId, errorMessage, isFatal });
    } catch (recordErr) {
      // Don't mask the original error. The failure-step itself logs its
      // own errors via logEvent, so we just need to ensure the original
      // pipeline error is what gets re-thrown.
      console.error("recordPipelineFailureStep failed:", recordErr);
    }

    throw error;
  }
}
