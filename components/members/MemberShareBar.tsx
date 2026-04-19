"use client";

import { motion } from "motion/react";
import { useLocale } from "next-intl";
import { AVATAR_COLOR_HEX } from "@/lib/avatar";
import { formatCurrency } from "@/lib/format";
import type { AvatarColor } from "@/lib/types";

export interface ShareSegment {
  memberId: string;
  name: string;
  color: AvatarColor;
  value: number;
}

interface MemberShareBarProps {
  segments: ShareSegment[];
  className?: string;
  /** Show value labels under the bar. Defaults to true. */
  showLabels?: boolean;
}

/**
 * Horizontal segmented bar: each member contributes a colored segment sized
 * proportionally to its `value`. Used in the household hero card.
 *
 * Renders a 12px tall bar with rounded ends; segments are flush, separated by
 * a 1px white sliver for visual breathing. Animates widths on mount.
 */
export function MemberShareBar({
  segments,
  className = "",
  showLabels = true,
}: MemberShareBarProps) {
  const locale = useLocale();
  const fullLocale = locale === "he" ? "he-IL" : "en-IL";

  const total = segments.reduce((sum, s) => sum + Math.max(0, s.value), 0);
  const safeTotal = total > 0 ? total : 1;

  return (
    <div className={className}>
      <div
        className="flex h-3 w-full overflow-hidden rounded-full bg-surface-hover/40"
        role="img"
        aria-label="Household share"
      >
        {segments.map((s, i) => {
          const widthPct = Math.max(0, (s.value / safeTotal) * 100);
          return (
            <motion.div
              key={s.memberId}
              initial={{ width: 0 }}
              animate={{ width: `${widthPct}%` }}
              transition={{ duration: 0.6, delay: 0.1 + i * 0.08 }}
              className="h-full"
              style={{
                backgroundColor: AVATAR_COLOR_HEX[s.color],
                boxShadow: `inset 0 0 0 0.5px rgba(255,255,255,0.08)`,
              }}
              title={`${s.name}: ${formatCurrency(s.value, fullLocale)}`}
            />
          );
        })}
      </div>
      {showLabels && (
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-text-muted">
          {segments.map((s) => {
            const pct = total > 0 ? (s.value / total) * 100 : 0;
            return (
              <span key={s.memberId} className="inline-flex items-center gap-1.5">
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ backgroundColor: AVATAR_COLOR_HEX[s.color] }}
                />
                <span className="text-text-primary">{s.name}</span>
                <span className="tabular-nums">
                  <bdi>{formatCurrency(s.value, fullLocale)}</bdi>
                  {" · "}
                  {pct.toFixed(0)}%
                </span>
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}
