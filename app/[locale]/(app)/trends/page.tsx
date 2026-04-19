import { getLocale } from "next-intl/server";
import { Sparkles } from "lucide-react";
import { createServerSupabase } from "@/lib/supabase/server";
import { PortfolioChart } from "@/components/charts/PortfolioChart";
import { PeriodDeltaHero } from "@/components/trends/PeriodDeltaHero";
import { FundChangeGrid } from "@/components/trends/FundChangeGrid";
import {
  ReturnsTable,
  type ReturnsRow,
} from "@/components/trends/ReturnsTable";
import { LongTermPlaceholder } from "@/components/trends/LongTermPlaceholder";
import type { FundChange } from "@/components/trends/FundChangeCard";
import type { ProductType } from "@/lib/types";

export default async function TrendsPage() {
  const supabase = await createServerSupabase();
  const locale = await getLocale();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select("id")
    .eq("email", user!.email!)
    .single();

  if (!profile) {
    return <div className="text-text-muted">Profile not found</div>;
  }

  // Last two reports
  const { data: reports } = await supabase
    .from("reports")
    .select("id, report_date")
    .eq("profile_id", profile.id)
    .eq("status", "done")
    .order("report_date", { ascending: false })
    .limit(2);

  if (!reports || reports.length === 0) {
    return (
      <div className="rounded-2xl border-2 border-dashed border-surface-hover p-12 text-center text-text-muted">
        {locale === "he" ? "אין עדיין דוחות" : "No reports yet"}
      </div>
    );
  }

  const current = reports[0];
  const previous = reports.length > 1 ? reports[1] : null;

  // Total reports count for long-term gate
  const { count: totalReports } = await supabase
    .from("reports")
    .select("id", { count: "exact", head: true })
    .eq("profile_id", profile.id)
    .eq("status", "done");

  // Summaries
  const { data: currentSummary } = await supabase
    .from("report_summary")
    .select("total_savings")
    .eq("report_id", current.id)
    .maybeSingle();

  let previousSummary: { total_savings: number | null } | null = null;
  if (previous) {
    const { data } = await supabase
      .from("report_summary")
      .select("total_savings")
      .eq("report_id", previous.id)
      .maybeSingle();
    previousSummary = data;
  }

  // Per-fund: get savings products from both reports
  const { data: currentFundsRaw } = await supabase
    .from("savings_products")
    .select(
      "id, fund_number, provider, product_name, product_type, balance, monthly_return_pct, yearly_return_pct, cumulative_return_36m_pct, cumulative_return_60m_pct"
    )
    .eq("report_id", current.id)
    .order("balance", { ascending: false });

  let previousFundsRaw:
    | Array<{
        fund_number: string | null;
        product_name: string | null;
        balance: number | null;
      }>
    | null = null;
  if (previous) {
    const { data } = await supabase
      .from("savings_products")
      .select("fund_number, product_name, balance")
      .eq("report_id", previous.id);
    previousFundsRaw = data;
  }

  // Index previous funds by fund_number (with product_name fallback)
  const previousByFundNumber = new Map<string, number>();
  const previousByProductName = new Map<string, number>();
  for (const p of previousFundsRaw ?? []) {
    if (p.balance == null) continue;
    if (p.fund_number) previousByFundNumber.set(p.fund_number, p.balance);
    if (p.product_name) previousByProductName.set(p.product_name, p.balance);
  }

  const funds: FundChange[] = (currentFundsRaw ?? []).map((f) => {
    let prev: number | null = null;
    if (f.fund_number && previousByFundNumber.has(f.fund_number)) {
      prev = previousByFundNumber.get(f.fund_number) ?? null;
    } else if (f.product_name && previousByProductName.has(f.product_name)) {
      prev = previousByProductName.get(f.product_name) ?? null;
    }
    return {
      id: f.id,
      provider: f.provider,
      productName: f.product_name,
      productType: (f.product_type as ProductType | null) ?? null,
      currentBalance: f.balance ?? 0,
      previousBalance: prev,
      yearlyReturnPct: f.yearly_return_pct,
    };
  });

  // Returns table rows from the latest report
  const returnsRows: ReturnsRow[] = (currentFundsRaw ?? []).map((f) => ({
    id: f.id,
    productName: f.product_name,
    monthly: f.monthly_return_pct,
    yearly: f.yearly_return_pct,
    cumulative36m: f.cumulative_return_36m_pct,
    cumulative60m: f.cumulative_return_60m_pct,
  }));

  // Insight from latest report
  const { data: insight } = await supabase
    .from("report_insights")
    .select("summary_text")
    .eq("report_id", current.id)
    .maybeSingle();

  const currentTotal = currentSummary?.total_savings ?? 0;
  const previousTotal = previousSummary?.total_savings ?? 0;

  const reportsCount = totalReports ?? 0;
  const hasLongTermChart = reportsCount >= 12;

  // Long-term portfolio data (only when we have 12+)
  let portfolioData: Array<{ date: string; value: number }> = [];
  if (hasLongTermChart) {
    const { data: allReports } = await supabase
      .from("reports")
      .select("report_date, report_summary(total_savings)")
      .eq("profile_id", profile.id)
      .eq("status", "done")
      .order("report_date", { ascending: true });

    portfolioData = (allReports ?? [])
      .map((r) => ({
        date: r.report_date,
        value: (() => {
          const raw = r.report_summary as
            | { total_savings: number | null }
            | { total_savings: number | null }[]
            | null;
          const summary = Array.isArray(raw) ? raw[0] : raw;
          return summary?.total_savings ?? 0;
        })(),
      }))
      .filter((d) => d.value > 0);
  }

  const insightLabel =
    locale === "he" ? "תובנה מהדוח האחרון" : "Insight from latest report";

  return (
    <div className="space-y-6">
      {previous && (
        <PeriodDeltaHero
          currentDate={current.report_date}
          previousDate={previous.report_date}
          currentTotal={currentTotal}
          previousTotal={previousTotal}
        />
      )}

      {funds.length > 0 && <FundChangeGrid funds={funds} />}

      {insight?.summary_text && (
        <div className="rounded-2xl border-s-2 border-gain bg-surface p-4 lg:max-w-3xl">
          <div className="mb-2 flex items-center gap-2 text-sm text-gain">
            <Sparkles size={14} />
            <span className="font-medium">{insightLabel}</span>
          </div>
          <p className="text-sm leading-relaxed text-text-primary">
            {insight.summary_text}
          </p>
        </div>
      )}

      {returnsRows.length > 0 && <ReturnsTable rows={returnsRows} />}

      {hasLongTermChart ? (
        <PortfolioChart data={portfolioData} />
      ) : (
        <LongTermPlaceholder reportsCount={reportsCount} />
      )}
    </div>
  );
}
