"use client";

import { motion, useMotionValue, useSpring, useTransform } from "motion/react";
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

  // Mouse-position-responsive 3D tilt — kept subtle (max 4deg) so it feels
  // tactile rather than gimmicky.
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const rotateX = useSpring(useTransform(y, [-50, 50], [4, -4]), {
    stiffness: 300,
    damping: 30,
  });
  const rotateY = useSpring(useTransform(x, [-50, 50], [-4, 4]), {
    stiffness: 300,
    damping: 30,
  });

  function handleMouseMove(e: React.MouseEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    x.set(e.clientX - rect.left - rect.width / 2);
    y.set(e.clientY - rect.top - rect.height / 2);
  }
  function handleMouseLeave() {
    x.set(0);
    y.set(0);
  }

  return (
    <motion.div
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      style={{ rotateX, rotateY, transformStyle: "preserve-3d" }}
      whileHover={{ scale: 1.02 }}
      transition={{ type: "spring", stiffness: 300, damping: 25 }}
      className="flex items-stretch gap-0 rounded-lg bg-surface transition-colors hover:bg-surface-hover cursor-pointer"
    >
      <div
        className="w-1 rounded-s-lg"
        style={{
          backgroundColor: color,
          boxShadow: `0 0 20px -2px ${color}`,
        }}
      />
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
