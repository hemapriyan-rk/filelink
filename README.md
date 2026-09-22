# Crate Link

Temporary (or permanent-on-request) file sharing for personal use. Upload a
file, get a short-lived link + QR code, share it. See `ARCHITECTURE.md` for
the full design rationale, data flow, and threat model.

## Stack

Next.js (App Router) + TypeScript + Tailwind CSS, deployed on Vercel.
Supabase Postgres (one table, two SQL functions) + Supabase Storage (one
private bucket). File bytes go directly between the browser and Supabase
Storage via short-lived signed URLs — never through the Vercel function.

## 1. Local setup

```bash
npm install
cp .env.example .env.local   # then fill it in, see §2 and §3 below
npm run dev                  # http://localhost:3000
```

## 2. Supabase project setup

You need a Supabase project (already created for this repo). From the
Supabase Dashboard:

1. **Project Settings → API**, copy:
   - `Project URL` → `NEXT_PUBLIC_SUPABASE_URL`
   - `anon` `public` key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role` `secret` key → `SUPABASE_SERVICE_ROLE_KEY` (server-only,
     never commit this, never prefix it `NEXT_PUBLIC_`)

2. **SQL Editor → New query**, paste the entire contents of
   `supabase/migrations/0001_init.sql`, and run it. This creates the
   `files` table, its indexes, and the `consume_download` /
   `cleanup_candidates` functions. It's written to be safe to re-run
   (`create ... if not exists` / `create or replace`).

3. **SQL Editor → New query** again, paste the contents of
   `supabase/migrations/0002_abuse.sql`, and run it. This adds the
   `abuse_ips` table and `record_strike` function backing the escalating
   ban system (§6).

4. **SQL Editor → New query** once more, paste the contents of
   `supabase/migrations/0003_capacity.sql`, and run it. This adds the
   `total_storage_used` function backing the storage-capacity gating (§6).

5. **SQL Editor → New query** one more time, paste the contents of
   `supabase/migrations/0004_admin_and_metadata.sql`, and run it. This adds
   the `is_admin_upload` and `uploader_ip` columns (§10).

6. **Storage → New bucket**: name it exactly `droplink`, and leave it
   **private** (do not enable "Public bucket"). No further bucket
   configuration is needed — all access goes through signed URLs minted by
   the server.

7. Generate a `CRON_SECRET` (any long random value, e.g.
   `openssl rand -hex 32`) and set it in `.env.local` and later in Vercel
   (and as a GitHub Actions repository secret of the same name — see §10).

8. (Optional) Set up the admin override code, and/or set
   `STORAGE_QUOTA_BYTES` to match your actual plan — see §6.

## 3. Environment variables

See `.env.example` for the full list with inline documentation. Summary:

**Client-safe** (prefixed `NEXT_PUBLIC_`, shipped to the browser):
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
`NEXT_PUBLIC_SITE_URL`.

**Server-only** (never shipped to the browser, never committed):
`SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET`, `ADMIN_TOTP_SECRET` (optional),
`STORAGE_QUOTA_BYTES` (optional, see §6).

## 4. Testing

```bash
npm test
```

Unit tests (`tests/unit/`) cover token generation/hashing, filename
sanitization, and rate limiting — no network required.

Integration tests (`tests/integration/`) run the full lifecycle
(upload → active → download, expiration, cleanup, keep-permanently,
invalid token, concurrent download-limit enforcement) and the abuse ban
escalation (§6) against your **real** Supabase project from §2. They auto-skip if `NEXT_PUBLIC_SUPABASE_URL` /
`SUPABASE_SERVICE_ROLE_KEY` aren't set, so `npm test` is always safe to run.
To actually execute them, make sure `.env.local` is filled in — Next.js
loads it automatically, but if you run `vitest` directly rather than
through a Next-aware runner, export the vars into your shell first, e.g.
`set -a; source .env.local; set +a; npm test` (bash) or load them via your
shell's usual mechanism on Windows.

They create and clean up their own rows/objects; they don't assume an
empty table and are safe to run against a project with real data in it.

## 5. Vercel deployment

1. Push this repo to GitHub (or your Git provider of choice) and import it
   in Vercel.
2. In **Project Settings → Environment Variables**, add the variables from
   §3 (both client-safe and server-only — Vercel keeps server-only ones
   out of the client bundle automatically based on the `NEXT_PUBLIC_`
   prefix convention Next.js uses at build time; `ADMIN_TOTP_SECRET` is
   optional, see §6). Set `NEXT_PUBLIC_SITE_URL` to your production URL
   (e.g. `https://cratelink.vercel.app`).
