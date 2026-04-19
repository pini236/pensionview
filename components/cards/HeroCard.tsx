"use client";

import { useTranslations, useLocale } from "next-intl";
import { Badge } from "@/components/ui/Badge";
import { formatCurrency } from "@/lib/format";

interface HeroCardProps {
  totalSavings: number;
  previousTotalSavings: number | null;
}

export function HeroCard({ totalSavings, previousTotalSavings }: HeroCardProps) {
  const t = useTranslations("dashboard");
  const locale = useLocale();
  const fullLocale = locale === "he" ? "he-IL" : "en-IL";

  const change = previousTotalSavings ? totalSavings - previousTotalSavings : null;
  const changePct = previousTotalSavings ? ((totalSavings - previousTotalSavings) / previousTotalSavings) * 100 : null;

  return (
    <div className="relative overflow-hidden rounded-xl bg-surface p-6">
      <p className="text-sm text-text-muted">{t("totalSavings")}</p>
      <p className="mt-1 text-[32px] font-medium leading-tight text-text-primary">
        <bdi>{formatCurrency(totalSavings, fullLocale)}</bdi>
      </p>
      {change !== null && changePct !== null && (
        <div className="mt-2 flex items-center gap-2">
          <Badge value={change} format="currency" locale={fullLocale} />
          <Badge value={changePct} format="percent" locale={fullLocale} />
        </div>
      )}
    </div>
  );
}
