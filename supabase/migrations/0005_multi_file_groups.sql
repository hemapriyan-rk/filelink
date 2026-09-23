-- Lets multiple `files` rows share one public token, so a single link/QR
-- can resolve to several files the recipient browses and downloads
-- individually — a real alternative to the client-side ZIP bundle (§16
-- of ARCHITECTURE.md), for people who'd rather the recipient pick what
-- they want than force everything into one archive.
--
-- The only schema change needed: token_hash stops being globally unique.
-- Uniqueness of the token itself was always guaranteed by 256 bits of
-- CSPRNG entropy (lib/token.ts), not by this constraint — the constraint
-- existed for query-plan/index purposes, which a plain (non-unique) index
-- still provides. Nothing else about the security model changes: a
-- "crate" is just N rows that happen to carry the same token_hash: same
-- hashed-not-raw storage, same default-deny RLS, same per-row atomic
-- download-limit enforcement (see consume_download_by_id below).
alter table files drop constraint if exists files_token_hash_key;
create index if not exists idx_files_token_hash on files (token_hash);

-- Same atomic validate-and-increment as consume_download, scoped to one
-- specific row within a token's group by id — necessary once a token can
-- match more than one row, so downloading File A in a crate doesn't touch
-- File B's independent download_count/max_downloads.
create or replace function public.consume_download_by_id(p_token_hash text, p_file_id uuid)
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
    and files.id = p_file_id
    and files.status = 'active'
    and (files.is_permanent or files.expires_at > now())
    and (files.max_downloads is null or files.download_count < files.max_downloads)
  returning files.id, files.storage_path, files.original_filename,
            files.mime_type, files.download_count, files.max_downloads,
            files.is_permanent;
end;
$$;

revoke all on function public.consume_download_by_id(text, uuid) from public, anon, authenticated;