3. Deploy. `vercel.json` already declares the cleanup cron job.
4. **Cron frequency note:** Vercel's Hobby plan only allows daily cron
   triggers; `vercel.json` is set to run once a day
   (`0 3 * * *`). This does not weaken expiration — every download and
   every page load independently re-validates the token's expiry and
   download count regardless of whether cleanup has run (see
   `ARCHITECTURE.md` §8–9). It only affects how promptly deleted/expired
   objects are physically removed from storage. On a Pro plan, you can
   tighten the schedule (e.g. `*/15 * * * *`) with no other code changes.

## 6. Admin override code, storage capacity, abuse bans, and multi-file uploads

**Admin override code.** Standard uploads are capped at
`MAX_FILE_SIZE_BYTES` (500 MB) and `MAX_EXPIRATION_MINUTES` (30 days). A
6-digit TOTP code — the same kind an authenticator app (Google
Authenticator, Authy, 1Password, etc.) generates, not a static password —
unlocks up to `MAX_FILE_SIZE_BYTES_ADMIN` (5 GB) and
`MAX_EXPIRATION_MINUTES_ADMIN` (1 year) for that upload. "Up to" matters:
the code raises the *ceiling*, but the actual allowed size is also clamped
to whatever storage space is really left (quota minus current usage minus
a fixed safety margin — see the capacity section below), so an admin code
can never push an upload past physical reality. There is no admin account
or login — it's one shared secret (`ADMIN_TOTP_SECRET`) that you add to an
authenticator app once. To set it up:

1. Generate a base32 secret (`lib/totp.ts` exports `base32Encode` if you
   want to derive one from random bytes yourself, or use any TOTP secret
   generator).
2. Set `ADMIN_TOTP_SECRET` to that value in `.env.local` and in Vercel.
3. Add a manual TOTP entry to your authenticator app: issuer `CrateLink`,
   the same secret, 6 digits, 30 second period, SHA1.
4. In the upload form, click "Have an admin code?" and enter the current
   6-digit code from the app to unlock the higher limits for that batch.

If `ADMIN_TOTP_SECRET` is never set, the admin code field is simply never
accepted — every upload is held to the standard limits, no configuration
required.

**Storage capacity gating.** Supabase's free tier gives a small storage
quota (roughly 1 GB by default here; set `STORAGE_QUOTA_BYTES` to match
your actual plan). `GET /api/capacity` (`lib/capacity.ts`) reports how
full the bucket is as one of three states, computed from the sum of
`size_bytes` across every non-deleted row — there's no Management API
token available to ask Supabase directly, so this app tracks the one
number it actually controls:

- **ok** (below 85% of quota): everything works normally.
- **near_full** (85–97%): the upload form locks the expiration dropdown to
  the 10-minute option only, with a visible disclaimer explaining why —
  faster turnover means sooner cleanup means sooner free space. Enforced
  server-side too (`/api/upload/init` rejects any other expiration with a
  409 while near-full), not just hidden in the UI.
- **full** (97%+): new uploads are rejected outright (503) — the form
  shows a "Server Full" message instead, telling the visitor to check
  back later. Existing links, downloads, and "Recent links" (§8) still
  work; only *new* uploads are blocked. This applies even with a valid
  admin code — raising the ceiling doesn't help when there's no room left
  to raise into.

**Abuse bans.** Every rejected attempt to exceed the standard limits
without a valid admin code (oversized file, over-long expiration, a wrong
admin code, or repeatedly tripping the request-rate limiter) counts as a
strike against the requester's IP. Reaching `STRIKE_THRESHOLD` (5) strikes
within `STRIKE_WINDOW_MINUTES` (30) bans that IP for `BASE_BAN_MINUTES`
(1 hour), doubling on each repeat offense up to `MAX_BAN_MINUTES`
(24 hours). This is tracked in Postgres (`abuse_ips` table,
`supabase/migrations/0002_abuse.sql`), not in memory — an in-memory ban
would reset on every serverless cold start and provide essentially no real
protection. See `ARCHITECTURE.md` §14 for the full rationale.

**Multi-file uploads.** The upload form accepts up to `MAX_FILES_PER_BATCH`
(50) files at once, sharing one set of expiration/downloads/admin-code
settings, uploaded with limited concurrency. Clicking "Ship N files" with
2+ files queued doesn't upload immediately — it asks first: **"One QR code
(bundle as .zip)"** or **"Separate links (N QR codes)"**. A single file
skips this and ships immediately as before ("Ship it").

