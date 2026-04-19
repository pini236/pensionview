// =============================================================================
// PensionView — Database Types & Constants
// =============================================================================

// ---------------------------------------------------------------------------
// Type unions
// ---------------------------------------------------------------------------

export type ProductType =
  | "pension"
  | "education_fund"
  | "severance_fund"
  | "investment_fund"
  | "savings_policy";

export type InsuranceType = "health" | "life" | "disability";

export type CoverageType =
  | "life_death"
  | "disability"
  | "health_premium"
  | "health_policy";

export type InsuredRole = "primary" | "spouse" | "child";

export type ReportStatus = "pending" | "processing" | "done" | "failed";

export type QueueStatus = "pending" | "processing" | "done" | "failed";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const FUND_COLORS: Record<ProductType, string> = {
  pension: "#3B82F6",
  education_fund: "#A78BFA",
  severance_fund: "#F59E0B",
  investment_fund: "#22C55E",
  savings_policy: "#06B6D4",
} as const;

// ---------------------------------------------------------------------------
// Table interfaces
// ---------------------------------------------------------------------------

export interface Profile {
  id: string;
  name: string | null;
  national_id: string | null;
  email: string | null;
  google_drive_folder_id: string | null;
  google_access_token: string | null;
  google_refresh_token: string | null;
  google_token_expiry: string | null;
  date_of_birth: string | null;
  created_at: string;
}

export interface Report {
  id: string;
  profile_id: string;
  report_date: string;
  status: ReportStatus;
  raw_pdf_url: string | null;
  decrypted_pdf_url: string | null;
  drive_file_id: string | null;
  created_at: string;
}

export interface ReportSummary {
  id: string;
  report_id: string;
  total_savings: number | null;
  total_equity: number | null;
  monthly_deposits: number | null;
  projected_pension_full: number | null;
  projected_pension_base: number | null;
  disability_coverage_amount: number | null;
  life_insurance_amount: number | null;
  health_insurance_exists: boolean | null;
}

export interface SavingsProduct {
  id: string;
  report_id: string;
  provider: string | null;
  product_name: string | null;
  fund_number: string | null;
  product_type: ProductType | null;
  investment_track: string | null;
  track_code: string | null;
  balance: number | null;
  savings_capital: number;
  savings_pension: number;
  severance_capital: number;
  severance_pension: number;
  monthly_deposit: number;
  salary_for_product: number | null;
  deposit_fee_pct: number | null;
  balance_fee_pct: number | null;
  join_date: string | null;
  status: string;
  employment_status: string | null;
  employer: string | null;
  power_of_attorney: string | null;
  monthly_return_pct: number | null;
  yearly_return_pct: number | null;
  cumulative_return_36m_pct: number | null;
  cumulative_return_60m_pct: number | null;
  projected_pension_base: number | null;
  projected_pension_full: number | null;
  as_of_date: string | null;
}

export interface InsuranceProduct {
  id: string;
  report_id: string;
  provider: string | null;
  policy_number: string | null;
  product_type: InsuranceType | null;
  status: string;
  premium: number;
  power_of_attorney: string | null;
}

export interface InsuranceCoverage {
  id: string;
  insurance_product_id: string;
  coverage_name: string | null;
  coverage_type: CoverageType | null;
  insured_person: string | null;
  insured_role: InsuredRole | null;
  insured_amount: number;
  premium: number;
  start_date: string | null;
  end_date: string | null;
}

export interface ReportInsight {
  id: string;
  report_id: string;
  summary_text: string | null;
  generated_at: string;
}

export interface ProcessingQueueItem {
  id: string;
  report_id: string;
  step: string | null;
  status: QueueStatus;
  attempts: number;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}
