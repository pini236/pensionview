"use client";

import { useState } from "react";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { formatCurrency, formatPercent } from "@/lib/format";
import type { SavingsProduct, InsuranceProduct, InsuranceCoverage, ReportSummary } from "@/lib/types";

type Tab = "balances" | "returns" | "deposits" | "insurance";

interface InsuranceWithCoverages extends InsuranceProduct {
  coverages: InsuranceCoverage[];
}

interface ReportDetailProps {
  reportDate: string;
  locale: string;
  summary: ReportSummary | null;
  savings: SavingsProduct[];
  insurance: InsuranceWithCoverages[];
}

export function ReportDetail({ reportDate, locale, summary, savings, insurance }: ReportDetailProps) {
  const fullLocale = locale === "he" ? "he-IL" : "en-IL";
  const [tab, setTab] = useState<Tab>("balances");

  const dateLabel = new Date(reportDate).toLocaleDateString(fullLocale, { month: "long", year: "numeric" });

  return (
    <div className="space-y-4">
      <div className="rounded-xl bg-surface p-6">
        <p className="text-sm text-text-muted">{dateLabel}</p>
        <p className="mt-1 text-2xl font-medium text-text-primary">
          <bdi>{formatCurrency(summary?.total_savings ?? 0, fullLocale)}</bdi>
        </p>
      </div>

      <SegmentedControl<Tab>
        segments={[
          { value: "balances", label: "יתרות" },
          { value: "returns", label: "תשואות" },
          { value: "deposits", label: "הפקדות" },
          { value: "insurance", label: "ביטוח" },
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
        <div className="overflow-x-auto rounded-lg bg-surface">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-background/30 text-xs text-text-muted">
                <th className="p-3 text-start font-normal">קרן</th>
                <th className="p-3 text-end font-normal">חודשי</th>
                <th className="p-3 text-end font-normal">שנתי</th>
                <th className="p-3 text-end font-normal">36 חוד׳</th>
                <th className="p-3 text-end font-normal">60 חוד׳</th>
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
