-- PensionView: Initial Database Schema
-- Migration 001

-- =============================================================================
-- EXTENSIONS
-- =============================================================================
create extension if not exists "uuid-ossp";

-- =============================================================================
-- TABLES
-- =============================================================================

-- profiles
create table profiles (
  id              uuid primary key default uuid_generate_v4(),
  name            text,
  national_id     text,
  email           text unique,
  google_drive_folder_id  text,
  google_access_token     text,
  google_refresh_token    text,
  google_token_expiry     timestamptz,
  created_at      timestamptz not null default now()
);

-- reports
create table reports (
  id              uuid primary key default uuid_generate_v4(),
  profile_id      uuid not null references profiles(id),
  report_date     date not null,
  status          text not null default 'pending'
                    check (status in ('pending', 'processing', 'done', 'failed')),
  raw_pdf_url     text,
  decrypted_pdf_url text,
  drive_file_id   text,
  created_at      timestamptz not null default now(),
  unique (profile_id, report_date)
);

-- report_summary
create table report_summary (
  id              uuid primary key default uuid_generate_v4(),
  report_id       uuid not null references reports(id) on delete cascade,
  total_savings   numeric,
  total_equity    numeric,
  monthly_deposits numeric,
  projected_pension_full numeric,
  projected_pension_base numeric,
  disability_coverage_amount numeric,
  life_insurance_amount numeric,
  health_insurance_exists boolean,
  unique (report_id)
);

-- savings_products
create table savings_products (
  id              uuid primary key default uuid_generate_v4(),
  report_id       uuid not null references reports(id) on delete cascade,
  provider        text,
  product_name    text,
  fund_number     text,
  product_type    text
                    check (product_type in (
                      'pension', 'education_fund', 'severance_fund',
                      'investment_fund', 'savings_policy'
                    )),
  investment_track text,
  track_code      text,
  balance         numeric,
  savings_capital numeric not null default 0,
  savings_pension numeric not null default 0,
  severance_capital numeric not null default 0,
  severance_pension numeric not null default 0,
  monthly_deposit numeric not null default 0,
  salary_for_product numeric,
  deposit_fee_pct numeric,
  balance_fee_pct numeric,
  join_date       date,
  status          text not null default 'active',
  employment_status text,
  employer        text,
  power_of_attorney text,
  monthly_return_pct numeric,
  yearly_return_pct numeric,
  cumulative_return_36m_pct numeric,
  cumulative_return_60m_pct numeric,
  projected_pension_base numeric,
  projected_pension_full numeric,
  as_of_date      date
);

-- insurance_products
create table insurance_products (
  id              uuid primary key default uuid_generate_v4(),
  report_id       uuid not null references reports(id) on delete cascade,
  provider        text,
  policy_number   text,
  product_type    text
                    check (product_type in ('health', 'life', 'disability')),
  status          text not null default 'active',
  premium         numeric not null default 0,
  power_of_attorney text
);

-- insurance_coverages
create table insurance_coverages (
  id                    uuid primary key default uuid_generate_v4(),
  insurance_product_id  uuid not null references insurance_products(id) on delete cascade,
  coverage_name         text,
  coverage_type         text
                          check (coverage_type in (
                            'life_death', 'disability', 'health_premium', 'health_policy'
                          )),
  insured_person        text,
  insured_role          text
                          check (insured_role in ('primary', 'spouse', 'child')),
  insured_amount        numeric not null default 0,
  premium               numeric not null default 0,
  start_date            date,
  end_date              date
);

-- report_insights
create table report_insights (
  id              uuid primary key default uuid_generate_v4(),
  report_id       uuid not null references reports(id) on delete cascade,
  summary_text    text,
  generated_at    timestamptz not null default now(),
  unique (report_id)
);

