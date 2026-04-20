import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createServerSupabase } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const client = new Anthropic();

export async function POST(request: NextRequest) {
  try {
    const { messages, locale } = await request.json();
    if (!Array.isArray(messages)) {
      return NextResponse.json({ error: "messages required" }, { status: 400 });
    }

    // Auth — get user's household
    const supa = await createServerSupabase();
    const { data: { user } } = await supa.auth.getUser();
    if (!user?.email) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    const admin = createAdminClient();
    const { data: self } = await admin.from("profiles")
      .select("household_id")
      .eq("email", user.email)
      .eq("is_self", true)
      .maybeSingle();
    if (!self) return NextResponse.json({ error: "no household" }, { status: 403 });

    // Load all members + their latest reports + savings + insurance
    const { data: members } = await admin.from("profiles")
      .select("id, name, relationship, date_of_birth")
      .eq("household_id", self.household_id)
      .is("deleted_at", null);

    const memberIds = (members ?? []).map(m => m.id);

    const { data: latestReports } = await admin.from("reports")
      .select("id, profile_id, report_date")
      .in("profile_id", memberIds)
      .eq("status", "done")
      .order("report_date", { ascending: false });

    // Get the latest report per member
    const latestPerMember = new Map<string, string>();
    for (const r of latestReports ?? []) {
      if (!latestPerMember.has(r.profile_id)) latestPerMember.set(r.profile_id, r.id);
    }
    const reportIds = [...latestPerMember.values()];

    const { data: summaries } = await admin.from("report_summary")
      .select("*")
      .in("report_id", reportIds);

    const { data: savings } = await admin.from("savings_products")
      .select("*")
      .in("report_id", reportIds);

    const { data: insurance } = await admin.from("insurance_products")
      .select("*, coverages:insurance_coverages(*)")
      .in("report_id", reportIds);

    // Build the system prompt with household context
    const isHebrew = locale === "he";
    const systemPrompt = `You are PensionView's AI advisor — a sharp, friendly financial guide for Israeli households tracking their pensions.

Always respond in ${isHebrew ? "Hebrew" : "English"}. Be concise, specific, and use the actual numbers from the household's data below. Never generic. If the user asks something the data doesn't support, say so honestly.

Current household snapshot (as of ${new Date().toISOString().slice(0, 10)}):

Members: ${JSON.stringify(members)}
Latest report summaries: ${JSON.stringify(summaries)}
Savings products (latest report per member): ${JSON.stringify(savings)}
Insurance products + coverages: ${JSON.stringify(insurance)}

Israeli context: retirement age in Israel is 67 for men, 65-67 for women. Pension amounts are typically projected at age 67. Average market management fees: pension ~1.85% of deposits + 0.21% of balance, education funds ~0.62% of balance.

Be warm but data-driven. Use ₪ symbol for amounts. If the question is about retirement projection, factor in current balance + monthly deposits + assumed 5% real annual return until age 67.

Never say you're an LLM or mention Claude. You ARE PensionView's advisor.`;

    const response = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1024,
      system: [{ type: "text", text: systemPrompt, cache_control: { type: "ephemeral" } }],
      messages: messages.map((m: { role: string; content: string }) => ({
        role: m.role === "assistant" ? "assistant" : "user",
        content: m.content,
      })),
    });

    const text = response.content
      .filter(b => b.type === "text")
      .map(b => (b as { type: "text"; text: string }).text)
      .join("");

    return NextResponse.json({ message: text });
  } catch (error) {
    console.error("Advisor error:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
