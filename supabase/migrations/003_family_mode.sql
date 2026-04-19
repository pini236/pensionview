-- PensionView: Family Mode v1
-- Migration 003
--
-- Adds household grouping to profiles and rewrites RLS to be household-scoped
-- via the self profile's email JWT claim. One auth user owns one household;
-- all members in that household are co-visible.
--
-- Rollout order:
--   1. Run this DDL (003)
--   2. Run 004_backfill_existing_profiles.sql (sets is_self / household_id for Pini + Miri)
--   3. Verify with the queries in spec section H
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Schema: new columns on profiles
-- ---------------------------------------------------------------------------
alter table profiles
  add column household_id   uuid not null default gen_random_uuid(),
  add column relationship   text check (relationship in ('self','spouse','child','parent','sibling','other')),
  add column avatar_color   text check (avatar_color in ('blue','purple','amber','green','cyan')),
  add column is_self        boolean not null default false,
  add column deleted_at     timestamptz;

-- Lookup: list household members fast, ignoring archived rows.
create index profiles_household_id_idx
  on profiles(household_id)
  where deleted_at is null;

-- Invariant: at most one self per household. Partial unique index is the
-- cheapest way to enforce this without blocking non-self rows.
create unique index profiles_one_self_per_household
  on profiles(household_id)
  where is_self = true;

-- ---------------------------------------------------------------------------
-- 2. Drop old per-row "email = jwt.email" policies
-- ---------------------------------------------------------------------------
-- The original policy names (from 001) used double-quoted human-readable text.
drop policy if exists "Users can read own profile"            on profiles;
drop policy if exists "Users can read own reports"            on reports;
drop policy if exists "Users can read own report summaries"   on report_summary;
drop policy if exists "Users can read own savings products"   on savings_products;
drop policy if exists "Users can read own insurance products" on insurance_products;
drop policy if exists "Users can read own insurance coverages" on insurance_coverages;
drop policy if exists "Users can read own report insights"    on report_insights;
drop policy if exists "Users can read own processing queue"   on processing_queue;

-- ---------------------------------------------------------------------------
-- 3. Install household-scoped policies
--
-- All policies resolve "my household" through the self profile that matches
-- the JWT email. Postgres caches that subquery per statement, so cost is
-- bounded. If perf becomes an issue later, wrap in a `security definer`
-- function `auth_household_id()` and reference it instead.
-- ---------------------------------------------------------------------------

-- profiles: select + update own household members
create policy profiles_household_select on profiles for select
using (
  household_id = (
    select household_id from profiles
    where email = auth.jwt()->>'email' and is_self = true
    limit 1
  )
);

create policy profiles_household_update on profiles for update
using (
  household_id = (
    select household_id from profiles
    where email = auth.jwt()->>'email' and is_self = true
    limit 1
  )
);

-- reports: scoped via profile_id IN household
create policy reports_household_select on reports for select
using (
  profile_id in (
    select id from profiles
    where household_id = (
      select household_id from profiles
      where email = auth.jwt()->>'email' and is_self = true
      limit 1
    )
    and deleted_at is null
  )
);

-- report_summary: scoped via report_id -> profile -> household
create policy report_summary_household_select on report_summary for select
using (
  report_id in (
    select r.id from reports r
    join profiles p on p.id = r.profile_id
    where p.household_id = (
      select household_id from profiles
      where email = auth.jwt()->>'email' and is_self = true
      limit 1
    )
    and p.deleted_at is null
  )
);

-- savings_products: same join chain
create policy savings_products_household_select on savings_products for select
using (
  report_id in (
    select r.id from reports r
    join profiles p on p.id = r.profile_id
    where p.household_id = (
      select household_id from profiles
      where email = auth.jwt()->>'email' and is_self = true
      limit 1
    )
    and p.deleted_at is null
  )
);

-- insurance_products: same join chain
create policy insurance_products_household_select on insurance_products for select
using (
  report_id in (
    select r.id from reports r
    join profiles p on p.id = r.profile_id
    where p.household_id = (
      select household_id from profiles
      where email = auth.jwt()->>'email' and is_self = true
      limit 1
    )
    and p.deleted_at is null
  )
);

-- insurance_coverages: scoped via insurance_product -> report -> profile -> household
create policy insurance_coverages_household_select on insurance_coverages for select
using (
  insurance_product_id in (
    select ip.id from insurance_products ip
    join reports r on r.id = ip.report_id
    join profiles p on p.id = r.profile_id
    where p.household_id = (
      select household_id from profiles
      where email = auth.jwt()->>'email' and is_self = true
      limit 1
    )
    and p.deleted_at is null
  )
);

-- report_insights: scoped via report -> profile -> household
create policy report_insights_household_select on report_insights for select
using (
  report_id in (
    select r.id from reports r
    join profiles p on p.id = r.profile_id
    where p.household_id = (
      select household_id from profiles
      where email = auth.jwt()->>'email' and is_self = true
      limit 1
    )
    and p.deleted_at is null
  )
);

-- processing_queue: scoped via report -> profile -> household
create policy processing_queue_household_select on processing_queue for select
using (
  report_id in (
    select r.id from reports r
    join profiles p on p.id = r.profile_id
    where p.household_id = (
      select household_id from profiles
      where email = auth.jwt()->>'email' and is_self = true
      limit 1
    )
    and p.deleted_at is null
  )
);

-- ---------------------------------------------------------------------------
-- 4. Service-role full-access policies are unchanged (already in 001).
--    Backend admin client paths continue to bypass RLS via service_role.
-- ---------------------------------------------------------------------------
