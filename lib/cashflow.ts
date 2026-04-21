// =============================================================================
// PensionView — Cashflow helpers
// =============================================================================
//
// Pure functions that turn a sorted timeline of report snapshots into the
// "money you put in" vs "market profit/loss" view.
//
// Convention used everywhere here:
//   - Per-month deposits = report_summary.monthly_deposits (already a sum
//     across all funds in that report)
//   - Per-month total change = total_savings (this) − total_savings (previous)
//   - Per-month market = total change − deposits  (the part NOT explained by
//     money you put in)
//   - First report has no previous → totalChange/market are null (still
//     contributes its own deposits to the aggregate).
//   - Missing months are NOT interpolated; consumers render them as gaps.

/**
 * Snapshot for a single report. Caller is responsible for filtering to
 * `status = 'done'` and for combining household members if needed.
 */
export interface ReportSnapshot {
  reportId: string;
  reportDate: string; // ISO date
  totalSavings: number;
  monthlyDeposits: number;
}

/**
 * Per-month derived row. Keep `previousReportId` so callers can render a
 * "compared to X" link if they want.
 */
export interface MonthlyCashflow {
  reportId: string;
  reportDate: string;
  totalSavings: number;
  deposits: number;
  /** null when no previous report exists. */
  totalChange: number | null;
  /** null when no previous report exists. */
  market: number | null;
  /** null when no previous report exists. */
  marketPct: number | null;
  previousReportId: string | null;
  isFirst: boolean;
}

export interface AggregateCashflow {
  /** Total of all monthly_deposits across the entire timeline. */
  totalDeposits: number;
  /** total_savings(latest) − total_savings(earliest) − totalDeposits. */
  totalMarket: number;
  /** Percentage market gain relative to total deposits (null if no deposits). */
  marketPct: number | null;
  /** Earliest report date in the timeline (ISO). */
  startDate: string;
  /** Latest report date in the timeline (ISO). */
  endDate: string;
  /** Whole-month span between start and end (>= 1). */
  monthsSpan: number;
  reportCount: number;
}

/**
 * Sort an unordered list of snapshots ascending by date and returns a copy.
 * Stable — does not mutate the input.
 */
export function sortReportsAsc<T extends { reportDate: string }>(reports: T[]): T[] {
  return [...reports].sort((a, b) => a.reportDate.localeCompare(b.reportDate));
}

export function computeMonthlyCashflow(reports: ReportSnapshot[]): MonthlyCashflow[] {
  const sorted = sortReportsAsc(reports);
  return sorted.map((r, i) => {
    const prev = i > 0 ? sorted[i - 1] : null;
    if (!prev) {
      return {
        reportId: r.reportId,
        reportDate: r.reportDate,
        totalSavings: r.totalSavings,
        deposits: r.monthlyDeposits,
        totalChange: null,
        market: null,
        marketPct: null,
        previousReportId: null,
        isFirst: true,
      };
    }
    const totalChange = r.totalSavings - prev.totalSavings;
    const market = totalChange - r.monthlyDeposits;
    const marketPct =
      prev.totalSavings > 0 ? (market / prev.totalSavings) * 100 : null;
    return {
      reportId: r.reportId,
      reportDate: r.reportDate,
      totalSavings: r.totalSavings,
      deposits: r.monthlyDeposits,
      totalChange,
      market,
      marketPct,
      previousReportId: prev.reportId,
      isFirst: false,
    };
  });
}

export function computeAggregateCashflow(
  reports: ReportSnapshot[]
): AggregateCashflow | null {
  if (reports.length === 0) return null;
  const sorted = sortReportsAsc(reports);
  const first = sorted[0];
  const last = sorted[sorted.length - 1];

  const totalDeposits = sorted.reduce((sum, r) => sum + r.monthlyDeposits, 0);
  const totalMarket = last.totalSavings - first.totalSavings - totalDeposits;
  const marketPct =
    totalDeposits > 0 ? (totalMarket / totalDeposits) * 100 : null;

  return {
    totalDeposits,
    totalMarket,
    marketPct,
    startDate: first.reportDate,
    endDate: last.reportDate,
    monthsSpan: monthsBetween(first.reportDate, last.reportDate),
    reportCount: sorted.length,
  };
}

/**
 * Whole-month span between two ISO dates, clamped to a minimum of 1 so
 * "Over 0 months" never appears in the UI.
 */
export function monthsBetween(startISO: string, endISO: string): number {
  const a = new Date(startISO);
  const b = new Date(endISO);
  const months =
    (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth());
  return Math.max(1, months);
}
