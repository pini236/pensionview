"use client";

import { useLocale } from "next-intl";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { formatCurrency } from "@/lib/format";
import { FUND_COLORS } from "@/lib/types";
import type { ProductType } from "@/lib/types";

interface DepositSlice {
  productName: string;
  productType: ProductType;
  amount: number;
}

interface DepositsDonutProps {
  deposits: DepositSlice[];
  total: number;
}

export function DepositsDonut({ deposits, total }: DepositsDonutProps) {
  const locale = useLocale();
  const fullLocale = locale === "he" ? "he-IL" : "en-IL";

  const filtered = deposits.filter((d) => d.amount > 0);

  return (
    <div className="rounded-xl bg-surface p-4">
      <div className="relative h-64">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={filtered}
              dataKey="amount"
              nameKey="productName"
              cx="50%"
              cy="50%"
              innerRadius={70}
              outerRadius={100}
              paddingAngle={2}
              stroke="none"
            >
              {filtered.map((slice, i) => (
                <Cell key={i} fill={FUND_COLORS[slice.productType]} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{ backgroundColor: "#0F172A", border: "1px solid #334155", borderRadius: 8 }}
              labelStyle={{ color: "#F8FAFC" }}
              formatter={(value, name) => [formatCurrency(Number(value), fullLocale), String(name)]}
            />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <p className="text-2xl font-medium text-text-primary">
            <bdi>{formatCurrency(total, fullLocale)}</bdi>
          </p>
          <p className="text-xs text-text-muted">לחודש</p>
        </div>
      </div>
      <div className="mt-4 space-y-2">
        {filtered.map((slice, i) => (
          <div key={i} className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-2 min-w-0">
              <span
                className="h-2 w-2 flex-shrink-0 rounded-full"
                style={{ backgroundColor: FUND_COLORS[slice.productType] }}
              />
              <span className="truncate text-text-muted">{slice.productName}</span>
            </div>
            <span className="text-text-primary">
              <bdi>{formatCurrency(slice.amount, fullLocale)}</bdi>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
