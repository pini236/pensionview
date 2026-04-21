"use client";

// =============================================================================
// PensionView — InFlightReportsSection
//
// Renders the "Processing" section on /reports from the polling provider's
// live snapshot — not from the static server-rendered list. This way reports
// uploaded right before the user landed on the page (e.g. multi-file
// /admin/backfill flow with a router.push redirect) show up within one
// 3-second poll tick instead of waiting for a full page refresh.
// =============================================================================

import { useTranslations } from "next-intl";
import { ReportProcessingRow } from "@/components/reports/ReportProcessingRow";
import { useProcessingReportsList } from "@/components/reports/ProcessingReportsProvider";

export function InFlightReportsSection() {
  const t = useTranslations("reports.processing");
  const reports = useProcessingReportsList();

  if (reports.length === 0) return null;

  return (
    <section>
      <h2 className="mb-3 text-sm font-medium text-text-muted">{t("title")}</h2>
      <div className="space-y-2 lg:grid lg:grid-cols-2 lg:gap-x-6 lg:gap-y-2 lg:space-y-0">
        {reports.map((report) => (
          <ReportProcessingRow
            key={report.id}
            report={{
              id: report.id,
              status: report.status,
              current_step: report.current_step,
              current_step_detail: report.current_step_detail,
              report_date: report.report_date,
              // created_at isn't on the polling payload and isn't used for
              // rendering — pass empty so the row's prop type stays satisfied.
              created_at: "",
            }}
          />
        ))}
      </div>
    </section>
  );
}
