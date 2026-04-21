import { notFound } from "next/navigation";
import { getLocale } from "next-intl/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { getActiveMember } from "@/lib/active-member";
import { ReportDetail } from "./ReportDetail";

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

  return (
    <ReportDetail
      reportId={report.id}
      reportDate={report.report_date}
      locale={locale}
      summary={summary}
      savings={savings || []}
      insurance={insurance || []}
      ownerMember={ownerMember}
    />
  );
}
