"use client";

import { motion } from "motion/react";
import { useLocale } from "next-intl";
import { TrendingDown, TrendingUp, Trophy } from "lucide-react";
import { formatCurrency, formatPercent } from "@/lib/format";
import type { ProductType, Member } from "@/lib/types";
import { FUND_COLORS } from "@/lib/types";
import { MemberAvatar } from "@/components/members/MemberAvatar";

export interface FundChange {
  id: string;
  provider: string | null;
  productName: string | null;
  productType: ProductType | null;
  currentBalance: number;
  previousBalance: number | null;
  yearlyReturnPct: number | null;
}

interface FundChangeCardProps {
  fund: FundChange;
  index: number;
  isBest?: boolean;
  isWorst?: boolean;
  member?: Member | null;
}

export function FundChangeCard({
  fund,
  index,
  isBest = false,
  isWorst = false,
  member = null,
}: FundChangeCardProps) {
  const locale = useLocale();
  const fullLocale = locale === "he" ? "he-IL" : "en-IL";

  const color = fund.productType ? FUND_COLORS[fund.productType] : "#64748B";

  const hasPrevious =
    fund.previousBalance !== null && fund.previousBalance !== undefined;
  const delta = hasPrevious ? fund.currentBalance - (fund.previousBalance ?? 0) : null;
  const deltaPct =
    hasPrevious && (fund.previousBalance ?? 0) !== 0
      ? (((fund.currentBalance - (fund.previousBalance ?? 0)) /
          (fund.previousBalance ?? 1)) *
          100)
      : null;
  const isGain = (delta ?? 0) >= 0;

  const ringClass = isBest
    ? "ring-2 ring-gain/40"
    : isWorst
      ? "ring-2 ring-loss/40"
      : "";

  // Compare bar values
  const maxValue = Math.max(
    fund.currentBalance,
    fund.previousBalance ?? 0,
    1
  );
  const previousWidthPct = hasPrevious
    ? ((fund.previousBalance ?? 0) / maxValue) * 100
    : 0;
  const currentWidthPct = (fund.currentBalance / maxValue) * 100;

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: index * 0.05 }}
      className={`relative flex items-stretch gap-0 overflow-hidden rounded-xl bg-surface ${ringClass}`}
    >
      <div
        className="w-[3px] flex-shrink-0 rounded-s-xl"
        style={{ backgroundColor: color }}
      />

      {(isBest || isWorst) && (
        <div
          className={`absolute end-3 top-3 flex h-6 w-6 items-center justify-center rounded-full ${
            isBest ? "bg-gain/15 text-gain" : "bg-loss/15 text-loss"
          }`}
          aria-label={isBest ? "Best performer" : "Worst performer"}
        >
          {isBest ? <Trophy size={14} /> : <TrendingDown size={14} />}
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col gap-3 overflow-hidden p-4">
        <div className={`flex min-w-0 items-start gap-2 ${isBest || isWorst ? "pe-8" : ""}`}>
          {member && (
            <div className="flex-shrink-0 mt-0.5">
              <MemberAvatar member={member} size="sm" />
            </div>
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs text-text-muted">{fund.provider ?? ""}</p>
            <p className="truncate text-sm font-medium text-text-primary">
              {fund.productName ?? ""}
            </p>
          </div>
        </div>

        <div className="min-w-0">
          <p className="truncate text-lg sm:text-xl font-semibold tabular-nums text-text-primary">
            <bdi>{formatCurrency(fund.currentBalance, fullLocale)}</bdi>
          </p>
          {hasPrevious && (
            <p className="truncate text-xs text-text-muted">
              <bdi>
                {locale === "he" ? "היה: " : "Was: "}
                <span className="opacity-70">
                  {formatCurrency(fund.previousBalance ?? 0, fullLocale)}
                </span>
              </bdi>
            </p>
          )}
        </div>

        {hasPrevious && delta !== null && (
          <>
            <div
              className={`flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-medium ${
                isGain ? "text-gain" : "text-loss"
              }`}
            >
              {isGain ? <TrendingUp size={14} className="flex-shrink-0" /> : <TrendingDown size={14} className="flex-shrink-0" />}
              <bdi className="tabular-nums">
                {isGain ? "+" : "-"}
                {formatCurrency(Math.abs(delta), fullLocale)}
              </bdi>
              {deltaPct !== null && (
                <bdi className="tabular-nums">
                  ({isGain ? "+" : ""}
                  {deltaPct.toFixed(1)}%)
                </bdi>
              )}
            </div>

            <div className="space-y-1">
              <div className="h-[6px] w-full overflow-hidden rounded-full bg-surface-hover/40">
                <div
                  className="h-full rounded-full bg-text-muted/40"
                  style={{ width: `${previousWidthPct}%` }}
                />
              </div>
              <div className="h-[6px] w-full overflow-hidden rounded-full bg-surface-hover/40">
                <div
                  className={`h-full rounded-full ${isGain ? "bg-gain" : "bg-loss"}`}
                  style={{ width: `${currentWidthPct}%` }}
                />
              </div>
            </div>
          </>
        )}

        {fund.yearlyReturnPct !== null && (
          <p className="text-xs text-text-muted">
            <bdi>
              {locale === "he" ? "תשואה שנתית: " : "Yearly: "}
              <span
                className={
                  fund.yearlyReturnPct >= 0 ? "text-gain" : "text-loss"
                }
              >
                {fund.yearlyReturnPct >= 0 ? "+" : ""}
                {formatPercent(fund.yearlyReturnPct, fullLocale)}
              </span>
            </bdi>
          </p>
        )}
      </div>
    </motion.div>
  );
}
