# Droplink

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

3. **Storage → New bucket**: name it exactly `droplink`, and leave it
   **private** (do not enable "Public bucket"). No further bucket
   configuration is needed — all access goes through signed URLs minted by
   the server.

4. Generate a `CRON_SECRET` (any long random value, e.g.
   `openssl rand -hex 32`) and set it in `.env.local` and later in Vercel.

## 3. Environment variables

See `.env.example` for the full list with inline documentation. Summary:

**Client-safe** (prefixed `NEXT_PUBLIC_`, shipped to the browser):
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
`NEXT_PUBLIC_SITE_URL`.

**Server-only** (never shipped to the browser, never committed):
`SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET`.

## 4. Testing

```bash
npm test
```

Unit tests (`tests/unit/`) cover token generation/hashing, filename
sanitization, and rate limiting — no network required.

Integration tests (`tests/integration/`) run the full lifecycle
(upload → active → download, expiration, cleanup, keep-permanently,
invalid token, concurrent download-limit enforcement) against your **real**
Supabase project from §2. They auto-skip if `NEXT_PUBLIC_SUPABASE_URL` /
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
2. In **Project Settings → Environment Variables**, add all five variables
   from §3 (both client-safe and server-only — Vercel keeps server-only
   ones out of the client bundle automatically based on the
   `NEXT_PUBLIC_` prefix convention Next.js uses at build time). Set
   `NEXT_PUBLIC_SITE_URL` to your production URL (e.g.
   `https://filelink.vercel.app`).
3. Deploy. `vercel.json` already declares the cleanup cron job.
4. **Cron frequency note:** Vercel's Hobby plan only allows daily cron
   triggers; `vercel.json` is set to run once a day
   (`0 3 * * *`). This does not weaken expiration — every download and
   every page load independently re-validates the token's expiry and
   download count regardless of whether cleanup has run (see
   `ARCHITECTURE.md` §8–9). It only affects how promptly deleted/expired
   objects are physically removed from storage. On a Pro plan, you can
   tighten the schedule (e.g. `*/15 * * * *`) with no other code changes.

## 6. Known limitations

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

## 7. Security assumptions

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
