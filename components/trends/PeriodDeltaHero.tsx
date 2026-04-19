"use client";

import { motion } from "motion/react";
import { useLocale } from "next-intl";
import { formatCurrency } from "@/lib/format";

interface PeriodDeltaHeroProps {
  currentDate: string;
  previousDate: string;
  currentTotal: number;
  previousTotal: number;
}

function formatMonth(date: string, locale: string): string {
  return new Date(date).toLocaleDateString(locale, {
    year: "numeric",
    month: "long",
  });
}

function monthsBetween(a: string, b: string): number {
  const da = new Date(a);
  const db = new Date(b);
  return Math.max(
    1,
    Math.round(
      (db.getFullYear() - da.getFullYear()) * 12 + (db.getMonth() - da.getMonth())
    )
  );
}

export function PeriodDeltaHero({
  currentDate,
  previousDate,
  currentTotal,
  previousTotal,
}: PeriodDeltaHeroProps) {
  const locale = useLocale();
  const fullLocale = locale === "he" ? "he-IL" : "en-IL";

  const delta = currentTotal - previousTotal;
  const deltaPct =
    previousTotal !== 0 ? (delta / previousTotal) * 100 : 0;
  const isGain = delta >= 0;

  const months = monthsBetween(previousDate, currentDate);

  const previousMonthLabel = formatMonth(previousDate, fullLocale);
  const currentMonthLabel = formatMonth(currentDate, fullLocale);

  const eyebrow =
    locale === "he"
      ? `מדוח ${previousMonthLabel} לדוח ${currentMonthLabel}`
      : `From ${previousMonthLabel} to ${currentMonthLabel}`;

  const subline =
    locale === "he"
      ? `${isGain ? "+" : ""}${deltaPct.toFixed(1)}% בכל הקרנות · על פני ${months} חודשים`
      : `${isGain ? "+" : ""}${deltaPct.toFixed(1)}% across all funds · over ${months} months`;

  // Compare bars: previous = light gray, current = gain/loss
  const maxValue = Math.max(currentTotal, previousTotal, 1);
  const previousWidthPct = (previousTotal / maxValue) * 100;
  const currentWidthPct = (currentTotal / maxValue) * 100;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="rounded-2xl bg-surface p-6 lg:p-8"
    >
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 lg:items-center">
        <div>
          <p className="text-sm text-text-muted">{eyebrow}</p>
          <p
            className={`mt-2 text-5xl font-semibold leading-tight tabular-nums lg:text-6xl ${
              isGain ? "text-gain" : "text-loss"
            }`}
          >
            <bdi>
              {isGain ? "+" : "-"}
              {formatCurrency(Math.abs(delta), fullLocale)}
            </bdi>
          </p>
          <p className="mt-3 text-sm text-text-muted">
            <bdi>{subline}</bdi>
          </p>
        </div>

        <div className="hidden lg:block">
          <div className="space-y-4">
            <div>
              <p className="mb-1 text-xs text-text-muted">
                <bdi>
                  {previousMonthLabel}: {formatCurrency(previousTotal, fullLocale)}
                </bdi>
              </p>
              <div className="h-2 w-full overflow-hidden rounded-full bg-surface-hover/40">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${previousWidthPct}%` }}
                  transition={{ duration: 0.6, delay: 0.1 }}
                  className="h-full rounded-full bg-text-muted/40"
                />
              </div>
            </div>
            <div>
              <p className="mb-1 text-xs text-text-muted">
                <bdi>
                  {currentMonthLabel}: {formatCurrency(currentTotal, fullLocale)}
                </bdi>
              </p>
              <div className="h-2 w-full overflow-hidden rounded-full bg-surface-hover/40">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${currentWidthPct}%` }}
                  transition={{ duration: 0.6, delay: 0.25 }}
                  className={`h-full rounded-full ${isGain ? "bg-gain" : "bg-loss"}`}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
