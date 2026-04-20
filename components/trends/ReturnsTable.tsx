"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { useLocale } from "next-intl";
import { motion, AnimatePresence } from "motion/react";
import { formatPercent } from "@/lib/format";

export interface ReturnsRow {
  id: string;
  productName: string | null;
  monthly: number | null;
  yearly: number | null;
  cumulative36m: number | null;
  cumulative60m: number | null;
}

interface ReturnsTableProps {
  rows: ReturnsRow[];
}

function PctCell({ value, locale }: { value: number | null; locale: string }) {
  if (value === null || value === undefined) {
    return <span className="text-text-muted">—</span>;
  }
  const isGain = value >= 0;
  return (
    <bdi
      className={`tabular-nums ${isGain ? "text-gain" : "text-loss"}`}
    >
      {isGain ? "+" : ""}
      {formatPercent(value, locale)}
    </bdi>
  );
}

export function ReturnsTable({ rows }: ReturnsTableProps) {
  const [open, setOpen] = useState(false);
  const locale = useLocale();
  const fullLocale = locale === "he" ? "he-IL" : "en-IL";

  const labels = {
    title: locale === "he" ? "תשואות לפי תקופה" : "Returns by period",
    fund: locale === "he" ? "קרן" : "Fund",
    monthly: locale === "he" ? "חודשי" : "Monthly",
    yearly: locale === "he" ? "שנתי" : "Yearly",
    threeYear: locale === "he" ? "36 חודשים" : "36 months",
    fiveYear: locale === "he" ? "60 חודשים" : "60 months",
  };

  return (
    <div className="rounded-2xl bg-surface">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between p-4 text-text-primary transition-colors hover:bg-surface-hover/40 rounded-2xl"
        aria-expanded={open}
      >
        <span className="text-sm font-medium">{labels.title}</span>
        <ChevronDown
          size={18}
          className={`text-text-muted transition-transform ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="overflow-hidden"
          >
            <div className="relative px-2 pb-4">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[480px] text-sm">
                  <thead>
                    <tr className="text-text-muted">
                      <th className="px-3 py-2 text-start font-normal">
                        {labels.fund}
                      </th>
                      <th className="px-3 py-2 text-end font-normal">
                        {labels.monthly}
                      </th>
                      <th className="px-3 py-2 text-end font-normal">
                        {labels.yearly}
                      </th>
                      <th className="px-3 py-2 text-end font-normal">
                        {labels.threeYear}
                      </th>
                      <th className="px-3 py-2 text-end font-normal">
                        {labels.fiveYear}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <tr
                        key={row.id}
                        className="border-t border-surface-hover/40"
                      >
                        <td className="truncate px-3 py-2 text-text-primary">
                          {row.productName ?? "—"}
                        </td>
                        <td className="px-3 py-2 text-end">
                          <PctCell value={row.monthly} locale={fullLocale} />
                        </td>
                        <td className="px-3 py-2 text-end">
                          <PctCell value={row.yearly} locale={fullLocale} />
                        </td>
                        <td className="px-3 py-2 text-end">
                          <PctCell value={row.cumulative36m} locale={fullLocale} />
                        </td>
                        <td className="px-3 py-2 text-end">
                          <PctCell value={row.cumulative60m} locale={fullLocale} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="pointer-events-none absolute inset-y-0 end-0 w-8 bg-gradient-to-l from-surface to-transparent md:hidden" />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
