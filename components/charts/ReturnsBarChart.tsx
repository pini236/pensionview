"use client";

import { useState } from "react";
import { useLocale } from "next-intl";
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Cell, Tooltip, LabelList } from "recharts";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { formatPercent } from "@/lib/format";
import { FUND_COLORS } from "@/lib/types";
import type { ProductType } from "@/lib/types";

type ReturnPeriod = "monthly" | "yearly" | "36mo" | "60mo";

interface FundReturn {
  productName: string;
  productType: ProductType;
  monthly: number | null;
  yearly: number | null;
  cumulative36m: number | null;
  cumulative60m: number | null;
}

interface ReturnsBarChartProps {
  funds: FundReturn[];
}

export function ReturnsBarChart({ funds }: ReturnsBarChartProps) {
  const locale = useLocale();
  const fullLocale = locale === "he" ? "he-IL" : "en-IL";
  const [period, setPeriod] = useState<ReturnPeriod>("yearly");

  const data = funds.map((f) => ({
    name: f.productName,
    type: f.productType,
    value: period === "monthly" ? f.monthly :
           period === "yearly" ? f.yearly :
           period === "36mo" ? f.cumulative36m :
           f.cumulative60m,
  })).filter((d) => d.value !== null);

  return (
    <div className="space-y-3">
      <SegmentedControl<ReturnPeriod>
        segments={[
          { value: "monthly", label: "חודשי" },
          { value: "yearly", label: "שנתי" },
          { value: "36mo", label: "36 חודשים" },
          { value: "60mo", label: "60 חודשים" },
        ]}
        value={period}
        onChange={setPeriod}
      />
      <div className="h-72 lg:h-80 rounded-xl bg-surface p-4">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ top: 8, right: 56, bottom: 8, left: 56 }}>
            <XAxis type="number" stroke="#94A3B8" fontSize={11} tickFormatter={(v) => formatPercent(v, fullLocale)} />
            <YAxis dataKey="name" type="category" stroke="#94A3B8" fontSize={11} width={140} />
            <Tooltip
              contentStyle={{ backgroundColor: "#0F172A", border: "1px solid #334155", borderRadius: 8 }}
              labelStyle={{ color: "#F8FAFC" }}
              formatter={(value) => [formatPercent(Number(value), fullLocale), ""]}
            />
            <Bar dataKey="value" radius={[0, 4, 4, 0]} minPointSize={2}>
              <LabelList
                dataKey="value"
                content={(props) => {
                  const { x, y, width, height, value } = props as {
                    x: number; y: number; width: number; height: number; value: number;
                  };
                  if (value == null) return null;
                  const isNegative = value < 0;
                  // Bar's "right edge" is x+width for positive, x for negative
                  const labelX = isNegative ? x - 6 : x + width + 6;
                  const anchor: "start" | "end" = isNegative ? "end" : "start";
                  return (
                    <text x={labelX} y={y + height / 2} dy={4}
                      textAnchor={anchor} fill="#F8FAFC" fontSize={11}>
                      {formatPercent(value, fullLocale)}
                    </text>
                  );
                }}
              />
              {data.map((d, i) => (
                <Cell key={i} fill={FUND_COLORS[d.type]} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
