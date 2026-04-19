"use client";

import { motion } from "motion/react";
import { useLocale, useTranslations } from "next-intl";
import { Heart, Home, Shield } from "lucide-react";
import { MemberAvatar } from "@/components/members/MemberAvatar";
import { formatCurrency } from "@/lib/format";
import type { Member } from "@/lib/types";

export interface InsuranceMatrixRow {
  // The three coverage types we report on. Health is boolean (exists / not),
  // life and disability are amounts.
  health: boolean | null;
  life: number | null;
  disability: number | null;
}

interface InsuranceMatrixProps {
  members: Member[];
  /** memberId -> coverage row. Missing entries render as em-dashes. */
  data: Record<string, InsuranceMatrixRow>;
}

/**
 * Combined-view replacement for InsuranceSummary. Coverage types are NEVER
 * summed across members — they're displayed as a matrix where each cell shows
 * that member's own value (or em-dash for gaps).
 *
 * Below the table, a one-line insight points out gaps so the user can see
 * household-wide protection holes at a glance.
 */
export function InsuranceMatrix({ members, data }: InsuranceMatrixProps) {
  const t = useTranslations("dashboard");
  const locale = useLocale();
  const fullLocale = locale === "he" ? "he-IL" : "en-IL";
  const isHe = locale === "he";

  if (members.length === 0) return null;

  const rows = [
    {
      key: "health" as const,
      label: t("health"),
      icon: Heart,
      render: (v: InsuranceMatrixRow) =>
        v.health === true ? (
          <span className="text-gain">{t("active")}</span>
        ) : v.health === false ? (
          <span className="text-text-muted">{t("inactive")}</span>
        ) : (
          <Dash />
        ),
    },
    {
      key: "life" as const,
      label: t("life"),
      icon: Home,
      render: (v: InsuranceMatrixRow) =>
        v.life && v.life > 0 ? (
          <bdi className="tabular-nums">{formatCurrency(v.life, fullLocale)}</bdi>
        ) : (
          <Dash />
        ),
    },
    {
      key: "disability" as const,
      label: t("disability"),
      icon: Shield,
      render: (v: InsuranceMatrixRow) =>
        v.disability && v.disability > 0 ? (
          <bdi className="tabular-nums">
            {formatCurrency(v.disability, fullLocale)}
          </bdi>
        ) : (
          <Dash />
        ),
    },
  ];

  // Gap insight: list members lacking any of the three covers.
  const gaps: string[] = [];
  for (const m of members) {
    const row = data[m.id];
    const missing: string[] = [];
    if (!row || row.health !== true) missing.push(t("health"));
    if (!row || !row.life || row.life <= 0) missing.push(t("life"));
    if (!row || !row.disability || row.disability <= 0)
      missing.push(t("disability"));
    if (missing.length > 0) {
      gaps.push(`${m.name}: ${missing.join(" · ")}`);
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.5, delay: 0.3 }}
      className="space-y-3 rounded-xl border border-white/5 bg-surface/80 p-4 backdrop-blur-xl"
    >
      <div className="flex items-center justify-between">
        <p className="text-xs uppercase tracking-wide text-text-muted">
          {t("insurance")}
        </p>
        <p className="text-xs text-text-muted">
          {isHe ? "כיסוי אישי לכל בן משפחה" : "Per-member coverage"}
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr>
              <th className="text-start text-[11px] font-medium uppercase tracking-wide text-text-muted">
                &nbsp;
              </th>
              {members.map((m) => (
                <th
                  key={m.id}
                  className="px-3 py-2 text-center text-xs font-medium text-text-primary"
                >
                  <div className="flex flex-col items-center gap-1">
                    <MemberAvatar member={m} size="sm" />
                    <span className="max-w-[6rem] truncate text-[11px]">
                      {m.name}
                    </span>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(({ key, label, icon: Icon, render }) => (
              <tr key={key} className="border-t border-surface-hover/40">
                <td className="py-3 pe-2">
                  <div className="flex items-center gap-2 text-xs text-text-muted">
                    <Icon size={14} />
                    <span>{label}</span>
                  </div>
                </td>
                {members.map((m) => {
                  const row = data[m.id] ?? {
                    health: null,
                    life: null,
                    disability: null,
                  };
                  return (
                    <td
                      key={m.id}
                      className="px-3 py-3 text-center text-sm text-text-primary"
                    >
                      {render(row)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {gaps.length > 0 && (
        <p className="border-t border-surface-hover/40 pt-3 text-xs text-text-muted">
          {isHe ? "פערים בכיסוי: " : "Coverage gaps: "}
          <span className="text-text-primary">{gaps.join(" · ")}</span>
        </p>
      )}
    </motion.div>
  );
}

function Dash() {
  return <span className="text-text-muted/50">—</span>;
}
