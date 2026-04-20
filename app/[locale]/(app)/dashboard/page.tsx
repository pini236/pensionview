import type { Metadata } from "next";
import { createServerSupabase } from "@/lib/supabase/server";
import { HeroCard } from "@/components/cards/HeroCard";
import { FundCardGrid } from "@/components/cards/FundCardGrid";
import { InsuranceSummary } from "@/components/cards/InsuranceSummary";
import { InsuranceMatrix, type InsuranceMatrixRow } from "@/components/cards/InsuranceMatrix";
import { InsightCard } from "@/components/cards/InsightCard";
import { DepositAlertsCard } from "@/components/alerts/DepositAlertsCard";
import { FeeAnalysisCard } from "@/components/insights/FeeAnalysisCard";
import { RetirementGoalCard } from "@/components/insights/RetirementGoalCard";
import { HouseholdHero } from "@/components/members/HouseholdHero";
import type { ShareSegment } from "@/components/members/MemberShareBar";
import { NoReportsState } from "@/components/empty-states/NoReportsState";
import { getActiveMember } from "@/lib/active-member";
import {
  detectDepositAlerts,
  groupFundHistories,
} from "@/lib/insights/deposit-alerts";
import { analyzeFees } from "@/lib/insights/fee-analyzer";
import type { Member, ProductType, SavingsProduct } from "@/lib/types";

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

export default async function DashboardPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ member?: string }>;
}) {
  const supabase = await createServerSupabase();
  const sp = await searchParams;
  const { locale } = await params;
  const active = await getActiveMember(sp);

  if (active.householdMemberIds.length === 0) {
    return <div className="text-text-muted">Profile not found</div>;
  }

  // Single-member view (default UX)
  if (active.kind === "single") {
    return (
      <SingleMemberDashboard supabase={supabase} member={active.member} locale={locale} />
    );
  }

  // Combined household view: goal is the household head's (self) goal.
  const selfMember = active.members.find((m) => m.is_self) ?? active.members[0];
  return (
    <CombinedDashboard
      supabase={supabase}
      members={active.members}
      memberIds={active.householdMemberIds}
      selfMemberId={selfMember.id}
      locale={locale}
    />
  );
}

// ---------------------------------------------------------------------------
// Single-member dashboard (preserves the original layout, plus per-member
// reinforcement).
// ---------------------------------------------------------------------------

