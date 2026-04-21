import { describe, it, expect } from "vitest";
import {
  computeMonthlyCashflow,
  computeAggregateCashflow,
  monthsBetween,
  sortReportsAsc,
  type ReportSnapshot,
} from "@/lib/cashflow";

const snap = (
  reportId: string,
  reportDate: string,
  totalSavings: number,
  monthlyDeposits: number
): ReportSnapshot => ({ reportId, reportDate, totalSavings, monthlyDeposits });

describe("sortReportsAsc", () => {
  it("sorts by reportDate ascending and does not mutate", () => {
    const input = [snap("c", "2025-03-01", 0, 0), snap("a", "2025-01-01", 0, 0), snap("b", "2025-02-01", 0, 0)];
    const sorted = sortReportsAsc(input);
    expect(sorted.map((r) => r.reportId)).toEqual(["a", "b", "c"]);
    expect(input.map((r) => r.reportId)).toEqual(["c", "a", "b"]);
  });
});

describe("computeMonthlyCashflow", () => {
  it("returns empty for empty input", () => {
    expect(computeMonthlyCashflow([])).toEqual([]);
  });

  it("flags the first report and leaves market null", () => {
    const rows = computeMonthlyCashflow([snap("a", "2025-01-01", 100_000, 3_000)]);
    expect(rows).toHaveLength(1);
    expect(rows[0].isFirst).toBe(true);
    expect(rows[0].deposits).toBe(3_000);
    expect(rows[0].market).toBeNull();
    expect(rows[0].totalChange).toBeNull();
    expect(rows[0].marketPct).toBeNull();
    expect(rows[0].previousReportId).toBeNull();
  });

  it("computes market = total change − deposits", () => {
    const rows = computeMonthlyCashflow([
      snap("a", "2025-01-01", 100_000, 3_000),
      snap("b", "2025-02-01", 104_500, 3_000), // change 4500, market 1500
    ]);
    expect(rows[1].totalChange).toBe(4_500);
    expect(rows[1].deposits).toBe(3_000);
    expect(rows[1].market).toBe(1_500);
    expect(rows[1].previousReportId).toBe("a");
    expect(rows[1].isFirst).toBe(false);
    // marketPct is market relative to PREVIOUS total
    expect(rows[1].marketPct).toBeCloseTo((1_500 / 100_000) * 100, 5);
  });

  it("returns negative market when balance fell despite deposits", () => {
    const rows = computeMonthlyCashflow([
      snap("a", "2025-01-01", 100_000, 3_000),
      snap("b", "2025-02-01", 99_000, 3_000), // change -1000, market -4000
    ]);
    expect(rows[1].market).toBe(-4_000);
  });

  it("sorts unsorted input by date before computing", () => {
    const rows = computeMonthlyCashflow([
      snap("b", "2025-02-01", 104_500, 3_000),
      snap("a", "2025-01-01", 100_000, 3_000),
    ]);
    expect(rows.map((r) => r.reportId)).toEqual(["a", "b"]);
    expect(rows[1].market).toBe(1_500);
  });
});

describe("computeAggregateCashflow", () => {
  it("returns null for empty input", () => {
    expect(computeAggregateCashflow([])).toBeNull();
  });

  it("computes aggregate market = ΔtotalSavings − sumDeposits", () => {
    const agg = computeAggregateCashflow([
      snap("a", "2024-01-01", 100_000, 3_000),
      snap("b", "2024-06-01", 120_000, 3_000),
      snap("c", "2025-01-01", 150_000, 3_000),
    ]);
    expect(agg).not.toBeNull();
    if (!agg) return;
    expect(agg.totalDeposits).toBe(9_000);
    expect(agg.totalMarket).toBe(150_000 - 100_000 - 9_000); // 41_000
    expect(agg.startDate).toBe("2024-01-01");
    expect(agg.endDate).toBe("2025-01-01");
    expect(agg.monthsSpan).toBe(12);
    expect(agg.reportCount).toBe(3);
    expect(agg.marketPct).toBeCloseTo((41_000 / 9_000) * 100, 5);
  });

  it("handles single-report timeline gracefully", () => {
    const agg = computeAggregateCashflow([snap("a", "2025-01-01", 100_000, 3_000)]);
    expect(agg).not.toBeNull();
    if (!agg) return;
    expect(agg.totalDeposits).toBe(3_000);
    expect(agg.totalMarket).toBe(0 - 3_000); // -3000 (no growth period)
    expect(agg.monthsSpan).toBe(1);
  });

  it("marketPct null when no deposits ever occurred", () => {
    const agg = computeAggregateCashflow([
      snap("a", "2025-01-01", 100_000, 0),
      snap("b", "2025-02-01", 105_000, 0),
    ]);
    expect(agg?.marketPct).toBeNull();
  });
});

describe("monthsBetween", () => {
  it("returns whole-month spans, clamped to >= 1", () => {
    expect(monthsBetween("2024-01-01", "2025-01-01")).toBe(12);
    expect(monthsBetween("2024-01-01", "2024-01-15")).toBe(1);
    expect(monthsBetween("2025-03-01", "2024-12-01")).toBe(1); // clamped
  });
});
