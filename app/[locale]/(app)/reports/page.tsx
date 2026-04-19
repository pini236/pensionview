import Link from "next/link";
import { getLocale } from "next-intl/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { formatCurrency } from "@/lib/format";

export default async function ReportsPage() {
  const supabase = await createServerSupabase();
  const locale = await getLocale();
  const fullLocale = locale === "he" ? "he-IL" : "en-IL";

  const { data: { user } } = await supabase.auth.getUser();
  const { data: profile } = await supabase.from("profiles")
    .select("id")
    .eq("email", user!.email!)
    .single();

  if (!profile) return <div className="text-text-muted">Profile not found</div>;

  const { data: reports } = await supabase.from("reports")
    .select("id, report_date, report_summary(total_savings)")
    .eq("profile_id", profile.id)
    .eq("status", "done")
    .order("report_date", { ascending: false });

  // Group by year
  const grouped = (reports || []).reduce((acc, report) => {
    const year = new Date(report.report_date).getFullYear();
    if (!acc[year]) acc[year] = [];
    acc[year].push(report);
    return acc;
  }, {} as Record<number, typeof reports>);

  const years = Object.keys(grouped).map(Number).sort((a, b) => b - a);

  return (
    <div className="space-y-6">
      {years.length === 0 && (
        <p className="text-text-muted">אין דוחות עדיין</p>
      )}
      {years.map((year) => (
        <section key={year}>
          <h2 className="mb-3 text-sm font-medium text-text-muted">{year}</h2>
          <div className="space-y-2">
            {grouped[year]!.map((report) => {
              const summaryRaw = report.report_summary as { total_savings: number | null } | { total_savings: number | null }[] | null;
              const summary = Array.isArray(summaryRaw) ? summaryRaw[0] : summaryRaw;
              const total = summary?.total_savings ?? 0;
              return (
                <Link
                  key={report.id}
                  href={`/${locale}/reports/${report.id}`}
                  className="flex items-center justify-between rounded-lg bg-surface p-4 transition-colors hover:bg-surface-hover cursor-pointer"
                >
                  <div>
                    <p className="text-sm font-medium text-text-primary">
                      {new Date(report.report_date).toLocaleDateString(fullLocale, { month: "long", year: "numeric" })}
                    </p>
                  </div>
                  <p className="text-sm font-medium text-text-primary">
                    <bdi>{formatCurrency(total, fullLocale)}</bdi>
                  </p>
                </Link>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
