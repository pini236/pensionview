import { useLocale } from "next-intl";

export function useChartDirection() {
  const locale = useLocale();
  const isRTL = locale === "he";

  return {
    isRTL,
    yAxisOrientation: isRTL ? ("right" as const) : ("left" as const),
    xAxisReversed: false,
    tooltipAlign: isRTL ? ("right" as const) : ("left" as const),
  };
}
