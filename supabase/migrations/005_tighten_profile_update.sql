-- PensionView: Tighten profile UPDATE policy
-- Migration 005
--
-- Background: migration 003 installed `profiles_household_update`, which
-- allowed any household member to update ANY other member's row via the
-- anon-key client (browser). That includes sensitive columns like
-- `national_id` (encrypted PII) and `google_refresh_token` (Gmail OAuth).
--
-- Fix: replace with a self-only policy. Each auth user can only update
-- their own self profile row through RLS. Cross-member writes must go
-- through the service-role API endpoints (/api/members/*), which already
-- gate by household ownership and validate input.
--
-- Note: column-level restrictions are not expressed in the policy; the
-- service-role API is the single source of truth for which columns the
-- frontend can touch on non-self rows. For the self row, the user owns
-- their own data — letting them mutate their own national_id / DOB is
-- acceptable.
-- =============================================================================

-- Drop the over-permissive update policy from migration 003.
drop policy if exists profiles_household_update on profiles;

-- Self-only update policy. The is_self check on the subject row prevents
-- one household member from overwriting another's data via the anon client.
-- WITH CHECK mirrors USING so updates can't move a row out of the
-- self-and-matching-email predicate.
create policy profiles_self_only_update on profiles for update
using (
  is_self = true
  and email = auth.jwt()->>'email'
)
with check (
  is_self = true
  and email = auth.jwt()->>'email'
);

-- Other household members remain mutable via the service-role client used
-- by /api/members/* routes; those routes enforce household ownership.
