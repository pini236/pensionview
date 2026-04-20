"use client";

import { useState, useMemo } from "react";
import { useLocale } from "next-intl";
import { AreaChart, Area, XAxis, YAxis, ResponsiveContainer, Tooltip, CartesianGrid } from "recharts";
import { useChartDirection } from "./useChartDirection";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { formatCurrency } from "@/lib/format";

interface DataPoint {
  date: string;
  value: number;
}

interface PortfolioChartProps {
  data: DataPoint[];
}

type Period = "1M" | "6M" | "1Y" | "3Y" | "ALL";

const compactCurrency = (v: number) => {
  if (Math.abs(v) >= 1_000_000) return `₪${(v / 1_000_000).toFixed(1)}M`;
  if (Math.abs(v) >= 1_000) return `₪${Math.round(v / 1_000)}K`;
  return `₪${v}`;
};

// Theme-aware colors via CSS variables. Recharts forwards these to the
// underlying SVG/style attributes, so the chart re-paints when the theme
// toggles (--color-* values change at the document root).
const chartColors = {
  surface: "var(--color-surface)",
  surfaceHover: "var(--color-surface-hover)",
  textMuted: "var(--color-text-muted)",
  textPrimary: "var(--color-text-primary)",
  gain: "var(--color-gain)",
};

export function PortfolioChart({ data }: PortfolioChartProps) {
  const locale = useLocale();
  const fullLocale = locale === "he" ? "he-IL" : "en-IL";
  const { yAxisOrientation } = useChartDirection();
  const [period, setPeriod] = useState<Period>("1Y");

  const filtered = useMemo(() => {
    if (period === "ALL" || data.length === 0) return data;
    const months = { "1M": 1, "6M": 6, "1Y": 12, "3Y": 36 }[period];
    const cutoff = new Date();
    cutoff.setMonth(cutoff.getMonth() - (months ?? 12));
    return data.filter((d) => new Date(d.date) >= cutoff);
  }, [data, period]);

  return (
    <div className="space-y-3">
      <SegmentedControl<Period>
        segments={[
          { value: "1M", label: "1M" },
          { value: "6M", label: "6M" },
          { value: "1Y", label: "1Y" },
          { value: "3Y", label: "3Y" },
          { value: "ALL", label: "All" },
        ]}
        value={period}
        onChange={setPeriod}
      />
      <div className="h-64 lg:h-[28rem] xl:h-[32rem] rounded-xl bg-surface p-4">
        {filtered.length < 2 ? (
          <div className="flex h-full items-center justify-center text-sm text-text-muted">
            לא מספיק נתונים להצגת המגמה בתקופה זו
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={filtered} margin={{ top: 16, right: 16, bottom: 8, left: 16 }}>
              <defs>
                <linearGradient id="portfolioGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={chartColors.gain} stopOpacity={0.4} />
                  <stop offset="100%" stopColor={chartColors.gain} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke={chartColors.surfaceHover} />
              <XAxis dataKey="date" stroke={chartColors.textMuted} fontSize={11} tickFormatter={(d) => new Date(d).toLocaleDateString(fullLocale, { month: "short" })} />
              <YAxis orientation={yAxisOrientation} stroke={chartColors.textMuted} fontSize={11} tickFormatter={(v) => compactCurrency(v)} width={56} />
              <Tooltip
                contentStyle={{ backgroundColor: chartColors.surface, border: "none", borderRadius: 8 }}
                labelStyle={{ color: chartColors.textPrimary }}
                itemStyle={{ color: chartColors.textPrimary }}
                formatter={(value) => [formatCurrency(Number(value), fullLocale), ""]}
                labelFormatter={(label) => new Date(String(label)).toLocaleDateString(fullLocale, { year: "numeric", month: "long" })}
              />
              <Area type="monotone" dataKey="value" stroke={chartColors.gain} strokeWidth={2} fill="url(#portfolioGradient)" dot={{ fill: chartColors.gain, r: 4 }} />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