- **Separate links**: each file gets its own independent share link and
  token — a batch of individual links, not one link covering multiple
  files (a genuine "crate contains many files" schema concept would be
  needed for a true single-link bundle server-side, and this version
  doesn't implement that).
- **One QR code**: the browser compresses all selected files into a
  single ZIP, streamed straight into the compressor a chunk at a time
  (`lib/zip.ts`, via `fflate`'s streaming API — never holding a whole
  file's raw bytes and its compressed copy in memory at once, which
  matters at the multi-GB sizes an admin code allows), and that one ZIP
  then goes through the exact same single-file pipeline as anything else.
  One link, one file server-side, no schema change. Compression genuinely
  shrinks text/uncompressed data; it won't do much for already-compressed
  formats like photos or video, which the dialog's own helper text says
  plainly rather than overpromising "saves space" for every file type.

**Custom download limit.** The Downloads dropdown's presets (1/5/10/
Unlimited) now include "Custom…", revealing a number input validated
server-side between `MIN_DOWNLOADS_LIMIT` (1) and `MAX_DOWNLOADS_LIMIT`
(100,000) — the same pattern as the existing custom expiration input.

## 7. File stats

Both the uploader's result card and the recipient's `/f/[token]` page have
a small "Stats" toggle that fetches `GET /api/stats/[token]` on demand and
shows download count, downloads remaining, when the file was created, and
when it expires. This isn't a new privilege — anyone with the token can
already see the file's name and size on the download page, and the stats
endpoint applies the exact same validity check as everything else
(`lookupActiveFile`), so an expired or unknown token gets the same generic
"not found" there too. It's a separate small endpoint rather than baked
into the page load specifically so the numbers can be refreshed on demand
(download count changes as other people use the link) without a full page
reload.

## 8. Cookie consent & link persistence

Client-side persistence here is two things, both gated behind one consent
banner (`components/ConsentBanner.tsx`) and both implemented with browser
storage rather than an actual HTTP cookie — a real cookie would need to be
sent to the server on every request for no benefit here, since nothing
server-side needs to read either of these:

- **Last result, this tab** (`sessionStorage`): the visitor's most recent
  upload result(s), so switching tabs or an accidental refresh doesn't
  lose a share link/QR they haven't copied yet. Tab-scoped, cleared when
  the tab closes.
- **Recent links** (`localStorage`, `lib/history.ts`): up to the last 20
  results across visits to this browser — there's no "old QR codes" view
  otherwise, since there are no accounts to attach a real history to. The
  home page shows a "Recent links (N)" toggle when any exist, each with
  its own Copy Link / Show QR, plus a "Clear recent links" action.

Declining consent means neither is written; results simply don't survive
a refresh or a return visit, with no other functional change.

## 9. Keep Permanently is admin-only

"Keep Permanently" only ever appears for a file uploaded with a valid
admin code, and clicking it prompts for a fresh 6-digit code on the spot
— `POST /api/keep-permanent/[token]` independently verifies a valid admin
TOTP code on every call, regardless of how the file was originally
uploaded or what the UI shows. This closes a real gap the UI-only
approach would have left open: without a server-side check, anyone with
any share link could have called that endpoint directly and made any
file permanent. A code entered at upload time isn't reused for this later
action, since TOTP codes rotate every 30 seconds and are very likely
stale by the time someone clicks the button.

## 10. Storage organization, retention, and legal pages

**Where files live.** Objects are stored under
`temp/<yyyy>/<mm>/<dd>/<hh>/<random>` (moved to the equivalent `perm/...`
path when kept permanently) — organized by upload time purely for
operational tidiness as the bucket grows. The random suffix, not the
folder structure, is what makes a path unguessable; the date folders
carry no identifying information.

**What's tracked, and what isn't.** Each row also records the uploading
IP address and whether the upload used the admin override
(`uploader_ip`, `is_admin_upload` — see `supabase/migrations/0004_admin_and_metadata.sql`).
Neither is ever exposed to any client. The IP is **not** encoded into the
storage path or filename — doing that would be an unnecessary privacy
exposure (PII sitting in a path, potentially visible in logs) for no
functional benefit, since the path is already unguessable random data on
its own. It exists purely as metadata for abuse investigation and
responding to a valid legal request (see the Terms of Service).

**Deletion and retention.** File *content* is deleted from storage once
its link expires or is kept permanently reversed (§6's escalating cleanup
frequency via GitHub Actions — see below). The *database row* for a
deleted file is not removed; it's kept indefinitely (filename, size,
timestamps, uploader IP, download count — never the file content) for
abuse-prevention and legal-compliance purposes, which is stated plainly
in the Privacy Policy rather than promising a retention window the app
doesn't actually enforce.

**No backups.** This app deliberately does not back up uploaded files.
Backing up content that both the product's premise (temporary sharing)
and its storage-constrained free-tier quota (§6) argue for deleting
promptly would work against both goals at once, and would mean an
"expired" file secretly still existing somewhere — not what anyone
sharing through a temporary link would expect.

