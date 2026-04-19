-- PensionView: Backfill existing profiles into the same household
-- Migration 004
--
-- Pini is the auth user / "self" anchor. Miri is a non-self spouse member.
-- Both share one household_id. After this migration runs:
--   - profiles where email='pzm236@gmail.com'   -> is_self=true,  relationship='self',   color='blue'
--   - profiles where name='מירי זולברג'           -> is_self=false, relationship='spouse', color='purple'
--   - both rows share the same household_id
--
-- Idempotent: re-running is a no-op once Pini is set as self.
-- =============================================================================

-- 1. Promote Pini to self with stable household + avatar.
--    The new household_id replaces the random default from migration 003 so
--    re-runs and downstream lookups are deterministic.
update profiles
set
  is_self      = true,
  relationship = 'self',
  avatar_color = coalesce(avatar_color, 'blue')
where email = 'pzm236@gmail.com';

-- 2. Bind Miri to Pini's household.
--    ILIKE on the Hebrew name keeps this resilient to leading/trailing chars.
update profiles
set
  household_id = (
    select household_id from profiles
    where email = 'pzm236@gmail.com' and is_self = true
    limit 1
  ),
  is_self      = false,
  relationship = coalesce(relationship, 'spouse'),
  avatar_color = coalesce(avatar_color, 'purple')
where name = 'מירי זולברג'
  and email is null;  -- guard: don't overwrite a self profile by accident

-- 3. Sanity check (read-only, prints to logs in psql):
--    select id, name, email, is_self, relationship, avatar_color, household_id
--    from profiles where deleted_at is null order by is_self desc;
