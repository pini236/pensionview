import type { Metadata } from "next";
import { createServerSupabase } from "@/lib/supabase/server";
import { HeroCard } from "@/components/cards/HeroCard";
import { FundCardGrid } from "@/components/cards/FundCardGrid";
import { InsuranceSummary } from "@/components/cards/InsuranceSummary";
import { InsuranceMatrix, type InsuranceMatrixRow } from "@/components/cards/InsuranceMatrix";
import { InsightCard } from "@/components/cards/InsightCard";
import { PensionProjection } from "@/components/charts/PensionProjection";
import { HouseholdHero } from "@/components/members/HouseholdHero";
import type { ShareSegment } from "@/components/members/MemberShareBar";
import { NoReportsState } from "@/components/empty-states/NoReportsState";
import { getActiveMember } from "@/lib/active-member";
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

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ member?: string }>;
}) {
  const supabase = await createServerSupabase();
  const sp = await searchParams;
  const active = await getActiveMember(sp);

  if (active.householdMemberIds.length === 0) {
    return <div className="text-text-muted">Profile not found</div>;
  }

  // Single-member view (default UX)
  if (active.kind === "single") {
    return (
      <SingleMemberDashboard supabase={supabase} member={active.member} />
    );
  }

  // Combined household view
  return (
    <CombinedDashboard
      supabase={supabase}
      members={active.members}
      memberIds={active.householdMemberIds}
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
}: {
  supabase: Awaited<ReturnType<typeof createServerSupabase>>;
  member: Member;
}) {
  const { data: profile } = await supabase
    .from("profiles")
    .select("id, date_of_birth")
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

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-12 lg:gap-6">
      {summary && (
        <div className="lg:col-span-8 xl:col-span-7">
          <HeroCard
            totalSavings={summary.total_savings || 0}
            previousTotalSavings={previousSummary?.total_savings || null}
            memberName={member.name}
            memberColor={member.avatar_color}
          />
        </div>
      )}

      {insight && (
        <div className="lg:col-span-4 xl:col-span-5">
          <InsightCard text={insight.summary_text} label="תובנה חודשית" />
        </div>
      )}

      <div className="lg:col-span-8 xl:col-span-8">
        <FundCardGrid
          funds={(savings || []).map((fund) => ({
            id: fund.id,
            provider: fund.provider,
            product_name: fund.product_name,
            product_type: fund.product_type as ProductType,
            balance: fund.balance,
            monthly_return_pct: fund.monthly_return_pct,
          }))}
        />
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

// ---------------------------------------------------------------------------
// Combined household dashboard (all members).
// ---------------------------------------------------------------------------

async function CombinedDashboard({
  supabase,
  members,
  memberIds,
}: {
  supabase: Awaited<ReturnType<typeof createServerSupabase>>;
  members: Member[];
  memberIds: string[];
}) {
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

  // Funds with member chips
  const memberById = new Map(members.map((m) => [m.id, m]));
  const fundsWithMember = (savings ?? []).map((fund) => {
    const profileId = reportToProfile.get(fund.report_id);
    const member = profileId ? memberById.get(profileId) ?? null : null;
    return {
      id: fund.id,
      provider: fund.provider,
      product_name: fund.product_name,
      product_type: fund.product_type as ProductType,
      balance: fund.balance,
      monthly_return_pct: fund.monthly_return_pct,
      member,
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
  const totalProjectedBase = (summaries ?? []).reduce(
    (sum, s) => sum + (s.projected_pension_base ?? 0),
    0
  );

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-12 lg:gap-6">
      <div className="lg:col-span-8 xl:col-span-7">
        <HouseholdHero
          total={grandTotal}
          segments={segments}
          members={members}
          perMemberValues={perMemberTotal}
        />
      </div>

      {insight?.summary_text && (
        <div className="lg:col-span-4 xl:col-span-5">
          <InsightCard
            text={insight.summary_text}
            label={selfMember ? `${selfMember.name} · תובנה חודשית` : "תובנה חודשית"}
          />
        </div>
      )}

      <div className="lg:col-span-8 xl:col-span-8">
        <FundCardGrid funds={fundsWithMember} />
      </div>

      <aside className="lg:col-span-4 xl:col-span-4 space-y-4">
        {totalProjectedFull > 0 && (
          <PensionProjection
            projectedFull={totalProjectedFull}
            projectedBase={totalProjectedBase}
            currentAge={null}
          />
        )}

        <InsuranceMatrix members={members} data={insuranceData} />
      </aside>
    </div>
  );
}
