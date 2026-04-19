"use client";

import { motion } from "motion/react";
import { useLocale } from "next-intl";
import { formatCurrency, formatPercent } from "@/lib/format";
import type { ProductType } from "@/lib/types";
import { FUND_COLORS } from "@/lib/types";

interface FundCardProps {
  provider: string;
  productName: string;
  productType: ProductType;
  balance: number;
  monthlyReturnPct: number | null;
}

export function FundCard({ provider, productName, productType, balance, monthlyReturnPct }: FundCardProps) {
  const locale = useLocale();
  const fullLocale = locale === "he" ? "he-IL" : "en-IL";
  const color = FUND_COLORS[productType];

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      whileHover={{ scale: 1.01 }}
      className="flex items-stretch gap-0 rounded-lg bg-surface transition-colors hover:bg-surface-hover cursor-pointer"
    >
      <div className="w-1 rounded-s-lg" style={{ backgroundColor: color }} />
      <div className="flex flex-1 items-center justify-between p-4">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-text-primary">{productName}</p>
          <p className="text-xs text-text-muted">{provider}</p>
        </div>
        <div className="text-end">
          <p className="text-sm font-medium text-text-primary">
            <bdi>{formatCurrency(balance, fullLocale)}</bdi>
          </p>
          {monthlyReturnPct !== null && (
            <p className={`text-xs ${monthlyReturnPct >= 0 ? "text-gain" : "text-loss"}`}>
              <bdi>{monthlyReturnPct >= 0 ? "+" : ""}{formatPercent(monthlyReturnPct, fullLocale)}</bdi>
            </p>
          )}
        </div>
      </div>
    </motion.div>
  );
}
