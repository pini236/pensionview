"use client";

import { useLocale, useTranslations } from "next-intl";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
} from "recharts";
import { useChartDirection } from "./useChartDirection";
import { formatCurrency } from "@/lib/format";
import type { MonthlyCashflow } from "@/lib/cashflow";

interface CashflowStackedChartProps {
  rows: MonthlyCashflow[];
}

interface ChartDatum {
  date: string;
  /** deposits stacked above zero. Always >= 0. */
  depositsPos: number;
  /** market stacked above zero (when market >= 0). */
  marketPos: number;
  /** market stacked below zero (when market < 0). Stored negative for direct use. */
  marketNeg: number;
  /** Original signed market for tooltip / accessibility. */
  marketRaw: number | null;
  /** Original total Δ for tooltip. */
  totalChange: number | null;
  /** Whether this row had no previous report (first one). */
  isFirst: boolean;
}

const compact = (v: number) => {
  if (Math.abs(v) >= 1_000_000) return `₪${(v / 1_000_000).toFixed(1)}M`;
  if (Math.abs(v) >= 1_000) return `₪${Math.round(v / 1_000)}K`;
  return `₪${Math.round(v)}`;
};

export function CashflowStackedChart({ rows }: CashflowStackedChartProps) {
  const locale = useLocale();
  const fullLocale = locale === "he" ? "he-IL" : "en-IL";
  const t = useTranslations("trends.cashflow_section");
  const { yAxisOrientation } = useChartDirection();

  // Build chart data — deposits is always positive; market splits into the
  // positive band (above zero) and the negative band (below zero) so Recharts
  // can stack them in opposite directions correctly.
  const data: ChartDatum[] = rows.map((r) => {
    const market = r.market ?? 0;
    return {
      date: r.reportDate,
      depositsPos: r.deposits,
      marketPos: market > 0 ? market : 0,
      marketNeg: market < 0 ? market : 0,
      marketRaw: r.market,
      totalChange: r.totalChange,
      isFirst: r.isFirst,
    };
  });

  return (
    <div className="h-72 rounded-xl bg-surface p-4 lg:h-96">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 16, right: 16, bottom: 8, left: 16 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--color-surface-hover)" />
          <XAxis
            dataKey="date"
            stroke="var(--color-text-muted)"
            fontSize={11}
            tickFormatter={(d: string) =>
              new Date(d).toLocaleDateString(fullLocale, {
                month: "short",
                year: "2-digit",
              })
            }
          />
          <YAxis
            orientation={yAxisOrientation}
            stroke="var(--color-text-muted)"
            fontSize={11}
            tickFormatter={(v: number) => compact(v)}
            width={60}
          />
          <ReferenceLine y={0} stroke="var(--color-surface-hover)" />
          <Tooltip
            cursor={{ fill: "var(--color-surface-hover)", fillOpacity: 0.3 }}
            content={(p) => {
              const payload = p.payload as ReadonlyArray<{ payload: ChartDatum }> | undefined;
              const labelStr =
                typeof p.label === "string" || typeof p.label === "number"
                  ? String(p.label)
                  : undefined;
              return (
                <CashflowTooltip
                  payload={payload}
                  label={labelStr}
                  fullLocale={fullLocale}
                  tooltipLabel={(args) => t("tooltip", args)}
                />
              );
            }}
          />
          {/* Deposits — bottom of the positive stack */}
          <Bar
            dataKey="depositsPos"
            stackId="pos"
            fill="var(--color-fund-pension)"
            radius={[0, 0, 0, 0]}
            isAnimationActive={false}
          />
          {/* Market gain — stacked above deposits when positive */}
          <Bar
            dataKey="marketPos"
            stackId="pos"
            fill="var(--color-gain)"
            radius={[3, 3, 0, 0]}
            isAnimationActive={false}
          />
          {/* Market loss — stacked below zero, no deposits below zero so its
              own stackId is fine */}
          <Bar
            dataKey="marketNeg"
            stackId="neg"
            fill="var(--color-loss)"
            radius={[0, 0, 3, 3]}
            isAnimationActive={false}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

interface CashflowTooltipProps {
  payload: ReadonlyArray<{ payload: ChartDatum }> | undefined;
  label?: string;
  fullLocale: string;
  tooltipLabel: (args: { deposits: string; market: string; total: string }) => string;
}

function CashflowTooltip({ payload, label, fullLocale, tooltipLabel }: CashflowTooltipProps) {
  if (!payload || payload.length === 0) return null;
  const row = payload[0].payload;
  const dateLabel = label
    ? new Date(label).toLocaleDateString(fullLocale, { month: "long", year: "numeric" })
    : "";
  const depositsStr = formatCurrency(row.depositsPos, fullLocale);
  if (row.isFirst || row.marketRaw === null || row.totalChange === null) {
    return (
      <div className="rounded-lg bg-background/95 px-3 py-2 text-xs shadow-lg">
        <p className="text-text-primary">{dateLabel}</p>
        <p className="mt-1 text-text-muted">
          <bdi>{depositsStr}</bdi>
        </p>
      </div>
    );
  }
  const marketSign = row.marketRaw >= 0 ? "+" : "-";
  const marketStr = `${marketSign}${formatCurrency(Math.abs(row.marketRaw), fullLocale)}`;
  const totalSign = row.totalChange >= 0 ? "+" : "-";
  const totalStr = `${totalSign}${formatCurrency(Math.abs(row.totalChange), fullLocale)}`;
  return (
    <div className="rounded-lg bg-background/95 px-3 py-2 text-xs shadow-lg">
      <p className="text-text-primary">{dateLabel}</p>
      <p className="mt-1 text-text-muted">
        <bdi>{tooltipLabel({ deposits: depositsStr, market: marketStr, total: totalStr })}</bdi>
      </p>
    </div>
  );
}
