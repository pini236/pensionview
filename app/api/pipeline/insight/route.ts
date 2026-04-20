import { NextRequest, NextResponse } from "next/server";
import { generateInsight } from "@/lib/pipeline/insight";
import { triggerNextStep, failQueue } from "@/lib/pipeline/queue";
import { assertInternalRequest } from "@/lib/auth-internal";
import { logEvent } from "@/lib/observability";

export async function POST(request: NextRequest) {
  const unauth = assertInternalRequest(request);
  if (unauth) return unauth;

  const { searchParams } = new URL(request.url);
  const reportId = searchParams.get("reportId")!;
  const pageCount = Number(searchParams.get("pageCount") || 10);

  const startedAt = Date.now();

  try {
    const insight = await generateInsight(reportId);
    await triggerNextStep(reportId, "generate_insight", pageCount);

    logEvent("pipeline.step.complete", {
      feature: "pipeline",
      step: "generate_insight",
      reportId,
      durationMs: Date.now() - startedAt,
      pageCount,
    });

    return NextResponse.json({ ok: true, insight });
  } catch (error) {
    logEvent("pipeline.step.failed", {
      feature: "pipeline",
      step: "generate_insight",
      reportId,
      durationMs: Date.now() - startedAt,
      pageCount,
      error,
    });
    await failQueue(reportId, "generate_insight", String(error));
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