async function SingleMemberDashboard({
  supabase,
  member,
  locale,
}: {
  supabase: Awaited<ReturnType<typeof createServerSupabase>>;
  member: Member;
  locale: string;
}) {
  const { data: profile } = await supabase
    .from("profiles")
    .select("id, date_of_birth, retirement_goal_monthly, retirement_age")
    .eq("id", member.id)
    .single();

  if (!profile) return <div className="text-text-muted">Profile not found</div>;

  const dob = profile.date_of_birth;
  const currentAge = dob
    ? Math.floor((Date.now() - new Date(dob).getTime()) / (365.25 * 24 * 60 * 60 * 1000))
    : null;

  const { data: latestReport } = await supabase
    .from("reports")
    .select("id, report_date")
    .eq("profile_id", profile.id)
    .eq("status", "done")
    .order("report_date", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!latestReport) return <NoReportsState memberName={member.name} />;

  const { data: summary } = await supabase
    .from("report_summary")
    .select("*")
    .eq("report_id", latestReport.id)
    .single();

  const { data: savings } = await supabase
    .from("savings_products")
    .select("*")
    .eq("report_id", latestReport.id)
    .order("balance", { ascending: false });

  const { data: previousReport } = await supabase
    .from("reports")
    .select("id")
    .eq("profile_id", profile.id)
    .eq("status", "done")
    .lt("report_date", latestReport.report_date)
    .order("report_date", { ascending: false })
    .limit(1)
    .maybeSingle();

  let previousSummary = null;
  if (previousReport) {
    const { data } = await supabase
      .from("report_summary")
      .select("total_savings")
      .eq("report_id", previousReport.id)
      .single();
    previousSummary = data;
  }

  const { data: insight } = await supabase
    .from("report_insights")
    .select("summary_text")
    .eq("report_id", latestReport.id)
    .maybeSingle();

  // -------------------------------------------------------------------------
  // Sparkline data prep — last 6 reports, build per-fund balance history.
  // Self-contained block so it doesn't conflict with parallel features.
  // -------------------------------------------------------------------------
  const { data: sparkReports } = await supabase
    .from("reports")
    .select("id, report_date")
    .eq("profile_id", profile.id)
    .eq("status", "done")
    .order("report_date", { ascending: false })
    .limit(6);

  const sparkReportIds = (sparkReports ?? []).map((r) => r.id);
  const sparkReportDateById = new Map(
    (sparkReports ?? []).map((r) => [r.id, r.report_date as string])
  );

  const historyByFundKey = new Map<string, number[]>();
  if (sparkReportIds.length > 0) {
    const { data: sparkSavings } = await supabase
      .from("savings_products")
      .select("report_id, fund_number, product_name, balance")
      .in("report_id", sparkReportIds);

    const seenKeys = new Set<string>();
    for (const row of sparkSavings ?? []) {
      const key = row.fund_number ?? row.product_name;
      if (!key) continue;
      seenKeys.add(key);
    }
    for (const key of seenKeys) {
      const points = (sparkSavings ?? [])
        .filter((s) => (s.fund_number ?? s.product_name) === key)
        .map((s) => ({
          date: sparkReportDateById.get(s.report_id) ?? "",
          balance: Number(s.balance ?? 0),
        }))
        .sort((a, b) => a.date.localeCompare(b.date))
        .map((p) => p.balance);
      historyByFundKey.set(key, points);
    }
  }

  // Deposit verification: pull latest report + up to 3 prior so we can compare
  // monthly_deposit per fund across reports.
  const { data: historyReports } = await supabase
    .from("reports")
    .select("id, report_date")
    .eq("profile_id", profile.id)
    .eq("status", "done")
    .order("report_date", { ascending: false })
    .limit(4);

  const historyReportIds = (historyReports ?? []).map((r) => r.id);
  let depositAlerts: ReturnType<typeof detectDepositAlerts> = [];
  if (historyReportIds.length >= 2) {
    const { data: historySavings } = await supabase
      .from("savings_products")
      .select("report_id, fund_number, product_name, provider, monthly_deposit")
      .in("report_id", historyReportIds);

    const reportDateById = new Map(
      (historyReports ?? []).map((r) => [r.id, r.report_date])
    );
    const rows = (historySavings ?? []).map((s) => ({
      fund_number: s.fund_number,
      product_name: s.product_name,
      provider: s.provider,
      monthly_deposit: s.monthly_deposit,
      report_date: reportDateById.get(s.report_id) ?? "",
    }));
    depositAlerts = detectDepositAlerts(groupFundHistories(rows));
  }

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-12 lg:gap-6">
      {summary && (
        <div className="min-w-0 lg:col-span-8 xl:col-span-7">
          <HeroCard
            totalSavings={summary.total_savings || 0}
            previousTotalSavings={previousSummary?.total_savings || null}
            memberName={member.name}
            memberColor={member.avatar_color}
          />
        </div>
      )}

      {insight && (
        <div className="min-w-0 lg:col-span-4 xl:col-span-5">
          <InsightCard text={insight.summary_text} label="תובנה חודשית" />
        </div>
      )}

      <div className="min-w-0 lg:col-span-12">
        <DepositAlertsCard alerts={depositAlerts} />
      </div>

      <div className="min-w-0 lg:col-span-12">
        <FeeAnalysisCard
          analyses={analyzeFees((savings ?? []) as SavingsProduct[])}
        />
      </div>

      <div className="min-w-0 lg:col-span-8 xl:col-span-8">
        <FundCardGrid
          funds={(savings || []).map((fund) => ({
            id: fund.id,
            provider: fund.provider,
            product_name: fund.product_name,
            product_type: fund.product_type as ProductType,
            balance: fund.balance,
            monthly_return_pct: fund.monthly_return_pct,
            history: historyByFundKey.get(fund.fund_number ?? fund.product_name),
          }))}
        />
      </div>

      <aside className="min-w-0 lg:col-span-4 xl:col-span-4 space-y-4">
        <RetirementGoalCard
          projectedFull={summary?.projected_pension_full ?? 0}
          goalMonthly={profile.retirement_goal_monthly ?? null}
          currentAge={currentAge}
          retirementAge={profile.retirement_age ?? 67}
          monthlyDeposits={summary?.monthly_deposits ?? 0}
          locale={locale}
        />

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

// ---------------------------------------------------------------------------
// Combined household dashboard (all members).
// ---------------------------------------------------------------------------

async function CombinedDashboard({
  supabase,
  members,
  memberIds,
  selfMemberId,
  locale,
}: {
  supabase: Awaited<ReturnType<typeof createServerSupabase>>;
  members: Member[];
  memberIds: string[];
  selfMemberId: string;
  locale: string;
}) {
  // Household head's retirement goal + DOB (for currentAge in combined view).
  const { data: headProfile } = await supabase
    .from("profiles")
    .select("retirement_goal_monthly, retirement_age, date_of_birth")
    .eq("id", selfMemberId)
    .single();

  const headDob = headProfile?.date_of_birth ?? null;
  const headAge = headDob
    ? Math.floor((Date.now() - new Date(headDob).getTime()) / (365.25 * 24 * 60 * 60 * 1000))
    : null;

  // Latest report per member, in one query
  const { data: doneReports } = await supabase
    .from("reports")
    .select("id, profile_id, report_date")
    .in("profile_id", memberIds)
    .eq("status", "done")
    .order("report_date", { ascending: false });

  // Pick the latest report per profile
  const latestByProfile = new Map<string, { id: string; report_date: string }>();
  for (const r of doneReports ?? []) {
    if (!latestByProfile.has(r.profile_id)) {
      latestByProfile.set(r.profile_id, { id: r.id, report_date: r.report_date });
    }
  }
  const latestReportIds = Array.from(latestByProfile.values()).map((r) => r.id);

  // No data yet
  if (latestReportIds.length === 0) {
    return <NoReportsState />;
  }

  // Pull summaries, savings, insight in parallel
  const [{ data: summaries }, { data: savings }, { data: insights }] =
    await Promise.all([
      supabase.from("report_summary").select("*").in("report_id", latestReportIds),
      supabase.from("savings_products").select("*").in("report_id", latestReportIds).order("balance", { ascending: false }),
      supabase.from("report_insights").select("*").in("report_id", latestReportIds),
    ]);

  // Map report_id -> profile_id for joining
  const reportToProfile = new Map<string, string>();
  for (const [profileId, r] of latestByProfile.entries()) {
    reportToProfile.set(r.id, profileId);
  }

  // Total savings per member + grand total
  const perMemberTotal: Record<string, number> = {};
  let grandTotal = 0;
  for (const s of summaries ?? []) {
    const profileId = reportToProfile.get(s.report_id);
    if (!profileId) continue;
    const value = s.total_savings ?? 0;
    perMemberTotal[profileId] = (perMemberTotal[profileId] ?? 0) + value;
    grandTotal += value;
  }

  // Share segments
  const segments: ShareSegment[] = members
    .map((m) => ({
      memberId: m.id,
      name: m.name,
      color: m.avatar_color,
      value: perMemberTotal[m.id] ?? 0,
    }))
    .filter((s) => s.value > 0);

  // -------------------------------------------------------------------------
  // Sparkline data prep — last 6 reports per household member, build per-fund
  // balance history. Keyed by `${profileId}:${fund_number ?? product_name}` so
  // identical fund_numbers across members don't collide.
  // -------------------------------------------------------------------------
  const sparkReportsByProfile = new Map<string, { id: string; report_date: string }[]>();
  for (const r of doneReports ?? []) {
    const arr = sparkReportsByProfile.get(r.profile_id) ?? [];
    if (arr.length < 6) {
      arr.push({ id: r.id, report_date: r.report_date });
      sparkReportsByProfile.set(r.profile_id, arr);
    }
  }
  const sparkAllReportIds: string[] = [];
  const sparkReportToProfile = new Map<string, string>();
  const sparkReportDateById = new Map<string, string>();
  for (const [profileId, reports] of sparkReportsByProfile.entries()) {
    for (const r of reports) {
      sparkAllReportIds.push(r.id);
      sparkReportToProfile.set(r.id, profileId);
      sparkReportDateById.set(r.id, r.report_date);
    }
  }

  const historyByFundKey = new Map<string, number[]>();
  if (sparkAllReportIds.length > 0) {
    const { data: sparkSavings } = await supabase
      .from("savings_products")
      .select("report_id, fund_number, product_name, balance")
      .in("report_id", sparkAllReportIds);

    const seenKeys = new Set<string>();
    for (const row of sparkSavings ?? []) {
      const fundKey = row.fund_number ?? row.product_name;
      const profileId = sparkReportToProfile.get(row.report_id);
      if (!fundKey || !profileId) continue;
      seenKeys.add(`${profileId}:${fundKey}`);
    }
    for (const composite of seenKeys) {
      const colonIdx = composite.indexOf(":");
      const profileId = composite.slice(0, colonIdx);
      const fundKey = composite.slice(colonIdx + 1);
      const points = (sparkSavings ?? [])
        .filter((s) => {
          const fk = s.fund_number ?? s.product_name;
          return fk === fundKey && sparkReportToProfile.get(s.report_id) === profileId;
        })
        .map((s) => ({
          date: sparkReportDateById.get(s.report_id) ?? "",
          balance: Number(s.balance ?? 0),
        }))
        .sort((a, b) => a.date.localeCompare(b.date))
        .map((p) => p.balance);
      historyByFundKey.set(composite, points);
    }
  }

  // Funds with member chips
  const memberById = new Map(members.map((m) => [m.id, m]));
  const fundsWithMember = (savings ?? []).map((fund) => {
    const profileId = reportToProfile.get(fund.report_id);
    const member = profileId ? memberById.get(profileId) ?? null : null;
    const fundKey = fund.fund_number ?? fund.product_name;
    const history = profileId && fundKey
      ? historyByFundKey.get(`${profileId}:${fundKey}`)
      : undefined;
    return {
      id: fund.id,
      provider: fund.provider,
      product_name: fund.product_name,
      product_type: fund.product_type as ProductType,
      balance: fund.balance,
      monthly_return_pct: fund.monthly_return_pct,
      member,
      history,
    };
  });

  // Insurance matrix data (per-member, never summed)
  const insuranceData: Record<string, InsuranceMatrixRow> = {};
  for (const s of summaries ?? []) {
    const profileId = reportToProfile.get(s.report_id);
    if (!profileId) continue;
    insuranceData[profileId] = {
      health: s.health_insurance_exists,
      life: s.life_insurance_amount,
      disability: s.disability_coverage_amount,
    };
  }

  // Pick an insight to display: prefer self's, else first available
  const selfMember = members.find((m) => m.is_self);
  const selfReportId = selfMember
    ? latestByProfile.get(selfMember.id)?.id ?? null
    : null;
  const insight =
    (selfReportId &&
      (insights ?? []).find((i) => i.report_id === selfReportId)) ||
    (insights ?? [])[0] ||
    null;

  // Pension projection: total household projection (sum of full)
  const totalProjectedFull = (summaries ?? []).reduce(
    (sum, s) => sum + (s.projected_pension_full ?? 0),
    0
  );
  const totalMonthlyDeposits = (summaries ?? []).reduce(
    (sum, s) => sum + (s.monthly_deposits ?? 0),
    0
  );

  // Deposit verification across the whole household. Take the last 4 done
  // reports per member so each member's fund history is detected
  // independently, then concat all alerts.
  const depositHistoryByProfile = new Map<
    string,
    Array<{ id: string; report_date: string }>
  >();
  for (const r of doneReports ?? []) {
    const list = depositHistoryByProfile.get(r.profile_id) ?? [];
    if (list.length < 4) {
      list.push({ id: r.id, report_date: r.report_date });
      depositHistoryByProfile.set(r.profile_id, list);
    }
  }
  const depositHistoryReportIds = Array.from(depositHistoryByProfile.values())
    .flat()
    .map((r) => r.id);
  const depositReportMeta = new Map<
    string,
    { profileId: string; date: string }
  >();
  for (const [profileId, list] of depositHistoryByProfile.entries()) {
    for (const r of list) {
      depositReportMeta.set(r.id, { profileId, date: r.report_date });
    }
  }

  const depositAlerts: ReturnType<typeof detectDepositAlerts> = [];
  if (depositHistoryReportIds.length >= 2) {
    const { data: depositHistorySavings } = await supabase
      .from("savings_products")
      .select("report_id, fund_number, product_name, provider, monthly_deposit")
      .in("report_id", depositHistoryReportIds);

    const perMemberRows = new Map<
      string,
      Array<{
        fund_number: string | null;
        product_name: string | null;
        provider: string | null;
        monthly_deposit: number;
        report_date: string;
      }>
    >();
    for (const s of depositHistorySavings ?? []) {
      const meta = depositReportMeta.get(s.report_id);
      if (!meta) continue;
      const list = perMemberRows.get(meta.profileId) ?? [];
      list.push({
        fund_number: s.fund_number,
        product_name: s.product_name,
        provider: s.provider,
        monthly_deposit: s.monthly_deposit,
        report_date: meta.date,
      });
      perMemberRows.set(meta.profileId, list);
    }

    for (const rows of perMemberRows.values()) {
      depositAlerts.push(...detectDepositAlerts(groupFundHistories(rows)));
    }
  }

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-12 lg:gap-6">
      <div className="min-w-0 lg:col-span-8 xl:col-span-7">
        <HouseholdHero
          total={grandTotal}
          segments={segments}
          members={members}
          perMemberValues={perMemberTotal}
        />
      </div>

      {insight?.summary_text && (
        <div className="min-w-0 lg:col-span-4 xl:col-span-5">
          <InsightCard
            text={insight.summary_text}
            label={selfMember ? `${selfMember.name} · תובנה חודשית` : "תובנה חודשית"}
          />
        </div>
      )}

      <div className="min-w-0 lg:col-span-12">
        <DepositAlertsCard alerts={depositAlerts} />
      </div>

      <div className="min-w-0 lg:col-span-12">
        <FeeAnalysisCard
          analyses={analyzeFees((savings ?? []) as SavingsProduct[])}
        />
      </div>

      <div className="min-w-0 lg:col-span-8 xl:col-span-8">
        <FundCardGrid funds={fundsWithMember} />
      </div>

      <aside className="min-w-0 lg:col-span-4 xl:col-span-4 space-y-4">
        <RetirementGoalCard
          projectedFull={totalProjectedFull}
          goalMonthly={headProfile?.retirement_goal_monthly ?? null}
          currentAge={headAge}
          retirementAge={headProfile?.retirement_age ?? 67}
          monthlyDeposits={totalMonthlyDeposits}
          locale={locale}
        />

        <InsuranceMatrix members={members} data={insuranceData} />
      </aside>
    </div>
  );
}
