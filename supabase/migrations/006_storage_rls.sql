-- PensionView: Storage RLS for the `reports` bucket
-- Migration 006
--
-- Background: the `reports` Supabase storage bucket previously had no
-- object-level RLS. Anyone holding an object key — or able to guess one —
-- could read it via the anon key. The bucket is private at the bucket
-- level today (no public listing), but we want defence-in-depth so that
-- even an authenticated user can only fetch files belonging to their
-- own household.
--
-- Path convention (set by /api/pipeline/decrypt and /api/pipeline/extract):
--   reports/{profile_id}/{report_date}/decrypted.pdf
--   reports/{profile_id}/extractions/{report_id}/page_{n}.json
--
-- storage.foldername(name) returns the path as a text[] of folder
-- segments; index [1] is "reports", index [2] is the profile_id.
--
-- Writes are restricted to service_role — only the pipeline (admin
-- client) ever creates or mutates objects in this bucket. No anon /
-- authenticated client should be performing direct uploads.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Helper: current_household_id()
--
-- Resolves the caller's household via the JWT email claim → self profile.
-- Marked SECURITY DEFINER so it can read profiles even when the caller
-- has no SELECT grant on the table directly (storage policies run as the
-- caller, but the helper escalates safely because it returns just one uuid
-- with a fixed predicate).
--
-- SET search_path locks the lookup to the public schema so a hostile
-- search_path injection cannot redirect the query to a shadow table.
-- ---------------------------------------------------------------------------
create or replace function public.current_household_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select household_id
  from public.profiles
  where email = auth.jwt()->>'email'
    and is_self = true
  limit 1
$$;

revoke all on function public.current_household_id() from public;
grant execute on function public.current_household_id() to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. Read policy: scope to caller's household.
--
-- (storage.foldername(name))[2] is the profile_id segment of the object
-- path. We compare it (as text) to the IDs of all live profiles in the
-- caller's household. deleted_at IS NULL keeps archived members'
-- objects out of reach via the anon client.
-- ---------------------------------------------------------------------------
drop policy if exists "Storage reports household read" on storage.objects;
create policy "Storage reports household read" on storage.objects for select
to authenticated
using (
  bucket_id = 'reports'
  and (storage.foldername(name))[2] in (
    select id::text from public.profiles
    where household_id = public.current_household_id()
      and deleted_at is null
  )
);

-- ---------------------------------------------------------------------------
-- 3. Write policies: service_role only.
--
-- The pipeline runs through the admin (service_role) client, which bypasses
-- RLS entirely — these policies are belt-and-braces for the rare path that
-- routes through PostgREST with the service key explicitly. Frontend
-- (anon / authenticated) clients are never expected to write to the
-- `reports` bucket, so no insert/update/delete policy is granted to them.
-- ---------------------------------------------------------------------------
drop policy if exists "Storage reports service write" on storage.objects;
create policy "Storage reports service write" on storage.objects for insert
to service_role
with check (bucket_id = 'reports');

drop policy if exists "Storage reports service update" on storage.objects;
create policy "Storage reports service update" on storage.objects for update
to service_role
using (bucket_id = 'reports');

drop policy if exists "Storage reports service delete" on storage.objects;
create policy "Storage reports service delete" on storage.objects for delete
to service_role
using (bucket_id = 'reports');
