"use client";

import { TrendingUp } from "lucide-react";
import { useLocale } from "next-intl";

interface LongTermPlaceholderProps {
  reportsCount: number;
}

export function LongTermPlaceholder({ reportsCount }: LongTermPlaceholderProps) {
  const locale = useLocale();
  const remaining = Math.max(0, 12 - reportsCount);

  return (
    <div className="rounded-2xl border-2 border-dashed border-surface-hover p-12 text-center">
      <TrendingUp size={32} className="mx-auto mb-3 text-text-muted" />
      <p className="text-text-primary font-medium">
        {locale === "he" ? "מגמה ארוכת-טווח" : "Long-term trend"}
      </p>
      <p className="mt-1 text-sm text-text-muted">
        {locale === "he"
          ? `נצבור עוד ${remaining} דוחות כדי להציג גרף שנתי`
          : `Need ${remaining} more monthly reports to show a yearly trend chart`}
      </p>
    </div>
  );
}
