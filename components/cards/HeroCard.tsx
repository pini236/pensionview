"use client";

import { motion } from "motion/react";
import { useTranslations, useLocale } from "next-intl";
import { Badge } from "@/components/ui/Badge";
import { AnimatedNumber } from "@/components/ui/AnimatedNumber";
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

  // Soft glow shadow tinted by gain/loss; falls back to a neutral cta tint when
  // there is no comparison yet. Using rgba so it works regardless of theme.
  const isPositive = change === null ? true : change >= 0;
  const glow = isPositive
    ? "shadow-[0_0_40px_-15px_rgba(34,197,94,0.35)]"
    : "shadow-[0_0_40px_-15px_rgba(245,158,11,0.35)]";

  return (
    <div className={`relative overflow-hidden rounded-xl bg-surface p-6 ${glow}`}>
      {/* One-shot shine sweep on mount */}
      <motion.div
        className="pointer-events-none absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent"
        initial={{ x: "-100%" }}
        animate={{ x: "200%" }}
        transition={{ duration: 1.6, delay: 0.4, ease: [0.32, 0.72, 0, 1] }}
      />
      <div className="relative">
        <p className="text-sm text-text-muted">{t("totalSavings")}</p>
        <p className="mt-1 text-[32px] font-medium leading-tight">
          <span className="bg-gradient-to-br from-text-primary via-text-primary to-text-muted bg-clip-text text-transparent">
            <bdi>
              <AnimatedNumber
                value={totalSavings}
                format={(n) => formatCurrency(n, fullLocale)}
              />
            </bdi>
          </span>
        </p>
        {change !== null && changePct !== null && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 1.0, duration: 0.4 }}
            className="mt-2 flex items-center gap-2"
          >
            <Badge value={change} format="currency" locale={fullLocale} />
            <Badge value={changePct} format="percent" locale={fullLocale} />
          </motion.div>
        )}
      </div>
    </div>
  );
}
