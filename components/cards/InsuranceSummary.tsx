"use client";

import { motion } from "motion/react";
import { useTranslations, useLocale } from "next-intl";
import { Heart, Home, Shield } from "lucide-react";
import { formatCurrency } from "@/lib/format";

interface InsuranceSummaryProps {
  healthExists: boolean;
  lifeAmount: number;
  disabilityAmount: number;
}

export function InsuranceSummary({ healthExists, lifeAmount, disabilityAmount }: InsuranceSummaryProps) {
  const t = useTranslations("dashboard");
  const locale = useLocale();
  const fullLocale = locale === "he" ? "he-IL" : "en-IL";

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.5, delay: 0.3 }}
      className="grid grid-cols-3 gap-2"
    >
      <div className="rounded-xl bg-surface p-3">
        <Heart size={18} className="mb-2 text-text-muted" />
        <p className="text-[10px] uppercase tracking-wide text-text-muted">{t("health")}</p>
        <p className={`mt-1 text-sm font-medium ${healthExists ? "text-gain" : "text-text-muted"}`}>
          {healthExists ? t("active") : t("inactive")}
        </p>
      </div>
      <div className="rounded-xl bg-surface p-3">
        <Home size={18} className="mb-2 text-text-muted" />
        <p className="text-[10px] uppercase tracking-wide text-text-muted">{t("life")}</p>
        <p className="mt-1 text-sm font-medium text-text-primary">
          <bdi>{formatCurrency(lifeAmount, fullLocale)}</bdi>
        </p>
      </div>
      <div className="rounded-xl bg-surface p-3">
        <Shield size={18} className="mb-2 text-text-muted" />
        <p className="text-[10px] uppercase tracking-wide text-text-muted">{t("disability")}</p>
        <p className="mt-1 text-sm font-medium text-text-primary">
          <bdi>{formatCurrency(disabilityAmount, fullLocale)}</bdi>
        </p>
      </div>
    </motion.div>
  );
}
