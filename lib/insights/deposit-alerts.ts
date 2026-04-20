import type { SavingsProduct } from "@/lib/types";

export type DepositAlertKind = "stopped" | "dropped" | "started" | "resumed";

export interface DepositAlert {
  kind: DepositAlertKind;
  severity: "high" | "medium" | "low";
  fundName: string;
  provider: string;
  currentDeposit: number;
  expectedDeposit: number;
  monthsAffected: number;
  message: string; // Hebrew
  messageEn: string; // English
}

interface FundHistory {
  fund_number: string | null;
  product_name: string;
  provider: string;
  reports: Array<{ report_date: string; monthly_deposit: number }>;
}

export function detectDepositAlerts(history: FundHistory[]): DepositAlert[] {
  const alerts: DepositAlert[] = [];

  for (const fund of history) {
    const sorted = [...fund.reports].sort((a, b) => b.report_date.localeCompare(a.report_date));
    if (sorted.length < 2) continue; // Need history to compare

    const current = sorted[0];
    const prev = sorted.slice(1, 4); // up to 3 prior months
    if (prev.length === 0) continue;

    const avgPrev = prev.reduce((s, r) => s + r.monthly_deposit, 0) / prev.length;
    const allPrevPositive = prev.every((r) => r.monthly_deposit > 0);

    if (current.monthly_deposit === 0 && allPrevPositive && avgPrev > 0) {
      alerts.push({
        kind: "stopped",
        severity: "high",
        fundName: fund.product_name,
        provider: fund.provider,
        currentDeposit: 0,
        expectedDeposit: Math.round(avgPrev),
        monthsAffected: 1,
        message: `הפסקת הפקדות ל${fund.product_name} — הפקדה אחרונה ${formatNis(avgPrev)} בחודש`,
        messageEn: `Deposits to ${fund.product_name} stopped — was ${formatNis(avgPrev)}/month`,
      });
    } else if (
      avgPrev > 0 &&
      current.monthly_deposit > 0 &&
      current.monthly_deposit < avgPrev * 0.5
    ) {
      alerts.push({
        kind: "dropped",
        severity: "medium",
        fundName: fund.product_name,
        provider: fund.provider,
        currentDeposit: current.monthly_deposit,
        expectedDeposit: Math.round(avgPrev),
        monthsAffected: 1,
        message: `הפקדה ל${fund.product_name} ירדה — ${formatNis(current.monthly_deposit)} (היה ${formatNis(avgPrev)})`,
        messageEn: `Deposit to ${fund.product_name} dropped to ${formatNis(current.monthly_deposit)} (was ${formatNis(avgPrev)})`,
      });
    }
  }

  return alerts;
}

function formatNis(n: number): string {
  return new Intl.NumberFormat("he-IL", { style: "currency", currency: "ILS", minimumFractionDigits: 0 }).format(n);
}

/**
 * Group raw savings_products rows (from multiple reports) into per-fund
 * histories, keyed by fund_number when available, else by provider+product_name.
 *
 * Rows must already have report_date attached (we derive it from the report
 * lookup at the call site).
 */
export function groupFundHistories(
  rows: Array<
    Pick<SavingsProduct, "fund_number" | "product_name" | "provider" | "monthly_deposit"> & {
      report_date: string;
    }
  >
): FundHistory[] {
  const map = new Map<string, FundHistory>();

  for (const row of rows) {
    const product_name = row.product_name ?? "—";
    const provider = row.provider ?? "—";
    const key = row.fund_number ? `fn:${row.fund_number}` : `np:${provider}|${product_name}`;

    let entry = map.get(key);
    if (!entry) {
      entry = {
        fund_number: row.fund_number,
        product_name,
        provider,
        reports: [],
      };
      map.set(key, entry);
    }
    entry.reports.push({
      report_date: row.report_date,
      monthly_deposit: row.monthly_deposit ?? 0,
    });
  }

  return Array.from(map.values());
}
