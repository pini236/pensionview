import { createServerSupabase } from "@/lib/supabase/server";
import { HeroCard } from "@/components/cards/HeroCard";
import { FundCard } from "@/components/cards/FundCard";
import { InsuranceSummary } from "@/components/cards/InsuranceSummary";
import { PensionProjection } from "@/components/charts/PensionProjection";
import type { ProductType } from "@/lib/types";

export default async function DashboardPage() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: profile } = await supabase.from("profiles")
    .select("id, date_of_birth")
    .eq("email", user!.email!)
    .single();

  if (!profile) return <div className="text-text-muted">Profile not found</div>;

  const dob = profile.date_of_birth;
  const currentAge = dob
    ? Math.floor((Date.now() - new Date(dob).getTime()) / (365.25 * 24 * 60 * 60 * 1000))
    : null;

  const { data: latestReport } = await supabase.from("reports")
    .select("id, report_date")
    .eq("profile_id", profile.id)
    .eq("status", "done")
    .order("report_date", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!latestReport) return <div className="text-text-muted">No reports yet</div>;

  const { data: summary } = await supabase.from("report_summary")
    .select("*")
    .eq("report_id", latestReport.id)
    .single();

  const { data: savings } = await supabase.from("savings_products")
    .select("*")
    .eq("report_id", latestReport.id)
    .order("balance", { ascending: false });

  const { data: previousReport } = await supabase.from("reports")
    .select("id")
    .eq("profile_id", profile.id)
    .eq("status", "done")
    .lt("report_date", latestReport.report_date)
    .order("report_date", { ascending: false })
    .limit(1)
    .maybeSingle();

  let previousSummary = null;
  if (previousReport) {
    const { data } = await supabase.from("report_summary")
      .select("total_savings")
      .eq("report_id", previousReport.id)
      .single();
    previousSummary = data;
  }

  const { data: insight } = await supabase.from("report_insights")
    .select("summary_text")
    .eq("report_id", latestReport.id)
    .maybeSingle();

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-12 lg:gap-6">
      {summary && (
        <div className="lg:col-span-8 xl:col-span-7">
          <HeroCard
            totalSavings={summary.total_savings || 0}
            previousTotalSavings={previousSummary?.total_savings || null}
          />
        </div>
      )}

      {insight && (
        <div className="lg:col-span-4 xl:col-span-5">
          <div className="rounded-xl border border-gain/20 bg-surface p-4 h-full">
            <div className="mb-2 flex items-center gap-2 text-sm text-gain">
              <span>&#10024;</span>
              <span className="font-medium">תובנה חודשית</span>
            </div>
            <p className="text-sm leading-relaxed text-text-primary">{insight.summary_text}</p>
          </div>
        </div>
      )}

      <div className="lg:col-span-8 xl:col-span-8 space-y-2 md:space-y-0 md:grid md:grid-cols-2 md:gap-3">
        {savings?.map((fund) => (
          <FundCard
            key={fund.id}
            provider={fund.provider}
            productName={fund.product_name}
            productType={fund.product_type as ProductType}
            balance={fund.balance || 0}
            monthlyReturnPct={fund.monthly_return_pct}
          />
        ))}
      </div>

      <aside className="lg:col-span-4 xl:col-span-4 space-y-4">
        {summary && summary.projected_pension_full !== null && (
          <PensionProjection
            projectedFull={summary.projected_pension_full || 0}
            projectedBase={summary.projected_pension_base || 0}
            currentAge={currentAge}
          />
        )}

        {summary && (
          <InsuranceSummary
            healthExists={summary.health_insurance_exists ?? false}
            lifeAmount={summary.life_insurance_amount || 0}
            disabilityAmount={summary.disability_coverage_amount || 0}
          />
        )}
      </aside>
    </div>
  );
}
