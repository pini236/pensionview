import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Self-healing cron. Even with waitUntil, things can still fail (Vercel timeout,
// transient errors, network drops). This endpoint scans the processing_queue for
// items that haven't moved in 3+ minutes and re-triggers them.
//
// Schedule cadence varies by Vercel tier — see vercel.json. On Hobby tier the
// effective cadence is daily; the same route can also be hit manually.
export async function GET() {
  try {
    const admin = createAdminClient();

    // Find queue items that are pending/processing but haven't been touched in >3 min.
    // i.e. the chain has stalled — nothing has progressed.
    const { data: stuck } = await admin
      .from("processing_queue")
      .select("report_id, step, status, updated_at")
      .in("status", ["pending", "processing"])
      .lt("updated_at", new Date(Date.now() - 3 * 60 * 1000).toISOString())
      .limit(50);

    if (!stuck || stuck.length === 0) {
      return NextResponse.json({ ok: true, healed: 0 });
    }

    const reportIds = [...new Set(stuck.map((s) => s.report_id))];
    const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://pensionview.vercel.app";

    // Pipeline-step ordering — must match buildPipelineSteps() in lib/pipeline/queue.ts.
    const stepOrder = (step: string): number => {
      if (step === "download") return 0;
      if (step === "decrypt") return 1;
      if (step === "upload_drive") return 2;
      const m = step.match(/^extract_page_(\d+)$/);
      if (m) return 10 + parseInt(m[1], 10);
      if (step === "validate") return 100;
      if (step === "generate_insight") return 101;
      if (step === "complete") return 102;
      return 999;
    };

    const stepToRoute: Record<string, string> = {
      download: "/api/pipeline/download",
      decrypt: "/api/pipeline/decrypt",
      upload_drive: "/api/pipeline/upload-drive",
      validate: "/api/pipeline/validate",
      generate_insight: "/api/pipeline/insight",
    };

    let healed = 0;
    for (const reportId of reportIds) {
      // For each report, find the FIRST stalled step in pipeline order and re-trigger it.
      const reportSteps = stuck
        .filter((s) => s.report_id === reportId)
        .sort((a, b) => stepOrder(a.step) - stepOrder(b.step));
      const firstStuck = reportSteps[0];
      if (!firstStuck) continue;

      let route = stepToRoute[firstStuck.step];
      const params = new URLSearchParams({ reportId, pageCount: "10" });
      if (!route && firstStuck.step.startsWith("extract_page_")) {
        route = "/api/pipeline/extract";
        params.set("page", firstStuck.step.replace("extract_page_", ""));
      }
      if (!route || firstStuck.step === "complete") continue;

      // Reset status so the route doesn't think it's already in flight.
      await admin
        .from("processing_queue")
        .update({ status: "pending", updated_at: new Date().toISOString() })
        .eq("report_id", reportId)
        .eq("step", firstStuck.step);

      // Fire and don't await — we only need to kick it off and the cron deadline is short.
      // Each kicked-off route uses waitUntil internally to chain the rest.
      fetch(`${APP_URL}${route}?${params}`, { method: "POST" }).catch(() => {});
      healed++;
    }

    return NextResponse.json({ ok: true, healed, total_stuck: reportIds.length });
  } catch (error) {
    console.error("heal-pipelines error:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