-- processing_queue
create table processing_queue (
  id              uuid primary key default uuid_generate_v4(),
  report_id       uuid not null references reports(id) on delete cascade,
  step            text,
  status          text not null default 'pending'
                    check (status in ('pending', 'processing', 'done', 'failed')),
  attempts        integer not null default 0,
  error_message   text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- =============================================================================
-- INDEXES
-- =============================================================================
create index idx_reports_profile_date on reports (profile_id, report_date desc);
create index idx_savings_products_report on savings_products (report_id);
create index idx_insurance_products_report on insurance_products (report_id);
create index idx_insurance_coverages_product on insurance_coverages (insurance_product_id);
create index idx_processing_queue_report_status on processing_queue (report_id, status);

-- =============================================================================
-- ROW LEVEL SECURITY
-- =============================================================================

-- Enable RLS on all tables
alter table profiles enable row level security;
alter table reports enable row level security;
alter table report_summary enable row level security;
alter table savings_products enable row level security;
alter table insurance_products enable row level security;
alter table insurance_coverages enable row level security;
alter table report_insights enable row level security;
alter table processing_queue enable row level security;

-- ---------------------------------------------------------------------------
-- User read-access policies (via JWT email claim)
-- ---------------------------------------------------------------------------

-- profiles: users can read their own profile
create policy "Users can read own profile"
  on profiles for select
  using (email = auth.jwt()->>'email');

-- reports: users can read their own reports
create policy "Users can read own reports"
  on reports for select
  using (
    profile_id in (
      select id from profiles where email = auth.jwt()->>'email'
    )
  );

-- report_summary: users can read summaries for their own reports
create policy "Users can read own report summaries"
  on report_summary for select
  using (
    report_id in (
      select r.id from reports r
      join profiles p on p.id = r.profile_id
      where p.email = auth.jwt()->>'email'
    )
  );

-- savings_products: users can read their own savings products
create policy "Users can read own savings products"
  on savings_products for select
  using (
    report_id in (
      select r.id from reports r
      join profiles p on p.id = r.profile_id
      where p.email = auth.jwt()->>'email'
    )
  );

-- insurance_products: users can read their own insurance products
create policy "Users can read own insurance products"
  on insurance_products for select
  using (
    report_id in (
      select r.id from reports r
      join profiles p on p.id = r.profile_id
      where p.email = auth.jwt()->>'email'
    )
  );

-- insurance_coverages: users can read coverages for their own insurance products
create policy "Users can read own insurance coverages"
  on insurance_coverages for select
  using (
    insurance_product_id in (
      select ip.id from insurance_products ip
      join reports r on r.id = ip.report_id
      join profiles p on p.id = r.profile_id
      where p.email = auth.jwt()->>'email'
    )
  );

-- report_insights: users can read insights for their own reports
create policy "Users can read own report insights"
  on report_insights for select
  using (
    report_id in (
      select r.id from reports r
      join profiles p on p.id = r.profile_id
      where p.email = auth.jwt()->>'email'
    )
  );

-- processing_queue: users can read queue items for their own reports
create policy "Users can read own processing queue"
  on processing_queue for select
  using (
    report_id in (
      select r.id from reports r
      join profiles p on p.id = r.profile_id
      where p.email = auth.jwt()->>'email'
    )
  );

-- ---------------------------------------------------------------------------
-- Service role full-access policies (for backend / edge functions)
-- ---------------------------------------------------------------------------
create policy "Service role full access on profiles"
  on profiles for all
  using (auth.role() = 'service_role');

create policy "Service role full access on reports"
  on reports for all
  using (auth.role() = 'service_role');

create policy "Service role full access on report_summary"
  on report_summary for all
  using (auth.role() = 'service_role');

create policy "Service role full access on savings_products"
  on savings_products for all
  using (auth.role() = 'service_role');

create policy "Service role full access on insurance_products"
  on insurance_products for all
  using (auth.role() = 'service_role');

create policy "Service role full access on insurance_coverages"
  on insurance_coverages for all
  using (auth.role() = 'service_role');

create policy "Service role full access on report_insights"
  on report_insights for all
  using (auth.role() = 'service_role');

create policy "Service role full access on processing_queue"
  on processing_queue for all
  using (auth.role() = 'service_role');
