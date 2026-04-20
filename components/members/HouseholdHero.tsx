"use client";

import { motion } from "motion/react";
import { useLocale, useTranslations } from "next-intl";
import { AnimatedNumber } from "@/components/ui/AnimatedNumber";
import { MemberPill } from "./MemberPill";
import { MemberShareBar, type ShareSegment } from "./MemberShareBar";
import { formatCurrency } from "@/lib/format";
import type { Member } from "@/lib/types";

interface HouseholdHeroProps {
  total: number;
  segments: ShareSegment[];
  members: Member[];
  /** Optional per-member quick-glance values (e.g. delta vs last month). */
  perMemberValues?: Record<string, number>;
}

/**
 * Combined-view hero card. Big total + segmented share bar +
 * MemberPill quick-glances along the bottom.
 */
export function HouseholdHero({
  total,
  segments,
  members,
  perMemberValues,
}: HouseholdHeroProps) {
  const t = useTranslations("dashboard");
  const locale = useLocale();
  const fullLocale = locale === "he" ? "he-IL" : "en-IL";

  const eyebrow = locale === "he" ? "משק בית · יתרה כוללת" : "Household · Total balance";

  return (
    <div className="relative overflow-hidden rounded-xl bg-surface p-6 shadow-[0_0_40px_-15px_rgba(34,197,94,0.35)]">
      <motion.div
        className="pointer-events-none absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent"
        initial={{ x: "-100%" }}
        animate={{ x: "200%" }}
        transition={{ duration: 1.6, delay: 0.4, ease: [0.32, 0.72, 0, 1] }}
      />
      <div className="relative space-y-4">
        <p className="text-xs uppercase tracking-wide text-text-muted">{eyebrow}</p>
        <div>
          <p className="text-sm text-text-muted">{t("totalSavings")}</p>
          <p className="mt-1 text-2xl sm:text-3xl md:text-4xl lg:text-5xl xl:text-6xl font-medium leading-tight tabular-nums break-all">
            <span className="bg-gradient-to-br from-text-primary via-text-primary to-text-muted bg-clip-text text-transparent">
              <bdi>
                <AnimatedNumber
                  value={total}
                  format={(n) => formatCurrency(n, fullLocale)}
                />
              </bdi>
            </span>
          </p>
        </div>

        {segments.length > 0 && <MemberShareBar segments={segments} />}

        {members.length > 0 && (
          <div className="flex flex-wrap gap-2 pt-2">
            {members.map((m) => {
              const v = perMemberValues?.[m.id];
              return (
                <div
                  key={m.id}
                  className="flex items-center gap-2 rounded-full bg-background/60 px-2 py-1"
                >
                  <MemberPill member={m} size="sm" className="bg-transparent px-0 py-0" />
                  {typeof v === "number" && (
                    <span className="text-xs tabular-nums text-text-muted">
                      <bdi>{formatCurrency(v, fullLocale)}</bdi>
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
