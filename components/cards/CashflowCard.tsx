"use client";

import { motion } from "motion/react";
import { useLocale, useTranslations } from "next-intl";
import { ArrowDownToLine, TrendingUp } from "lucide-react";
import { BarChart, Bar, Cell, ResponsiveContainer } from "recharts";
import { formatCurrency } from "@/lib/format";
import type { MonthlyCashflow } from "@/lib/cashflow";

interface CashflowCardProps {
  /** Recent monthly rows, sorted oldest → newest. The latest row drives the headline. */
  rows: MonthlyCashflow[];
}

/**
 * Compact KPI card: this-month deposits + this-month market change with a
 * 6-bar mini sparkbar of recent months' market-only change.
 *
 * - When only one report exists, the latest row's `market` will be null and
 *   we surface the "needs previous report" hint instead of a fake value.
 * - When the timeline is empty, render nothing (caller decides whether to
 *   show an empty state).
 */
export function CashflowCard({ rows }: CashflowCardProps) {
  const t = useTranslations("dashboard");
  const locale = useLocale();
  const fullLocale = locale === "he" ? "he-IL" : "en-IL";

  if (rows.length === 0) return null;

  const latest = rows[rows.length - 1];
  const dateLabel = new Date(latest.reportDate).toLocaleDateString(fullLocale, {
    month: "long",
    year: "numeric",
  });

  // Sparkbar: take up to the most recent 6 rows where market is defined. The
  // very first report (market === null) is intentionally skipped — there's
  // nothing to plot for it.
  const sparkRows = rows.filter((r) => r.market !== null).slice(-6);
  const sparkData = sparkRows.map((r) => ({
    key: r.reportId,
    value: r.market ?? 0,
  }));

  const marketIsPositive = (latest.market ?? 0) >= 0;
  const depositsLabel = formatCurrency(latest.deposits, fullLocale);
  const marketLabel =
    latest.market !== null
      ? formatCurrency(Math.abs(latest.market), fullLocale)
      : null;
  const marketPctLabel =
    latest.marketPct !== null
      ? `${latest.marketPct >= 0 ? "+" : ""}${latest.marketPct.toFixed(2)}%`
      : null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      className="rounded-xl bg-surface p-5 sm:p-6"
    >
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-sm font-medium text-text-primary">
          {t("cashflow.title")}
        </h3>
        <span className="truncate text-xs text-text-muted">{dateLabel}</span>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
        {/* Deposits line */}
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-fund-pension/15 text-fund-pension">
            <ArrowDownToLine size={16} aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <p className="text-xs uppercase tracking-wide text-text-muted">
              {t("cashflow.deposits_this_month")}
            </p>
            <p className="text-sm font-medium tabular-nums text-gain">
              <bdi>+{depositsLabel}</bdi>
            </p>
          </div>
        </div>

        {/* Market line */}
        <div className="flex items-center gap-3">
          <div
            className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full ${
              latest.market === null
                ? "bg-surface-hover text-text-muted"
                : marketIsPositive
                  ? "bg-gain/15 text-gain"
                  : "bg-loss/15 text-loss"
            }`}
          >
            <TrendingUp size={16} aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <p className="text-xs uppercase tracking-wide text-text-muted">
              {t("cashflow.market_this_month")}
            </p>
            {latest.market !== null && marketLabel ? (
              <p
                className={`text-sm font-medium tabular-nums ${
                  marketIsPositive ? "text-gain" : "text-loss"
                }`}
              >
                <bdi>
                  {marketIsPositive ? "+" : "-"}
                  {marketLabel}
                </bdi>
                {marketPctLabel && (
                  <span className="ms-1 text-xs text-text-muted">
                    ({marketPctLabel})
                  </span>
                )}
              </p>
            ) : (
              <p className="text-xs text-text-muted">
                {latest.isFirst
                  ? t("cashflow.first_report")
                  : t("cashflow.needs_previous")}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Mini sparkbar — six recent months of market-only change */}
      {sparkData.length >= 2 && (
        <div className="mt-4 h-8 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={sparkData} barCategoryGap={3}>
              <Bar dataKey="value" radius={[2, 2, 2, 2]} isAnimationActive={false}>
                {sparkData.map((d) => (
                  <Cell
                    key={d.key}
                    fill={d.value >= 0 ? "var(--color-gain)" : "var(--color-loss)"}
                    fillOpacity={0.85}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </motion.div>
  );
}
