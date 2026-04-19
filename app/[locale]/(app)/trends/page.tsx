import { createServerSupabase } from "@/lib/supabase/server";
import { PortfolioChart } from "@/components/charts/PortfolioChart";
import { ReturnsBarChart } from "@/components/charts/ReturnsBarChart";
import { DepositsDonut } from "@/components/charts/DepositsDonut";
import type { ProductType } from "@/lib/types";

export default async function TrendsPage() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: profile } = await supabase.from("profiles")
    .select("id")
    .eq("email", user!.email!)
    .single();

  if (!profile) return <div className="text-text-muted">Profile not found</div>;

  // Get all reports with their summaries for trend chart
  const { data: reports } = await supabase.from("reports")
    .select("report_date, report_summary(total_savings)")
    .eq("profile_id", profile.id)
    .eq("status", "done")
    .order("report_date", { ascending: true });

  const portfolioData = (reports || [])
    .map((r) => ({
      date: r.report_date,
      value: (() => {
        const raw = r.report_summary as { total_savings: number | null } | { total_savings: number | null }[] | null;
        const summary = Array.isArray(raw) ? raw[0] : raw;
        return summary?.total_savings ?? 0;
      })(),
    }))
    .filter((d) => d.value > 0);

  // Get latest report for fund returns
  const { data: latestReport } = await supabase.from("reports")
    .select("id")
    .eq("profile_id", profile.id)
    .eq("status", "done")
    .order("report_date", { ascending: false })
    .limit(1)
    .maybeSingle();

  let funds: Array<{
    productName: string;
    productType: ProductType;
    monthly: number | null;
    yearly: number | null;
    cumulative36m: number | null;
    cumulative60m: number | null;
  }> = [];

  if (latestReport) {
    const { data } = await supabase.from("savings_products")
      .select("product_name, product_type, monthly_return_pct, yearly_return_pct, cumulative_return_36m_pct, cumulative_return_60m_pct")
      .eq("report_id", latestReport.id)
      .order("balance", { ascending: false });

    funds = (data || []).map((f) => ({
      productName: f.product_name,
      productType: f.product_type as ProductType,
      monthly: f.monthly_return_pct,
      yearly: f.yearly_return_pct,
      cumulative36m: f.cumulative_return_36m_pct,
      cumulative60m: f.cumulative_return_60m_pct,
    }));
  }

  const deposits = (latestReport ? (await supabase.from("savings_products")
    .select("product_name, product_type, monthly_deposit")
    .eq("report_id", latestReport.id)).data : null) || [];

  const depositSlices = deposits.map((d) => ({
    productName: d.product_name,
    productType: d.product_type as ProductType,
    amount: d.monthly_deposit ?? 0,
  })).filter((d) => d.amount > 0);

  const totalDeposits = depositSlices.reduce((sum, d) => sum + d.amount, 0);

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <section className="lg:col-span-2">
        <h2 className="mb-3 text-lg font-medium text-text-primary">צמיחת תיק</h2>
        <PortfolioChart data={portfolioData} />
      </section>

      <section>
        <h2 className="mb-3 text-lg font-medium text-text-primary">תשואות לפי קרן</h2>
        <ReturnsBarChart funds={funds} />
      </section>

      {depositSlices.length > 0 && (
        <section>
          <h2 className="mb-3 text-lg font-medium text-text-primary">פילוח הפקדות</h2>
          <DepositsDonut deposits={depositSlices} total={totalDeposits} />
        </section>
      )}
    </div>
  );
}
