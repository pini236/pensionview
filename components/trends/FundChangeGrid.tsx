"use client";

import { FundChangeCard, type FundChange } from "./FundChangeCard";

interface FundChangeGridProps {
  funds: FundChange[];
}

export function FundChangeGrid({ funds }: FundChangeGridProps) {
  // Find best/worst by yearly return (only when at least 2 funds have a value)
  const fundsWithReturn = funds.filter((f) => f.yearlyReturnPct !== null);
  let bestId: string | null = null;
  let worstId: string | null = null;

  if (fundsWithReturn.length >= 2) {
    const sorted = [...fundsWithReturn].sort(
      (a, b) => (b.yearlyReturnPct ?? 0) - (a.yearlyReturnPct ?? 0)
    );
    bestId = sorted[0].id;
    worstId = sorted[sorted.length - 1].id;
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {funds.map((fund, index) => (
        <FundChangeCard
          key={fund.id}
          fund={fund}
          index={index}
          isBest={fund.id === bestId}
          isWorst={fund.id === worstId}
        />
      ))}
    </div>
  );
}
