import type { Metadata } from "next";
import Link from "next/link";
import { getLocale } from "next-intl/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { MemberAvatar } from "@/components/members/MemberAvatar";
import { getActiveMember } from "@/lib/active-member";
import { formatCurrency } from "@/lib/format";
import type { Member } from "@/lib/types";
import { ReportRowActions } from "@/components/reports/ReportRowActions";

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

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ member?: string }>;
}) {
  const supabase = await createServerSupabase();
  const locale = await getLocale();
  const fullLocale = locale === "he" ? "he-IL" : "en-IL";
  const sp = await searchParams;
  const active = await getActiveMember(sp);

  if (active.householdMemberIds.length === 0) {
    return <div className="text-text-muted">Profile not found</div>;
  }

  // Fetch all reports across the active member ids in one query
  const { data: reports } = await supabase
    .from("reports")
    .select("id, profile_id, report_date, report_summary(total_savings)")
    .in("profile_id", active.householdMemberIds)
    .eq("status", "done")
    .order("report_date", { ascending: false });

  // Group by year
  const grouped = (reports || []).reduce(
    (acc, report) => {
      const year = new Date(report.report_date).getFullYear();
      if (!acc[year]) acc[year] = [];
      acc[year].push(report);
      return acc;
    },
    {} as Record<number, NonNullable<typeof reports>>
  );

  const years = Object.keys(grouped).map(Number).sort((a, b) => b - a);

  // Member lookup for the avatar cluster
  const membersById = new Map<string, Member>(
    active.members.map((m) => [m.id, m])
  );
  const isCombined = active.kind === "all";

  return (
    <div className="space-y-6">
      {active.kind === "single" && (
        <p className="text-xs uppercase tracking-wide text-text-muted">
          {active.member.name} ·{" "}
          {locale === "he" ? "דוחות" : "Reports"}
        </p>
      )}
      {isCombined && (
        <p className="text-xs uppercase tracking-wide text-text-muted">
          {locale === "he" ? "כל המשפחה · דוחות" : "All household · Reports"}
        </p>
      )}

      {years.length === 0 && (
        <p className="text-text-muted">
          {locale === "he" ? "אין דוחות עדיין" : "No reports yet"}
        </p>
      )}
      {years.map((year) => (
        <section key={year}>
          <h2 className="mb-3 text-sm font-medium text-text-muted">{year}</h2>
          <div className="space-y-2 lg:grid lg:grid-cols-2 lg:gap-x-6 lg:gap-y-2 lg:space-y-0">
            {grouped[year]!.map((report) => {
              const summaryRaw = report.report_summary as
                | { total_savings: number | null }
                | { total_savings: number | null }[]
                | null;
              const summary = Array.isArray(summaryRaw)
                ? summaryRaw[0]
                : summaryRaw;
              const total = summary?.total_savings ?? 0;
              const reportMember = membersById.get(report.profile_id) ?? null;
              return (
                <div
                  key={report.id}
                  className="group flex items-center gap-2 rounded-lg bg-surface transition-colors hover:bg-surface-hover"
                >
                  <Link
                    href={`/${locale}/reports/${report.id}`}
                    className="flex flex-1 items-center justify-between gap-3 p-4 cursor-pointer"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-text-primary">
                        {new Date(report.report_date).toLocaleDateString(
                          fullLocale,
                          { month: "long", year: "numeric" }
                        )}
                      </p>
                      {isCombined && reportMember && (
                        <p className="mt-0.5 text-xs text-text-muted">
                          {reportMember.name}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-3">
                      <p className="text-sm font-medium text-text-primary">
                        <bdi>{formatCurrency(total, fullLocale)}</bdi>
                      </p>
                      {isCombined && reportMember && (
                        <MemberAvatar member={reportMember} size="sm" />
                      )}
                    </div>
                  </Link>
                  <ReportRowActions
                    reportId={report.id}
                    reportDate={report.report_date}
                    totalSavings={total}
                    ownerName={isCombined ? reportMember?.name ?? null : null}
                  />
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
