import { notFound } from "next/navigation";
import { getLocale } from "next-intl/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { ReportDetail } from "./ReportDetail";

export default async function ReportDetailPage({
  params,
}: {
  params: Promise<{ id: string; locale: string }>;
}) {
  const { id } = await params;
  const supabase = await createServerSupabase();
  const locale = await getLocale();

  const { data: { user } } = await supabase.auth.getUser();
  const { data: profile } = await supabase.from("profiles")
    .select("id")
    .eq("email", user!.email!)
    .single();

  if (!profile) notFound();

  const { data: report } = await supabase.from("reports")
    .select("*")
    .eq("id", id)
    .eq("profile_id", profile.id)
    .single();

  if (!report) notFound();

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
      reportDate={report.report_date}
      locale={locale}
      summary={summary}
      savings={savings || []}
      insurance={insurance || []}
    />
  );
}
