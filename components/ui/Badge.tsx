import { clsx } from "clsx";

interface BadgeProps {
  value: number;
  format: "currency" | "percent";
  locale?: string;
}

export function Badge({ value, format, locale = "he-IL" }: BadgeProps) {
  const isPositive = value >= 0;
  const formatted =
    format === "currency"
      ? new Intl.NumberFormat(locale, { style: "currency", currency: "ILS", minimumFractionDigits: 0 }).format(Math.abs(value))
      : new Intl.NumberFormat(locale, { style: "percent", minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(Math.abs(value) / 100);

  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-sm font-medium",
        isPositive ? "bg-gain/15 text-gain" : "bg-loss/15 text-loss"
      )}
    >
      <bdi>
        {isPositive ? "+" : "-"}{formatted}
      </bdi>
    </span>
  );
}
