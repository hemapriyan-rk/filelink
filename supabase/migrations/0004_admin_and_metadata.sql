-- Two additions:
--
-- is_admin_upload: whether this file was created with a valid admin TOTP
-- code. Used to give admin-uploaded files a visually distinct download
-- page (recipients can tell it came through the elevated path) — it does
-- NOT by itself authorize "Keep Permanently"; that action re-verifies a
-- fresh admin code every time it's used, independent of how the file was
-- originally uploaded (see app/api/keep-permanent/[token]/route.ts).
--
-- uploader_ip: the IP address that created this row. Stored as metadata
-- only — never exposed to any client, never part of a storage path or
-- filename (see ARCHITECTURE.md for why: embedding an IP into a path is
-- an unnecessary PII exposure with no functional benefit, since the
-- storage path is already unguessable random data). Its purpose is
-- specifically what the brief's own Terms of Service points call for:
-- being able to preserve relevant evidence and respond to a valid legal
-- request, and to correlate abuse across files from the same source
-- beyond just the abuse_ips strike table.
alter table files add column if not exists is_admin_upload boolean not null default false;
alter table files add column if not exists uploader_ip text;
