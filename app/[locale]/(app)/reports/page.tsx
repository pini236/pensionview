import type { Metadata } from "next";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { MemberAvatar } from "@/components/members/MemberAvatar";
import { getActiveMember } from "@/lib/active-member";
import { formatCurrency } from "@/lib/format";
import type { Member } from "@/lib/types";
import { ReportRowActions } from "@/components/reports/ReportRowActions";
import { ReportProcessingRow } from "@/components/reports/ReportProcessingRow";
import { ProcessingReportsProvider } from "@/components/reports/ProcessingReportsProvider";
import {
  ReportsUploadProvider,
  ReportUploadButton,
  ReportUploadEmptyState,
} from "@/components/reports/ReportsUploadAffordance";
import type { ProcessingReportStatus } from "@/app/api/reports/processing/route";

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
  const tProcessing = await getTranslations({
    locale,
    namespace: "reports.processing",
  });

  if (active.householdMemberIds.length === 0) {
    return <div className="text-text-muted">Profile not found</div>;
  }

  // Fetch reports across the active member ids in one query. We pull
  // `processing` and `failed` rows alongside `done` so the in-flight pipeline
  // shows up in the list — the WDK orchestrator writes status / current_step
  // / current_step_detail as the run progresses, and ReportProcessingRow
  // polls /api/reports/[id] to reflect updates without a full reload.
  const { data: reports } = await supabase
    .from("reports")
    .select(
      "id, profile_id, report_date, status, current_step, current_step_detail, created_at, report_summary(total_savings)"
    )
    .in("profile_id", active.householdMemberIds)
    .in("status", ["done", "processing", "failed"])
    .order("created_at", { ascending: false });

  // Split in-flight (processing/failed) from completed reports. In-flight
  // rows render in their own section above the year-grouped completed list
  // so the user always sees fresh activity at the top.
  const allReports = reports ?? [];
  const inFlight = allReports.filter(
    (r) => r.status === "processing" || r.status === "failed"
  );
  // Done reports without a date (extraction surfaced none AND user hasn't
  // patched one in) get their own group at the top so they're discoverable
  // and easy to triage with the manual-edit affordance.
  const doneReports = allReports.filter((r) => r.status === "done");
  const undatedDone = doneReports.filter((r) => !r.report_date);
  const datedDone = doneReports
    .filter((r): r is typeof r & { report_date: string } => !!r.report_date)
    // Year grouping below sorts by report_date, not created_at, so resort.
    .sort(
      (a, b) =>
        new Date(b.report_date).getTime() - new Date(a.report_date).getTime()
    );

  // Group completed reports by year
  const grouped = datedDone.reduce(
    (acc, report) => {
      const year = new Date(report.report_date).getFullYear();
      if (!acc[year]) acc[year] = [];
      acc[year].push(report);
      return acc;
    },
    {} as Record<number, typeof datedDone>
  );

  const years = Object.keys(grouped).map(Number).sort((a, b) => b - a);

  // Member lookup for the avatar cluster
  const membersById = new Map<string, Member>(
    active.members.map((m) => [m.id, m])
  );
  const isCombined = active.kind === "all";

  const hasAnyReports =
    years.length > 0 || inFlight.length > 0 || undatedDone.length > 0;
  const datePendingLabel =
    locale === "he" ? "תאריך בעיבוד" : "Date pending";

  return (
    <ReportsUploadProvider>
      <div className="space-y-6">
        <div className="flex items-start justify-between gap-3">
          <div>
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
          </div>
          {hasAnyReports && <ReportUploadButton />}
        </div>

        {inFlight.length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-medium text-text-muted">
            {tProcessing("title")}
          </h2>
          <ProcessingReportsProvider
            initialReports={inFlight.map(
              (r): ProcessingReportStatus => ({
                id: r.id,
                status: r.status,
                current_step: r.current_step ?? null,
                current_step_detail:
                  (r.current_step_detail as Record<string, unknown> | null) ??
                  null,
                report_date: r.report_date,
              })
            )}
          >
            <div className="space-y-2 lg:grid lg:grid-cols-2 lg:gap-x-6 lg:gap-y-2 lg:space-y-0">
              {inFlight.map((report) => (
                <ReportProcessingRow
                  key={report.id}
                  report={{
                    id: report.id,
                    status: report.status,
                    current_step: report.current_step ?? null,
                    current_step_detail:
                      (report.current_step_detail as Record<string, unknown> | null) ??
                      null,
                    report_date: report.report_date,
                    created_at: report.created_at,
                  }}
                />
              ))}
            </div>
          </ProcessingReportsProvider>
        </section>
      )}

        {!hasAnyReports && <ReportUploadEmptyState />}
      {undatedDone.length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-medium text-text-muted">
            {datePendingLabel}
          </h2>
          <div className="space-y-2 lg:grid lg:grid-cols-2 lg:gap-x-6 lg:gap-y-2 lg:space-y-0">
            {undatedDone.map((report) => {
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
                        {datePendingLabel}
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
    </ReportsUploadProvider>
  );
}
