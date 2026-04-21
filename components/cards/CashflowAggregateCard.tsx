"use client";

import { motion } from "motion/react";
import { useLocale, useTranslations } from "next-intl";
import { formatCurrency } from "@/lib/format";
import type { AggregateCashflow } from "@/lib/cashflow";

interface CashflowAggregateCardProps {
  aggregate: AggregateCashflow;
}

/**
 * Hero card at the top of the trends "Deposits vs Market" section.
 * Lifetime deposits + lifetime market gain across the active timeline.
 */
export function CashflowAggregateCard({ aggregate }: CashflowAggregateCardProps) {
  const t = useTranslations("trends.cashflow_section");
  const locale = useLocale();
  const fullLocale = locale === "he" ? "he-IL" : "en-IL";

  const startLabel = new Date(aggregate.startDate).toLocaleDateString(fullLocale, {
    month: "long",
    year: "numeric",
  });
  const endLabel = new Date(aggregate.endDate).toLocaleDateString(fullLocale, {
    month: "long",
    year: "numeric",
  });

  const marketIsPositive = aggregate.totalMarket >= 0;
  const marketSign = marketIsPositive ? "+" : "-";
  const marketAbs = formatCurrency(Math.abs(aggregate.totalMarket), fullLocale);
  const depositsLabel = formatCurrency(aggregate.totalDeposits, fullLocale);
  const pctLabel =
    aggregate.marketPct !== null
      ? `${aggregate.marketPct >= 0 ? "+" : ""}${aggregate.marketPct.toFixed(1)}`
      : "—";

  const glow = marketIsPositive
    ? "shadow-[0_0_50px_-20px_rgba(34,197,94,0.4)]"
    : "shadow-[0_0_50px_-20px_rgba(245,158,11,0.4)]";

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className={`relative overflow-hidden rounded-2xl bg-surface p-6 lg:p-8 ${glow}`}
    >
      <p className="text-xs uppercase tracking-wide text-text-muted">
        {t("aggregate_title", { months: aggregate.monthsSpan })}
      </p>
      <p className="mt-3 text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-semibold leading-tight tabular-nums text-text-primary">
        <bdi>{t("aggregate_deposits", { amount: depositsLabel })}</bdi>
      </p>
      <p
        className={`mt-2 text-lg sm:text-xl md:text-2xl font-medium tabular-nums ${
          marketIsPositive ? "text-gain" : "text-loss"
        }`}
      >
        <bdi>
          {t("aggregate_market", {
            amount: `${marketSign}${marketAbs}`,
            pct: pctLabel,
          })}
        </bdi>
      </p>
      <p className="mt-4 text-sm text-text-muted">
        <bdi>{t("range", { start: startLabel, end: endLabel })}</bdi>
      </p>
    </motion.div>
  );
}
