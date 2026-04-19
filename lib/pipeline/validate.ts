import { createAdminClient } from "@/lib/supabase/admin";
import type { ProductType, InsuranceType, CoverageType, InsuredRole } from "@/lib/types";

interface ExtractedPage {
  page_type?: string;
  report_date?: string;
  summary?: {
    total_savings?: number;
    total_equity?: number;
    monthly_deposits?: number;
    projected_pension_full?: number;
    projected_pension_base?: number;
    disability_coverage_amount?: number;
    life_insurance_amount?: number;
    health_insurance_exists?: boolean;
  };
  savings_products?: Array<Record<string, unknown>>;
  insurance_products?: Array<Record<string, unknown>>;
}

export async function validateAndStore(reportId: string, pages: ExtractedPage[]) {
  const admin = createAdminClient();

  // Merge summary fields across all pages — different pages contribute different fields,
  // so we keep the first non-null value for each field instead of overwriting.
  const mergedSummary: Record<string, unknown> = {};
  for (const page of pages) {
    if (!page.summary) continue;
    for (const [key, value] of Object.entries(page.summary)) {
      if (value !== null && value !== undefined && mergedSummary[key] == null) {
        mergedSummary[key] = value;
      }
    }
  }

  if (Object.keys(mergedSummary).length > 0) {
    await admin.from("report_summary").upsert({
      report_id: reportId,
      total_savings: (mergedSummary.total_savings as number) ?? null,
      total_equity: (mergedSummary.total_equity as number) ?? null,
      monthly_deposits: (mergedSummary.monthly_deposits as number) ?? null,
      projected_pension_full: (mergedSummary.projected_pension_full as number) ?? null,
      projected_pension_base: (mergedSummary.projected_pension_base as number) ?? null,
      disability_coverage_amount: (mergedSummary.disability_coverage_amount as number) ?? null,
      life_insurance_amount: (mergedSummary.life_insurance_amount as number) ?? null,
      health_insurance_exists: (mergedSummary.health_insurance_exists as boolean) ?? false,
    }, { onConflict: "report_id" });
  }

  for (const page of pages) {
    if (page.savings_products) {
      for (const sp of page.savings_products) {
        await admin.from("savings_products").insert({
          report_id: reportId,
          provider: sp.provider as string,
          product_name: sp.product_name as string,
          fund_number: (sp.fund_number as string) ?? null,
          product_type: (sp.product_type as ProductType) ?? "pension",
          investment_track: (sp.investment_track as string) ?? null,
          track_code: (sp.track_code as string) ?? null,
          balance: (sp.balance as number) ?? null,
          savings_capital: (sp.savings_capital as number) ?? 0,
          savings_pension: (sp.savings_pension as number) ?? 0,
          severance_capital: (sp.severance_capital as number) ?? 0,
          severance_pension: (sp.severance_pension as number) ?? 0,
          monthly_deposit: (sp.monthly_deposit as number) ?? 0,
          salary_for_product: (sp.salary_for_product as number) ?? null,
          deposit_fee_pct: (sp.deposit_fee_pct as number) ?? null,
          balance_fee_pct: (sp.balance_fee_pct as number) ?? null,
          join_date: (sp.join_date as string) ?? null,
          status: (sp.status as string) ?? "active",
          employment_status: (sp.employment_status as string) ?? null,
          employer: (sp.employer as string) ?? null,
          power_of_attorney: (sp.power_of_attorney as string) ?? null,
          monthly_return_pct: (sp.monthly_return_pct as number) ?? null,
          yearly_return_pct: (sp.yearly_return_pct as number) ?? null,
          cumulative_return_36m_pct: (sp.cumulative_return_36m_pct as number) ?? null,
          cumulative_return_60m_pct: (sp.cumulative_return_60m_pct as number) ?? null,
          projected_pension_base: (sp.projected_pension_base as number) ?? null,
          projected_pension_full: (sp.projected_pension_full as number) ?? null,
          as_of_date: (sp.as_of_date as string) ?? null,
        });
      }
    }

    if (page.insurance_products) {
      for (const ip of page.insurance_products) {
        const { data: insertedProduct } = await admin.from("insurance_products").insert({
          report_id: reportId,
          provider: ip.provider as string,
          policy_number: (ip.policy_number as string) ?? null,
          product_type: (ip.product_type as InsuranceType) ?? "health",
          status: (ip.status as string) ?? "active",
          premium: (ip.premium as number) ?? 0,
          power_of_attorney: (ip.power_of_attorney as string) ?? null,
        }).select("id").single();

        if (insertedProduct && Array.isArray(ip.coverages)) {
          for (const cov of ip.coverages as Array<Record<string, unknown>>) {
            await admin.from("insurance_coverages").insert({
              insurance_product_id: insertedProduct.id,
              coverage_name: (cov.coverage_name as string) ?? null,
              coverage_type: (cov.coverage_type as CoverageType) ?? null,
              insured_person: (cov.insured_person as string) ?? null,
              insured_role: (cov.insured_role as InsuredRole) ?? null,
              insured_amount: (cov.insured_amount as number) ?? 0,
              premium: (cov.premium as number) ?? 0,
              start_date: (cov.start_date as string) ?? null,
              end_date: (cov.end_date as string) ?? null,
            });
          }
        }
      }
    }
  }
}
