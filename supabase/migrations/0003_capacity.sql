-- Total bytes currently occupied in the storage bucket, used to gate
-- uploads as the (small, free-tier) Supabase storage quota fills up.
--
-- There's no Management API token available to this app (only the
-- project's own anon/service-role keys), so there's no direct way to ask
-- Supabase "how much storage am I actually using". Instead this sums
-- size_bytes across every row that isn't deleted — accurate as long as
-- this bucket is only ever written to by this app, which it is.
create or replace function public.total_storage_used()
returns bigint
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(size_bytes), 0)::bigint from files where status != 'deleted';
$$;

revoke all on function public.total_storage_used() from public, anon, authenticated;
