"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { MemberAvatar } from "@/components/members/MemberAvatar";
import { formatCurrency, formatPercent } from "@/lib/format";
import { DeleteReportDialog } from "@/components/reports/DeleteReportDialog";
import { EditReportDateDialog } from "@/components/reports/EditReportDateDialog";
import type { Member, SavingsProduct, InsuranceProduct, InsuranceCoverage, ReportSummary } from "@/lib/types";

type Tab = "balances" | "returns" | "deposits" | "insurance";

interface InsuranceWithCoverages extends InsuranceProduct {
  coverages: InsuranceCoverage[];
}

interface ReportDetailProps {
  reportId: string;
  reportDate: string | null;
  locale: string;
  summary: ReportSummary | null;
  savings: SavingsProduct[];
  insurance: InsuranceWithCoverages[];
  ownerMember?: Member | null;
  /**
   * Total savings of the previous report (by date) for the same profile.
   * Null when this is the user's first report — the inline deposits/market
   * line is then hidden.
   */
  previousTotalSavings?: number | null;
}

export function ReportDetail({
  reportId,
  reportDate,
  locale,
  summary,
  savings,
  insurance,
  ownerMember,
  previousTotalSavings,
}: ReportDetailProps) {
  const fullLocale = locale === "he" ? "he-IL" : "en-IL";
  const [tab, setTab] = useState<Tab>("balances");
  const router = useRouter();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [editDateOpen, setEditDateOpen] = useState(false);
  const t = useTranslations("reports");

  const dateLabel = reportDate
    ? new Date(reportDate).toLocaleDateString(fullLocale, { month: "long", year: "numeric" })
    : t("processing.date_pending");

  const totalSavings = summary?.total_savings ?? 0;
  const deposits = summary?.monthly_deposits ?? 0;
  const hasPrevious =
    previousTotalSavings !== null && previousTotalSavings !== undefined;
  const market = hasPrevious ? totalSavings - previousTotalSavings - deposits : null;
  const marketSign = market !== null ? (market >= 0 ? "+" : "-") : "";
  const depositsLabel = formatCurrency(deposits, fullLocale);
  const marketLabel = market !== null ? formatCurrency(Math.abs(market), fullLocale) : "";
  const inlineText = t("detail.deposits_market_inline", {
    deposits: depositsLabel,
    market_sign: marketSign,
    market: marketLabel,
  });

  return (
    <div className="space-y-4">
      {ownerMember && (
        <div className="flex items-center gap-2">
          <MemberAvatar member={ownerMember} size="sm" />
          <span className="text-sm font-medium text-text-primary">{ownerMember.name}</span>
        </div>
      )}

      <div className="rounded-xl bg-surface p-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-1.5">
              <p className="text-sm text-text-muted">{dateLabel}</p>
              <button
                type="button"
                onClick={() => setEditDateOpen(true)}
                aria-label={t("editDate.trigger")}
                className="flex h-6 w-6 items-center justify-center rounded-full text-text-muted/60 transition-colors hover:bg-surface-hover hover:text-text-primary cursor-pointer"
              >
                <Pencil size={12} />
              </button>
            </div>
            <p className="mt-1 text-2xl font-medium text-text-primary">
              <bdi>{formatCurrency(totalSavings, fullLocale)}</bdi>
            </p>
            {market !== null && (
              <p className="mt-2 text-xs text-text-muted">
                <bdi>{inlineText}</bdi>
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={() => setDeleteOpen(true)}
            aria-label={t("delete.trigger")}
            className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full text-text-muted transition-colors hover:bg-surface-hover hover:text-text-primary cursor-pointer"
          >
            <Trash2 size={16} />
          </button>
        </div>
      </div>
      {deleteOpen && (
        <DeleteReportDialog
          reportId={reportId}
          reportDate={reportDate}
          totalSavings={summary?.total_savings ?? 0}
          ownerName={ownerMember?.name ?? null}
          onClose={() => setDeleteOpen(false)}
          onDeleted={() => router.push(`/${locale}/reports`)}
        />
      )}
      {editDateOpen && (
        <EditReportDateDialog
          reportId={reportId}
          initialDate={reportDate}
          onClose={() => setEditDateOpen(false)}
        />
      )}

      <SegmentedControl<Tab>
        segments={[
          { value: "balances", label: t("tabs.balances") },
          { value: "returns", label: t("tabs.returns") },
          { value: "deposits", label: t("tabs.deposits") },
          { value: "insurance", label: t("tabs.insurance") },
        ]}
        value={tab}
        onChange={setTab}
      />

      {tab === "balances" && (
        <div className="overflow-hidden rounded-lg bg-surface">
          {savings.map((fund) => (
            <div key={fund.id} className="flex items-center justify-between border-b border-background/30 p-4 last:border-0">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-text-primary">{fund.product_name}</p>
                <p className="text-xs text-text-muted">{fund.provider}</p>
              </div>
              <p className="text-sm font-medium text-text-primary">
                <bdi>{formatCurrency(fund.balance ?? 0, fullLocale)}</bdi>
              </p>
            </div>
          ))}
        </div>
      )}

      {tab === "returns" && (
        <div className="relative rounded-lg bg-surface">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[480px] text-sm">
              <thead>
                <tr className="border-b border-background/30 text-xs text-text-muted">
                  <th className="p-3 text-start font-normal">{t("tableHeaders.fund")}</th>
                  <th className="p-3 text-end font-normal">{t("tableHeaders.monthly")}</th>
                  <th className="p-3 text-end font-normal">{t("tableHeaders.yearly")}</th>
                  <th className="p-3 text-end font-normal">{t("tableHeaders.threeYear")}</th>
                  <th className="p-3 text-end font-normal">{t("tableHeaders.fiveYear")}</th>
                </tr>
              </thead>
              <tbody>
                {savings.map((fund) => (
                  <tr key={fund.id} className="border-b border-background/30 last:border-0">
                    <td className="p-3 text-text-primary">{fund.product_name}</td>
                    <ReturnCell value={fund.monthly_return_pct} locale={fullLocale} />
                    <ReturnCell value={fund.yearly_return_pct} locale={fullLocale} />
                    <ReturnCell value={fund.cumulative_return_36m_pct} locale={fullLocale} />
                    <ReturnCell value={fund.cumulative_return_60m_pct} locale={fullLocale} />
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="pointer-events-none absolute inset-y-0 end-0 w-8 rounded-e-lg bg-gradient-to-l from-surface to-transparent md:hidden" />
        </div>
      )}

      {tab === "deposits" && (
        <div className="overflow-hidden rounded-lg bg-surface">
          {savings.map((fund) => (
            <div key={fund.id} className="flex items-center justify-between border-b border-background/30 p-4 last:border-0">
              <div>
                <p className="text-sm font-medium text-text-primary">{fund.product_name}</p>
                <p className="text-xs text-text-muted">{fund.provider}</p>
              </div>
              <p className="text-sm font-medium text-text-primary">
                <bdi>{formatCurrency(fund.monthly_deposit ?? 0, fullLocale)}</bdi>
              </p>
            </div>
          ))}
        </div>
      )}

      {tab === "insurance" && (
        <div className="space-y-3">
          {insurance.map((policy) => (
            <div key={policy.id} className="rounded-lg bg-surface p-4">
              <p className="text-sm font-medium text-text-primary">{policy.provider}</p>
              <p className="text-xs text-text-muted">{policy.policy_number}</p>
              <div className="mt-3 space-y-2">
                {policy.coverages?.map((cov) => (
                  <div key={cov.id} className="flex items-center justify-between text-sm">
                    <span className="text-text-muted">{cov.coverage_name}</span>
                    <span className="text-text-primary">
                      <bdi>{formatCurrency(cov.insured_amount ?? 0, fullLocale)}</bdi>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ReturnCell({ value, locale }: { value: number | null; locale: string }) {
  if (value === null) return <td className="p-3 text-end text-text-muted">—</td>;
  return (
    <td className={`p-3 text-end ${value >= 0 ? "text-gain" : "text-loss"}`}>
      <bdi>{value >= 0 ? "+" : ""}{formatPercent(value, locale)}</bdi>
    </td>
  );
}
