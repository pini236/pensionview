import { waitUntil } from "@vercel/functions";
import { createAdminClient } from "@/lib/supabase/admin";

export function buildPipelineSteps(pageCount: number, isBackfill = false): string[] {
  const steps: string[] = [];
  if (!isBackfill) steps.push("download");
  steps.push("decrypt", "upload_drive");
  for (let i = 1; i <= pageCount; i++) {
    steps.push(`extract_page_${i}`);
  }
  steps.push("validate", "generate_insight", "complete");
  return steps;
}

export function getNextStep(currentStep: string, pageCount: number): string | null {
  const steps = buildPipelineSteps(pageCount);
  const idx = steps.indexOf(currentStep);
  if (idx === -1 || idx === steps.length - 1) return null;
  return steps[idx + 1];
}

export async function createQueueEntries(reportId: string, pageCount: number, isBackfill = false) {
  const admin = createAdminClient();
  const steps = buildPipelineSteps(pageCount, isBackfill);
  const entries = steps.map((step) => ({
    report_id: reportId,
    step,
    status: "pending" as const,
    attempts: 0,
  }));

  const { error } = await admin.from("processing_queue").insert(entries);
  if (error) throw error;
}

export async function advanceQueue(reportId: string, completedStep: string, pageCount: number) {
  const admin = createAdminClient();

  if (completedStep) {
    await admin.from("processing_queue")
      .update({ status: "done", updated_at: new Date().toISOString() })
      .eq("report_id", reportId)
      .eq("step", completedStep);
  }

  const nextStep = completedStep ? getNextStep(completedStep, pageCount) : buildPipelineSteps(pageCount)[0];
  if (!nextStep) return null;

  await admin.from("processing_queue")
    .update({ status: "processing", updated_at: new Date().toISOString() })
    .eq("report_id", reportId)
    .eq("step", nextStep);

  return nextStep;
}

export async function failQueue(reportId: string, step: string, error: string) {
  const admin = createAdminClient();
  const { data } = await admin.from("processing_queue")
    .select("attempts")
    .eq("report_id", reportId)
    .eq("step", step)
    .single();

  const attempts = (data?.attempts ?? 0) + 1;

  await admin.from("processing_queue")
    .update({
      status: attempts >= 3 ? "failed" : "pending",
      attempts,
      error_message: error,
      updated_at: new Date().toISOString(),
    })
    .eq("report_id", reportId)
    .eq("step", step);

  if (attempts >= 3) {
    await admin.from("reports")
      .update({ status: "failed" })
      .eq("id", reportId);
  }
}

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

export async function triggerNextStep(reportId: string, completedStep: string, pageCount: number) {
  const nextStep = await advanceQueue(reportId, completedStep, pageCount);
  if (!nextStep) return;

  const stepToRoute: Record<string, string> = {
    download: "/api/pipeline/download",
    decrypt: "/api/pipeline/decrypt",
    upload_drive: "/api/pipeline/upload-drive",
    validate: "/api/pipeline/validate",
    generate_insight: "/api/pipeline/insight",
    complete: "",
  };

  let route = stepToRoute[nextStep];
  if (!route && nextStep.startsWith("extract_page_")) {
    route = "/api/pipeline/extract";
  }

  if (nextStep === "complete") {
    const admin = createAdminClient();
    await admin.from("reports").update({ status: "done" }).eq("id", reportId);
    await admin.from("processing_queue")
      .update({ status: "done", updated_at: new Date().toISOString() })
      .eq("report_id", reportId)
      .eq("step", "complete");
    return;
  }

  const pageMatch = nextStep.match(/extract_page_(\d+)/);
  const params = new URLSearchParams({ reportId, pageCount: String(pageCount) });
  if (pageMatch) params.set("page", pageMatch[1]);

  // Wrap in waitUntil so Vercel keeps the function alive until the next step
  // has been kicked off. Without this, the parent function exits before the
  // child fetch connects and the chain silently breaks.
  // The internal secret is forwarded so the target route's
  // assertInternalRequest() guard accepts the call.
  waitUntil(
    fetch(`${APP_URL}${route}?${params}`, {
      method: "POST",
      headers: { "x-pipeline-secret": process.env.PIPELINE_INTERNAL_SECRET ?? "" },
    })
      .catch((err) => console.error("Failed to trigger next step:", err))
  );
}
