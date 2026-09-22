-- Abuse tracking for anonymous, per-IP escalating temporary bans.
--
-- Deliberately backed by Postgres rather than the in-memory limiter in
-- lib/ratelimit.ts: this app runs on Vercel serverless functions, which
-- have no shared memory across invocations and reset on every cold start.
-- An in-memory ban would be trivially bypassed (or just forgotten) within
-- seconds in production, so anything that actually needs to persist —
-- like "this IP is banned until 3pm" — has to live in the database we
-- already have, not a new service.

create table if not exists abuse_ips (
  ip                 text primary key,
  strikes            integer not null default 0,
  window_started_at  timestamptz not null default now(),
  ban_count          integer not null default 0,
  banned_until       timestamptz
);

alter table abuse_ips enable row level security;
-- No policies defined on purpose — same default-deny posture as `files`
-- (see 0001_init.sql). Only the service-role key can read or write this.

-- Atomically records one strike against an IP and, once the strike count
-- within the rolling window reaches the threshold, escalates it into a
-- temporary ban whose duration doubles with each repeat offense (capped).
-- This is a single UPDATE-driven statement specifically so concurrent
-- requests from the same abusive IP can't race past each other the way a
-- naive "read strikes, then write strikes+1" would.
create or replace function public.record_strike(
  p_ip text,
  p_strike_window_minutes integer,
  p_strike_threshold integer,
  p_base_ban_minutes integer,
  p_max_ban_minutes integer
)
returns table (banned boolean, banned_until timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row abuse_ips%rowtype;
  v_now timestamptz := now();
begin
  insert into abuse_ips (ip, strikes, window_started_at)
  values (p_ip, 1, v_now)
  on conflict (ip) do update
  set
    window_started_at = case
      when abuse_ips.window_started_at < v_now - make_interval(mins => p_strike_window_minutes)
        then v_now
      else abuse_ips.window_started_at
    end,
    strikes = case
      when abuse_ips.window_started_at < v_now - make_interval(mins => p_strike_window_minutes)
        then 1
      else abuse_ips.strikes + 1
    end
  returning * into v_row;

  if v_row.strikes >= p_strike_threshold then
    update abuse_ips
    set
      banned_until = v_now + least(
        make_interval(mins => p_base_ban_minutes * (2 ^ abuse_ips.ban_count)::integer),
        make_interval(mins => p_max_ban_minutes)
      ),
      ban_count = abuse_ips.ban_count + 1,
      strikes = 0
    where ip = p_ip
    returning * into v_row;

    return query select true, v_row.banned_until;
  end if;

  return query select false, v_row.banned_until;
end;
$$;

revoke all on function public.record_strike(text, integer, integer, integer, integer)
  from public, anon, authenticated;
