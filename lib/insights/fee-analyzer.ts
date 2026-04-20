import type { SavingsProduct } from "@/lib/types";

// Israeli market average management fees (gemel-net public data, 2025).
// deposit_pct = % of monthly contributions; balance_pct = % of accumulated balance/year.
const MARKET_AVG: Record<string, { deposit_pct: number; balance_pct: number }> = {
  pension: { deposit_pct: 1.85, balance_pct: 0.21 },
  education_fund: { deposit_pct: 0, balance_pct: 0.62 },
  severance_fund: { deposit_pct: 0, balance_pct: 0.55 },
  investment_fund: { deposit_pct: 0, balance_pct: 0.58 },
  savings_policy: { deposit_pct: 0, balance_pct: 0.85 },
};

// Best-in-class fees (top 10% in market).
const BEST: Record<string, { deposit_pct: number; balance_pct: number }> = {
  pension: { deposit_pct: 0.5, balance_pct: 0.05 },
  education_fund: { deposit_pct: 0, balance_pct: 0.3 },
  severance_fund: { deposit_pct: 0, balance_pct: 0.3 },
  investment_fund: { deposit_pct: 0, balance_pct: 0.3 },
  savings_policy: { deposit_pct: 0, balance_pct: 0.5 },
};

const DEFAULT_BENCH = { deposit_pct: 0, balance_pct: 0.5 };
const DEFAULT_BEST = { deposit_pct: 0, balance_pct: 0.3 };

export interface FeeAnalysis {
  fundId: string;
  fundName: string;
  productType: string;
  depositFeePct: number;
  balanceFeePct: number;
  marketAvgDeposit: number;
  marketAvgBalance: number;
  bestDeposit: number;
  bestBalance: number;
  // Annual cost in ₪
  annualCostCurrent: number;
  annualCostMarket: number;
  annualCostBest: number;
  // Annual savings if user moved to market avg / best
  savingsVsMarket: number;
  savingsVsBest: number;
  // Verdict: "great" | "fair" | "high"
  verdict: "great" | "fair" | "high";
}

export function analyzeFees(funds: SavingsProduct[]): FeeAnalysis[] {
  return funds
    .filter((f) => f.balance != null && f.balance > 0)
    .map((f) => {
      const balance = f.balance ?? 0;
      const monthlyDeposit = f.monthly_deposit ?? 0;
      const annualDeposit = monthlyDeposit * 12;
      const depositFeePct = f.deposit_fee_pct ?? 0;
      const balanceFeePct = f.balance_fee_pct ?? 0;
      const productType = f.product_type ?? "";

      const market = MARKET_AVG[productType] ?? DEFAULT_BENCH;
      const best = BEST[productType] ?? DEFAULT_BEST;

      const annualCostCurrent =
        (annualDeposit * depositFeePct) / 100 + (balance * balanceFeePct) / 100;
      const annualCostMarket =
        (annualDeposit * market.deposit_pct) / 100 + (balance * market.balance_pct) / 100;
      const annualCostBest =
        (annualDeposit * best.deposit_pct) / 100 + (balance * best.balance_pct) / 100;

      const savingsVsMarket = Math.max(0, annualCostCurrent - annualCostMarket);
      const savingsVsBest = Math.max(0, annualCostCurrent - annualCostBest);

      let verdict: "great" | "fair" | "high" = "fair";
      if (annualCostCurrent <= annualCostBest * 1.2) verdict = "great";
      else if (annualCostCurrent > annualCostMarket * 1.1) verdict = "high";

      return {
        fundId: f.id,
        fundName: f.product_name ?? f.provider ?? "—",
        productType,
        depositFeePct,
        balanceFeePct,
        marketAvgDeposit: market.deposit_pct,
        marketAvgBalance: market.balance_pct,
        bestDeposit: best.deposit_pct,
        bestBalance: best.balance_pct,
        annualCostCurrent,
        annualCostMarket,
        annualCostBest,
        savingsVsMarket,
        savingsVsBest,
        verdict,
      };
    });
}

export function totalSavingsPotential(
  analyses: FeeAnalysis[]
): { vsMarket: number; vsBest: number } {
  return analyses.reduce(
    (acc, a) => ({
      vsMarket: acc.vsMarket + a.savingsVsMarket,
      vsBest: acc.vsBest + a.savingsVsBest,
    }),
    { vsMarket: 0, vsBest: 0 }
  );
}
