import { NextRequest, NextResponse } from "next/server";
import { generateInsight } from "@/lib/pipeline/insight";
import { triggerNextStep, failQueue } from "@/lib/pipeline/queue";

export async function POST(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const reportId = searchParams.get("reportId")!;
  const pageCount = Number(searchParams.get("pageCount") || 10);

  try {
    const insight = await generateInsight(reportId);
    await triggerNextStep(reportId, "generate_insight", pageCount);
    return NextResponse.json({ ok: true, insight });
  } catch (error) {
    await failQueue(reportId, "generate_insight", String(error));
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
