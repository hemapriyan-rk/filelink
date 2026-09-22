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
   ban system (§8).

4. **Storage → New bucket**: name it exactly `droplink`, and leave it
   **private** (do not enable "Public bucket"). No further bucket
   configuration is needed — all access goes through signed URLs minted by
   the server.

5. Generate a `CRON_SECRET` (any long random value, e.g.
   `openssl rand -hex 32`) and set it in `.env.local` and later in Vercel.

6. (Optional) Set up the admin override code — see §8.

## 3. Environment variables

See `.env.example` for the full list with inline documentation. Summary:

**Client-safe** (prefixed `NEXT_PUBLIC_`, shipped to the browser):
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
`NEXT_PUBLIC_SITE_URL`.

**Server-only** (never shipped to the browser, never committed):
`SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET`, `ADMIN_TOTP_SECRET` (optional).

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

## 6. Admin override code, abuse bans, and multi-file uploads

**Admin override code.** Standard uploads are capped at
`MAX_FILE_SIZE_BYTES` (500 MB) and `MAX_EXPIRATION_MINUTES` (30 days). A
6-digit TOTP code — the same kind an authenticator app (Google
Authenticator, Authy, 1Password, etc.) generates, not a static password —
unlocks `MAX_FILE_SIZE_BYTES_ADMIN` (5 GB) and
`MAX_EXPIRATION_MINUTES_ADMIN` (1 year) for that upload. There is no admin
account or login — it's one shared secret (`ADMIN_TOTP_SECRET`) that you
add to an authenticator app once. To set it up:

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
settings, uploaded with limited concurrency. By default each file gets its
own independent share link — a batch of individual links, not one link
covering multiple files (a genuine "crate contains many files" schema
concept would be needed for that, and this version doesn't implement it).

Checking **"Bundle as one .zip"** (shown once 2+ files are queued) sidesteps
that limitation for the common case: the browser compresses all selected
files into a single ZIP, streamed straight into the compressor a chunk at
a time (`lib/zip.ts`, via `fflate`'s streaming API — never holding a whole
file's raw bytes and its compressed copy in memory at once, which matters
at the multi-GB sizes an admin code allows), and that one ZIP then goes
through the exact same single-file pipeline as anything else. One link,
one file server-side, no schema change. Compression genuinely shrinks
text/uncompressed data; it won't do much for already-compressed formats
like photos or video, which the checkbox's own helper text says plainly
rather than overpromising "saves space" for every file type.

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

The only client-side persistence this app does is remembering the visitor's
most recent upload result(s) so switching tabs or an accidental refresh
doesn't lose a share link/QR code they haven't copied yet. This is
implemented with `sessionStorage` (tab-scoped, cleared when the tab closes,
never transmitted to the server) rather than an actual HTTP cookie — a
real cookie would need to be sent to the server on every request for no
benefit here, since nothing server-side needs to read this state. A banner
(`components/ConsentBanner.tsx`) asks for consent before anything is
written; declining just means results don't survive a refresh, with no
other functional change.

## 9. Known limitations

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
- Multi-file uploads produce one independent link per file unless "Bundle
  as one .zip" is checked — see §6.
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

## 10. Security assumptions

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
