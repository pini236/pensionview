"use client";

import { useTranslations, useLocale } from "next-intl";
import { formatCurrency } from "@/lib/format";

interface PensionProjectionProps {
  projectedFull: number;
  projectedBase: number;
  // Current age computed from the user's DOB. `null` means DOB is not set.
  currentAge: number | null;
}

export function PensionProjection({ projectedFull, projectedBase, currentAge }: PensionProjectionProps) {
  const t = useTranslations("dashboard");
  const locale = useLocale();
  const fullLocale = locale === "he" ? "he-IL" : "en-IL";

  if (currentAge === null) {
    return (
      <div className="relative overflow-hidden rounded-xl border border-white/5 bg-surface/80 p-5 text-center backdrop-blur-xl">
        <p className="text-sm text-text-muted">{locale === "he" ? "הוסף תאריך לידה בהגדרות לתחזית קצבה" : "Add your date of birth in Settings to see your pension projection"}</p>
      </div>
    );
  }

  const retirementAge = 67;
  const progress = Math.min(100, Math.max(0, (currentAge / retirementAge) * 100));

  return (
    <div className="relative overflow-hidden rounded-xl border border-white/5 bg-surface/80 p-5 backdrop-blur-xl">
      <div className="mb-4">
        <p className="text-sm text-text-muted">{t("projectedPension")}</p>
        <p className="mt-1 text-3xl font-medium text-text-primary">
          <bdi>{formatCurrency(projectedFull, fullLocale)}</bdi>
        </p>
        <p className="text-xs text-text-muted">{t("inTodaysValues")} • {t("perMonth")}</p>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs text-text-muted">
          <span>{currentAge}</span>
          <span>{retirementAge}</span>
        </div>
        <div className="relative h-2 overflow-hidden rounded-full bg-background">
          <div
            className="absolute inset-y-0 start-0 rounded-full bg-cta transition-all"
            style={{ width: `${progress}%` }}
          />
        </div>
        {projectedBase > 0 && projectedBase !== projectedFull && (
          <p className="text-xs text-text-muted">
            ללא הפקדות עתידיות: <bdi>{formatCurrency(projectedBase, fullLocale)}</bdi>
          </p>
        )}
      </div>
    </div>
  );
}
