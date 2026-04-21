import { notFound } from "next/navigation";
import { getLocale } from "next-intl/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { getActiveMember } from "@/lib/active-member";
import { ReportDetail } from "./ReportDetail";
import { ReportProgressView } from "@/components/reports/ReportProgressView";

export default async function ReportDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; locale: string }>;
  searchParams: Promise<{ member?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const supabase = await createServerSupabase();
  const locale = await getLocale();

  // Resolve household scope (Family Mode). The report owner just needs to be
  // any member of the current user's household — not necessarily the auth
  // user's self profile, so spouse/child reports still drill in correctly
  // from the combined dashboard.
  const active = await getActiveMember(sp);

  if (active.householdMemberIds.length === 0) notFound();

  const { data: report } = await supabase.from("reports")
    .select("*")
    .eq("id", id)
    .in("profile_id", active.householdMemberIds)
    .single();

  if (!report) notFound();

  // Resolve the report's owning member (used for the combined-mode badge).
  const ownerMember =
    active.kind === "all"
      ? active.members.find((m) => m.id === report.profile_id) ?? null
      : null;

  // In-flight reports render the live stepper — skip the heavy data queries.
  if (report.status === "processing" || report.status === "failed") {
    return (
      <ReportProgressView
        reportId={report.id}
        reportDate={report.report_date}
        ownerMember={ownerMember}
        initialStatus={report.status}
        initialStep={report.current_step ?? null}
        initialDetail={
          (report.current_step_detail as Record<string, unknown> | null) ?? null
        }
      />
    );
  }

  const { data: summary } = await supabase.from("report_summary")
    .select("*")
    .eq("report_id", id)
    .maybeSingle();

  const { data: savings } = await supabase.from("savings_products")
    .select("*")
    .eq("report_id", id)
    .order("balance", { ascending: false });

  const { data: insurance } = await supabase.from("insurance_products")
    .select("*, coverages:insurance_coverages(*)")
    .eq("report_id", id);

  // Look up the previous report (by date) for the same profile so the hero
  // can render an inline "+X deposits, +Y market" line. When this is the
  // first report for the profile, leave both null and the UI hides the line.
  const { data: previousReport } = await supabase
    .from("reports")
    .select("id, report_date")
    .eq("profile_id", report.profile_id)
    .eq("status", "done")
    .lt("report_date", report.report_date)
    .order("report_date", { ascending: false })
    .limit(1)
    .maybeSingle();

  let previousTotalSavings: number | null = null;
  if (previousReport) {
    const { data: prevSummary } = await supabase
      .from("report_summary")
      .select("total_savings")
      .eq("report_id", previousReport.id)
      .maybeSingle();
    previousTotalSavings = prevSummary?.total_savings ?? null;
  }

  return (
    <ReportDetail
      reportId={report.id}
      reportDate={report.report_date}
      locale={locale}
      summary={summary}
      savings={savings || []}
      insurance={insurance || []}
      ownerMember={ownerMember}
      previousTotalSavings={previousTotalSavings}
    />
  );
}
