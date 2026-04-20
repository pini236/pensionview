import type { Metadata } from "next";
import { getLocale } from "next-intl/server";
import { Sparkles } from "lucide-react";
import { createServerSupabase } from "@/lib/supabase/server";
import { PortfolioChart } from "@/components/charts/PortfolioChart";
import { PeriodDeltaHero } from "@/components/trends/PeriodDeltaHero";
import { FundChangeGrid } from "@/components/trends/FundChangeGrid";
import { FundChangeCard, type FundChange } from "@/components/trends/FundChangeCard";
import {
  ReturnsTable,
  type ReturnsRow,
} from "@/components/trends/ReturnsTable";
import { LongTermPlaceholder } from "@/components/trends/LongTermPlaceholder";
import { MemberAvatar } from "@/components/members/MemberAvatar";
import { getActiveMember } from "@/lib/active-member";
import { formatCurrency } from "@/lib/format";
import type { Member, ProductType } from "@/lib/types";

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<{ member?: string }>;
}): Promise<Metadata> {
  const sp = await searchParams;
  const active = await getActiveMember(sp);
  const suffix =
    active.kind === "single" ? active.member.name : "Household";
  return { title: `PensionView · ${suffix}` };
}

export default async function TrendsPage({
  searchParams,
}: {
  searchParams: Promise<{ member?: string }>;
}) {
  const supabase = await createServerSupabase();
  const locale = await getLocale();
  const sp = await searchParams;
  const active = await getActiveMember(sp);

  if (active.householdMemberIds.length === 0) {
    return <div className="text-text-muted">Profile not found</div>;
  }

  if (active.kind === "single") {
    return (
      <SingleMemberTrends
        supabase={supabase}
        member={active.member}
        locale={locale}
      />
    );
  }

  return (
    <CombinedTrends
      supabase={supabase}
      members={active.members}
      memberIds={active.householdMemberIds}
      locale={locale}
    />
  );
}

// ---------------------------------------------------------------------------
// Single-member trends (preserves the existing behavior)
// ---------------------------------------------------------------------------

