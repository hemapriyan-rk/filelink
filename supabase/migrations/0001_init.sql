-- Droplink schema
-- One table models the entire file lifecycle. Public tokens are never stored
-- in plaintext (only their SHA-256 hash) so a database leak alone can never
-- produce a working download link. The storage path is a second, independent
-- random value, so the public token can never be used to derive or guess a
-- storage object path either.

create extension if not exists pgcrypto;

create table if not exists files (
  id                uuid primary key default gen_random_uuid(),

  -- sha256(hex) of the public share token. The raw token is only ever
  -- returned to the uploader once, at creation time, and is never persisted.
  token_hash        text not null unique,

  -- Object path inside the private "droplink" storage bucket, e.g.
  -- "temp/<random>" or "perm/<random>". Fully independent of token_hash and
  -- of the original filename, so neither can be used to locate the object.
  storage_path      text not null unique,

  original_filename text not null,
  mime_type         text not null,
  size_bytes        bigint not null check (size_bytes >= 0),

  created_at        timestamptz not null default now(),

  -- NULL once the file is permanent. For temporary files, the moment the
  -- link stops being valid. Set correctly at creation time (not a "draft"
  -- value patched in later).
  expires_at        timestamptz,

  is_permanent      boolean not null default false,

  -- pending: row created, upload to storage not yet confirmed.
  -- active:  confirmed and downloadable (subject to expiry / limit checks).
  -- deleted: logically and (best-effort) physically gone.
  status            text not null default 'pending'
                     check (status in ('pending', 'active', 'deleted')),

  download_count    integer not null default 0 check (download_count >= 0),
  max_downloads     integer check (max_downloads is null or max_downloads > 0)
);

-- Cleanup sweep: expired or limit-exhausted temporary files still marked active.
create index if not exists idx_files_cleanup_active
  on files (expires_at)
  where status = 'active' and is_permanent = false;

-- Cleanup sweep: abandoned uploads that never got confirmed.
create index if not exists idx_files_cleanup_pending
  on files (created_at)
  where status = 'pending';

-- No RLS policies are defined on purpose: RLS is enabled with a default-deny
-- posture, so anon/authenticated roles get zero access to this table under
-- any circumstance. Only the service_role key (server-side only, never sent
-- to the browser) can read or write it, since service_role bypasses RLS.
alter table files enable row level security;

-- Atomically validate + consume a single download against a token, in one
-- statement. Postgres serializes concurrent UPDATEs to the same row, so
-- under a max_downloads limit, only as many concurrent callers as remaining
-- slots can ever get a matching row back — this is what makes the
-- download-limit check race-free without any application-level locking.
create or replace function public.consume_download(p_token_hash text)
returns table (
  id                uuid,
  storage_path      text,
  original_filename text,
  mime_type         text,
  download_count    integer,
  max_downloads     integer,
  is_permanent      boolean
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  update files
  set download_count = files.download_count + 1
  where files.token_hash = p_token_hash
    and files.status = 'active'
    and (files.is_permanent or files.expires_at > now())
    and (files.max_downloads is null or files.download_count < files.max_downloads)
  returning files.id, files.storage_path, files.original_filename,
            files.mime_type, files.download_count, files.max_downloads,
            files.is_permanent;
end;
$$;

revoke all on function public.consume_download(text) from public, anon, authenticated;

-- Selects rows the cleanup sweep should act on: abandoned pending uploads
-- and active-but-no-longer-valid temporary files (expired or download-limit
-- exhausted). This needs to be a SQL function rather than a PostgREST
-- filter because "download_count >= max_downloads" compares two columns to
-- each other, which the query-string filter syntax cannot express.
-- previous_status lets the caller issue a guarded UPDATE (... WHERE status
-- = previous_status) so a row that changed state between the select and the
-- update (e.g. promoted to permanent) is safely skipped instead of
-- overwritten.
create or replace function public.cleanup_candidates(p_limit integer default 200)
returns table (
  id              uuid,
  storage_path    text,
  previous_status text
)
language sql
stable
security definer
set search_path = public
as $$
  (
    select id, storage_path, status as previous_status
    from files
    where status = 'pending' and created_at < now() - interval '1 hour'
    limit p_limit
  )
  union all
  (
    select id, storage_path, status as previous_status
    from files
    where status = 'active'
      and is_permanent = false
      and (
        (expires_at is not null and expires_at <= now())
        or (max_downloads is not null and download_count >= max_downloads)
      )
    limit p_limit
  );
$$;

revoke all on function public.cleanup_candidates(integer) from public, anon, authenticated;