**Faster physical cleanup than Vercel's Cron allows.** Vercel's Hobby
plan only runs a Cron Job once a day (§5), which is fine for
*correctness* — every download and page load independently re-validates
expiry regardless of physical cleanup (`ARCHITECTURE.md` §8) — but leaves
expired files sitting in the small storage quota for up to a day.
`.github/workflows/cleanup.yml` calls the same authenticated
`/api/cron/cleanup` endpoint every 10 minutes via GitHub Actions instead,
at no extra cost or infrastructure — it's just a scheduled request to a
route that already exists and already enforces its own auth. To enable
it: add a repository secret named `CRON_SECRET` (Settings → Secrets and
variables → Actions → New repository secret) with the same value as the
`CRON_SECRET` env var. GitHub's own scheduled-workflow minimum is 5
minutes, and schedules can be delayed under platform load — still a large
improvement over once a day, not a guarantee of exact 10-minute cadence.

**Terms of Service and Privacy Policy** (`/terms`, `/privacy`) cover
content responsibility, prohibited use, a copyright/illegal-content
takedown procedure, the right to remove content, how legal requests and
evidence preservation are handled, what data is collected and why
(including the IP/metadata retention above), and the local-storage
consent mechanism from §8. **The contact email on both pages is a
placeholder (`REPLACE_WITH_CONTACT_EMAIL`)** — set it to a real address
before relying on these pages; a takedown or legal-request procedure that
points nowhere isn't a functioning one. These pages are drafted to cover
the specific points requested for this project and reflect this app's
actual behavior, but are not a substitute for review by a qualified
lawyer, particularly regarding the Indian IT Rules obligations they
reference.

## 11. Known limitations

- The upload rate limiter is in-memory per serverless instance (see
  `lib/ratelimit.ts`) — a reasonable speed bump for a personal tool, not a
  distributed rate limit. Documented tradeoff, not an oversight.
- Physical deletion can lag logical expiration by up to the cron interval
  (daily on Hobby). The link itself is invalid immediately either way.
- No virus/malware scanning of uploaded content — out of scope for a
  personal file-transfer tool between trusted devices/friends.
- `MAX_FILE_SIZE_BYTES` (`lib/constants.ts`, default 500 MB) is enforced
  by the app, but very large uploads are still bounded by your Supabase
  plan's storage limits and the browser's own upload reliability over
  the connection in use.
- Abuse bans are per-IP. Anyone sharing a NAT/public IP with someone who
  got banned (a household, an office, a mobile carrier's CGNAT) is banned
  along with them — a known tradeoff of IP-based limiting at this scale,
  not something worth a more complex identity system for a personal tool.
- The admin TOTP code has no separate rate limit of its own beyond the
  general strike system — a wrong code is a strike like any other
  violation, capped at `STRIKE_THRESHOLD` attempts before a ban, on top of
  the code itself rotating every 30 seconds.
- Multi-file uploads produce one independent link per file unless "One QR
  code" is chosen at ship time — see §6.
- Storage capacity gating (§6) is a soft, best-effort signal computed at
  request time, not an atomic reservation — two uploads racing right at
  the "full" boundary could both be admitted and briefly push usage
  slightly over quota. Acceptable for a personal-scale tool; not something
  worth a distributed-locking scheme here.
- "Recent links" (§8) is per-browser (`localStorage`), not synced anywhere
  — a different device or a cleared browser profile won't see it. It's a
  convenience for the one browser you actually uploaded from, not a real
  history service.
- ZIP bundling runs entirely in the browser; on lower-end devices or very
  large batches, compression takes real time and the tab does the work
  (off the main thread via a Web Worker, but still local CPU/memory) —
  there's no server-side fallback by design, since that would mean
  proxying file bytes through the Vercel function again, exactly what the
  direct-to-storage architecture exists to avoid (see `ARCHITECTURE.md` §2).
- The stats endpoint (§7) reveals download count to anyone with the share
  token — the same trust boundary as the download page itself, not a new
  exposure, but worth knowing if you'd rather a recipient not see how many
  times a link has been used.

## 12. Security assumptions

- The service-role key and `CRON_SECRET` are kept out of version control
  and out of the browser bundle; anyone who obtains either has full control
  of the app's data and should treat that as a credential leak requiring
  rotation.
- Anyone with a valid share link (or its QR code) can download that file —
  by design, this is how the app is meant to be used (share with friends).
  Don't post a share link somewhere you wouldn't want the file downloaded
  from.
- The 256-bit token space makes guessing infeasible, but it is not a
  substitute for keeping the link itself private if the file is sensitive.
