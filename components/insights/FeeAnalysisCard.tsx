"use client";
import { motion } from "motion/react";
import { useLocale } from "next-intl";
import { TrendingDown, CheckCircle2 } from "lucide-react";
import { formatCurrency, formatPercent } from "@/lib/format";
import type { FeeAnalysis } from "@/lib/insights/fee-analyzer";
import { totalSavingsPotential } from "@/lib/insights/fee-analyzer";

export function FeeAnalysisCard({ analyses }: { analyses: FeeAnalysis[] }) {
  const locale = useLocale();
  const fullLocale = locale === "he" ? "he-IL" : "en-IL";
  const isHebrew = locale === "he";
  const totals = totalSavingsPotential(analyses);
  const high = analyses.filter((a) => a.verdict === "high");

  if (analyses.length === 0) return null;

  if (totals.vsMarket < 100) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="flex items-center gap-3 rounded-xl border border-gain/20 bg-surface p-4"
      >
        <CheckCircle2 className="h-5 w-5 flex-shrink-0 text-gain" />
        <div>
          <p className="text-sm font-medium text-text-primary">
            {isHebrew ? "דמי הניהול שלך תחרותיים" : "Your management fees are competitive"}
          </p>
          <p className="text-xs text-text-muted">
            {isHebrew ? "נמוך מהממוצע בשוק" : "Below market average"}
          </p>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-xl bg-surface p-5"
    >
      <div className="mb-4 flex items-start gap-3">
        <TrendingDown className="mt-0.5 h-5 w-5 flex-shrink-0 text-loss" />
        <div className="flex-1">
          <p className="text-sm text-text-muted">
            {isHebrew ? "פוטנציאל חיסכון שנתי בדמי ניהול" : "Annual fee savings potential"}
          </p>
          <p className="mt-1 text-3xl font-semibold text-loss tabular-nums">
            <bdi>{formatCurrency(totals.vsMarket, fullLocale)}</bdi>
          </p>
          <p className="text-xs text-text-muted">
            {isHebrew
              ? `אם תעבור לקרנות בדמי ניהול ממוצעי שוק (${formatCurrency(totals.vsBest, fullLocale)} למובילות בשוק)`
              : `If you switched to market-average fees (${formatCurrency(totals.vsBest, fullLocale)} for best-in-market)`}
          </p>
        </div>
      </div>

      {high.length > 0 && (
        <div className="space-y-2 border-t border-background/40 pt-4">
          <p className="text-xs font-medium uppercase tracking-wide text-text-muted">
            {isHebrew ? "קרנות עם דמי ניהול גבוהים" : "High-fee funds"}
          </p>
          {high.slice(0, 3).map((a) => (
            <div key={a.fundId} className="flex items-center justify-between text-sm">
              <div className="min-w-0 flex-1">
                <p className="truncate text-text-primary">{a.fundName}</p>
                <p className="text-xs text-text-muted">
                  {isHebrew
                    ? `${formatPercent(a.balanceFeePct, fullLocale)} (ממוצע: ${formatPercent(a.marketAvgBalance, fullLocale)})`
                    : `${formatPercent(a.balanceFeePct, fullLocale)} (avg: ${formatPercent(a.marketAvgBalance, fullLocale)})`}
                </p>
              </div>
              <p className="text-loss tabular-nums">
                <bdi>+{formatCurrency(a.savingsVsMarket, fullLocale)}/yr</bdi>
              </p>
            </div>
          ))}
        </div>
      )}
    </motion.div>
  );
}
