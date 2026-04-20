import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { validateAndStore } from "@/lib/pipeline/validate";
import { triggerNextStep, failQueue } from "@/lib/pipeline/queue";
import { assertInternalRequest } from "@/lib/auth-internal";

export async function POST(request: NextRequest) {
  const unauth = assertInternalRequest(request);
  if (unauth) return unauth;

  const { searchParams } = new URL(request.url);
  const reportId = searchParams.get("reportId")!;
  const pageCount = Number(searchParams.get("pageCount") || 10);

  try {
    const admin = createAdminClient();

    const { data: report } = await admin.from("reports")
      .select("profile_id")
      .eq("id", reportId)
      .single();

    if (!report) throw new Error("Report not found");

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

    await triggerNextStep(reportId, "validate", pageCount);
    return NextResponse.json({ ok: true, pagesProcessed: pages.length });
  } catch (error) {
    await failQueue(reportId, "validate", String(error));
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