async function SingleMemberTrends({
  supabase,
  member,
  locale,
}: {
  supabase: Awaited<ReturnType<typeof createServerSupabase>>;
  member: Member;
  locale: string;
}) {
  // Last two reports
  const { data: reports } = await supabase
    .from("reports")
    .select("id, report_date")
    .eq("profile_id", member.id)
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

  const { count: totalReports } = await supabase
    .from("reports")
    .select("id", { count: "exact", head: true })
    .eq("profile_id", member.id)
    .eq("status", "done");

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

  const returnsRows: ReturnsRow[] = (currentFundsRaw ?? []).map((f) => ({
    id: f.id,
    productName: f.product_name,
    monthly: f.monthly_return_pct,
    yearly: f.yearly_return_pct,
    cumulative36m: f.cumulative_return_36m_pct,
    cumulative60m: f.cumulative_return_60m_pct,
  }));

  const { data: insight } = await supabase
    .from("report_insights")
    .select("summary_text")
    .eq("report_id", current.id)
    .maybeSingle();

  const currentTotal = currentSummary?.total_savings ?? 0;
  const previousTotal = previousSummary?.total_savings ?? 0;

  const reportsCount = totalReports ?? 0;
  const hasLongTermChart = reportsCount >= 12;

  let portfolioData: Array<{ date: string; value: number }> = [];
  if (hasLongTermChart) {
    const { data: allReports } = await supabase
      .from("reports")
      .select("report_date, report_summary(total_savings)")
      .eq("profile_id", member.id)
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
      <p className="text-xs uppercase tracking-wide text-text-muted">
        {member.name} ·{" "}
        {locale === "he" ? "מגמות אישיות" : "Personal trends"}
      </p>

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

// ---------------------------------------------------------------------------
// Combined household trends — combined delta + per-member sub-rows + per-fund
// change cards (with avatar chip per fund row).
// ---------------------------------------------------------------------------

async function CombinedTrends({
  supabase,
  members,
  memberIds,
  locale,
}: {
  supabase: Awaited<ReturnType<typeof createServerSupabase>>;
  members: Member[];
  memberIds: string[];
  locale: string;
}) {
  const fullLocale = locale === "he" ? "he-IL" : "en-IL";
  // Last two reports per member
  const { data: doneReports } = await supabase
    .from("reports")
    .select("id, profile_id, report_date")
    .in("profile_id", memberIds)
    .eq("status", "done")
    .order("report_date", { ascending: false });

  // Group by profile_id, take top 2
  const reportsByProfile = new Map<
    string,
    Array<{ id: string; report_date: string }>
  >();
  for (const r of doneReports ?? []) {
    const arr = reportsByProfile.get(r.profile_id) ?? [];
    if (arr.length < 2) {
      arr.push({ id: r.id, report_date: r.report_date });
      reportsByProfile.set(r.profile_id, arr);
    }
  }

  if (reportsByProfile.size === 0) {
    return (
      <div className="rounded-2xl border-2 border-dashed border-surface-hover p-12 text-center text-text-muted">
        {locale === "he" ? "אין עדיין דוחות" : "No reports yet"}
      </div>
    );
  }

  const currentReportIds: string[] = [];
  const previousReportIds: string[] = [];
  for (const arr of reportsByProfile.values()) {
    if (arr[0]) currentReportIds.push(arr[0].id);
    if (arr[1]) previousReportIds.push(arr[1].id);
  }

  const allReportIds = [...currentReportIds, ...previousReportIds];

  const [{ data: summaries }, { data: allFunds }] = await Promise.all([
    supabase.from("report_summary").select("report_id, total_savings").in("report_id", allReportIds),
    supabase
      .from("savings_products")
      .select("id, report_id, fund_number, provider, product_name, product_type, balance, yearly_return_pct")
      .in("report_id", allReportIds),
  ]);

  const summaryByReport = new Map<string, number>();
  for (const s of summaries ?? []) {
    summaryByReport.set(s.report_id, s.total_savings ?? 0);
  }

  // Per-member current/previous totals
  let currentTotal = 0;
  let previousTotal = 0;
  const perMember: Array<{
    member: Member;
    current: number;
    previous: number | null;
  }> = [];

  for (const member of members) {
    const reps = reportsByProfile.get(member.id);
    if (!reps || reps.length === 0) continue;
    const cur = summaryByReport.get(reps[0].id) ?? 0;
    const prev = reps[1] ? summaryByReport.get(reps[1].id) ?? null : null;
    currentTotal += cur;
    previousTotal += prev ?? 0;
    perMember.push({ member, current: cur, previous: prev });
  }

  // Earliest / latest report dates across the household for the period banner
  const allDates = Array.from(reportsByProfile.values())
    .flat()
    .map((r) => r.report_date)
    .sort();
  const earliestDate = allDates[0];
  const latestDate = allDates[allDates.length - 1];

  // Per-fund changes (combined). For each member's current fund, look up the
  // matching previous fund within the same member's reports.
  const previousFundIndex = new Map<string, Map<string, number>>(); // memberId -> (fund_number|name -> balance)
  for (const f of allFunds ?? []) {
    if (!previousReportIds.includes(f.report_id)) continue;
    if (f.balance == null) continue;
    // Find which member this report belongs to
    const memberId = [...reportsByProfile.entries()].find(
      ([, arr]) => arr[1]?.id === f.report_id
    )?.[0];
    if (!memberId) continue;
    const idx =
      previousFundIndex.get(memberId) ??
      (() => {
        const m = new Map<string, number>();
        previousFundIndex.set(memberId, m);
        return m;
      })();
    if (f.fund_number) idx.set(`fn:${f.fund_number}`, f.balance);
    if (f.product_name) idx.set(`pn:${f.product_name}`, f.balance);
  }

  const memberById = new Map(members.map((m) => [m.id, m]));
  const fundChanges: Array<{
    member: Member;
    fund: FundChange;
  }> = [];
  for (const f of allFunds ?? []) {
    if (!currentReportIds.includes(f.report_id)) continue;
    const memberId = [...reportsByProfile.entries()].find(
      ([, arr]) => arr[0]?.id === f.report_id
    )?.[0];
    if (!memberId) continue;
    const member = memberById.get(memberId);
    if (!member) continue;
    const idx = previousFundIndex.get(memberId);
    let prev: number | null = null;
    if (idx) {
      if (f.fund_number && idx.has(`fn:${f.fund_number}`)) {
        prev = idx.get(`fn:${f.fund_number}`) ?? null;
      } else if (f.product_name && idx.has(`pn:${f.product_name}`)) {
        prev = idx.get(`pn:${f.product_name}`) ?? null;
      }
    }
    fundChanges.push({
      member,
      fund: {
        id: f.id,
        provider: f.provider,
        productName: f.product_name,
        productType: (f.product_type as ProductType | null) ?? null,
        currentBalance: f.balance ?? 0,
        previousBalance: prev,
        yearlyReturnPct: f.yearly_return_pct,
      },
    });
  }
  // Sort by current balance desc
  fundChanges.sort((a, b) => b.fund.currentBalance - a.fund.currentBalance);

  return (
    <div className="space-y-6">
      <p className="text-xs uppercase tracking-wide text-text-muted">
        {locale === "he" ? "כל המשפחה · מגמות" : "All household · Trends"}
      </p>

      {previousTotal > 0 && earliestDate && latestDate && (
        <PeriodDeltaHero
          currentDate={latestDate}
          previousDate={earliestDate}
          currentTotal={currentTotal}
          previousTotal={previousTotal}
        />
      )}

      {perMember.length > 0 && (
        <div className="space-y-2">
          {perMember.map(({ member, current, previous }) => {
            const delta = previous !== null ? current - previous : null;
            const deltaPct =
              previous && previous > 0 && delta !== null
                ? (delta / previous) * 100
                : null;
            const isGain = (delta ?? 0) >= 0;
            return (
              <div
                key={member.id}
                className="flex items-center justify-between rounded-lg bg-surface px-4 py-3"
              >
                <div className="flex items-center gap-3">
                  <MemberAvatar member={member} size="sm" />
                  <span className="text-sm font-medium text-text-primary">
                    {member.name}
                  </span>
                </div>
                <div className="text-end text-xs">
                  {delta !== null ? (
                    <span
                      className={`tabular-nums ${
                        isGain ? "text-gain" : "text-loss"
                      }`}
                    >
                      <bdi>
                        {isGain ? "+" : "-"}
                        {formatCurrency(Math.abs(delta), fullLocale)}
                        {deltaPct !== null && (
                          <span className="ms-1 text-text-muted">
                            ({isGain ? "+" : ""}
                            {deltaPct.toFixed(1)}%)
                          </span>
                        )}
                      </bdi>
                    </span>
                  ) : (
                    <span className="text-text-muted">
                      {locale === "he" ? "אין השוואה" : "No comparison"}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {fundChanges.length > 0 && (
        <div className="space-y-2">
          {fundChanges.map(({ member, fund }, i) => (
            <FundChangeCard key={fund.id} fund={fund} index={i} member={member} />
          ))}
        </div>
      )}
    </div>
  );
}
