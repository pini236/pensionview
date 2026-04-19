import Anthropic from "@anthropic-ai/sdk";
import { createAdminClient } from "@/lib/supabase/admin";

const client = new Anthropic();

export async function generateInsight(reportId: string) {
  const admin = createAdminClient();

  const { data: report } = await admin.from("reports")
    .select("*, profile:profiles(name)")
    .eq("id", reportId)
    .single();

  if (!report) throw new Error("Report not found");

  const { data: currentSummary } = await admin.from("report_summary")
    .select("*")
    .eq("report_id", reportId)
    .single();

  const { data: currentSavings } = await admin.from("savings_products")
    .select("*")
    .eq("report_id", reportId);

  const { data: previousReport } = await admin.from("reports")
    .select("id")
    .eq("profile_id", report.profile_id)
    .lt("report_date", report.report_date)
    .order("report_date", { ascending: false })
    .limit(1)
    .maybeSingle();

  let previousSummary = null;
  let previousSavings = null;
  if (previousReport) {
    const { data: ps } = await admin.from("report_summary")
      .select("*")
      .eq("report_id", previousReport.id)
      .single();
    previousSummary = ps;

    const { data: psav } = await admin.from("savings_products")
      .select("*")
      .eq("report_id", previousReport.id);
    previousSavings = psav;
  }

  const prompt = `You are a financial advisor writing a brief monthly summary for an Israeli client named ${report.profile?.name || "the client"}.

Current report date: ${report.report_date}

Current summary:
${JSON.stringify(currentSummary, null, 2)}

Current savings products:
${JSON.stringify(currentSavings, null, 2)}

${previousSummary ? `Previous month summary:\n${JSON.stringify(previousSummary, null, 2)}` : "No previous month data available."}

${previousSavings ? `Previous month savings:\n${JSON.stringify(previousSavings, null, 2)}` : ""}

Write a 2-3 sentence summary in Hebrew that:
1. States the total portfolio change (absolute ₪ and percentage)
2. Highlights the best and worst performing fund with brief context from the investment track name (e.g., if it tracks S&P 500 and the market dropped, mention that)
3. Notes any changes in deposits or insurance if applicable

Keep it simple, warm, and reassuring. Use the ₪ symbol with numbers. Do not use technical jargon.
If there's a loss, frame it against the long-term trajectory.
Return ONLY the Hebrew text, no JSON, no markdown.`;

  const startTime = Date.now();

  const response = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 500,
    messages: [{ role: "user", content: prompt }],
  });

  const latencyMs = Date.now() - startTime;

  console.info(JSON.stringify({
    event: "llm_call",
    feature: "insight_generation",
    model: response.model,
    input_tokens: response.usage.input_tokens,
    output_tokens: response.usage.output_tokens,
    cache_read_input_tokens: (response.usage as Record<string, unknown>).cache_read_input_tokens ?? 0,
    cache_creation_input_tokens: (response.usage as Record<string, unknown>).cache_creation_input_tokens ?? 0,
    latency_ms: latencyMs,
    stop_reason: response.stop_reason,
    report_id: reportId,
  }));

  if (response.stop_reason === "max_tokens") {
    console.warn(JSON.stringify({
      event: "insight_truncated",
      report_id: reportId,
      output_tokens: response.usage.output_tokens,
    }));
  }

  const insightText = response.content
    .filter((block) => block.type === "text")
    .map((block) => (block as { type: "text"; text: string }).text)
    .join("");

  if (!insightText.trim()) {
    throw new Error("LLM returned empty insight for report " + reportId);
  }

  await admin.from("report_insights").upsert({
    report_id: reportId,
    summary_text: insightText.trim(),
    generated_at: new Date().toISOString(),
  }, { onConflict: "report_id" });

  return insightText.trim();
}
