-- HearMe — community SOS mesh tables.
-- Beacons + helper replies, both publicly insertable but TTL-trimmed.

begin;

create table if not exists public.community_beacons (
  beacon_id text primary key,
  lat double precision not null,
  lon double precision not null,
  emitted_at timestamptz not null default now(),
  expires_at timestamptz not null,
  severity smallint not null default 1
);

create index if not exists community_beacons_expires_idx
  on public.community_beacons(expires_at);
create index if not exists community_beacons_emitted_idx
  on public.community_beacons(emitted_at desc);

create table if not exists public.community_helpers (
  id uuid primary key default gen_random_uuid(),
  beacon_id text not null references public.community_beacons(beacon_id) on delete cascade,
  helper_name text,
  eta_sec int,
  lat double precision not null,
  lon double precision not null,
  at timestamptz not null default now()
);

create index if not exists community_helpers_beacon_idx
  on public.community_helpers(beacon_id);

-- Enable RLS — anyone authenticated can insert / read mesh rows. Bound by
-- TTL so stale data doesn't accumulate.
alter table public.community_beacons enable row level security;
alter table public.community_helpers enable row level security;

drop policy if exists "mesh_beacons_read" on public.community_beacons;
create policy "mesh_beacons_read"
on public.community_beacons
for select to authenticated, anon
using (expires_at > now());

drop policy if exists "mesh_beacons_insert" on public.community_beacons;
create policy "mesh_beacons_insert"
on public.community_beacons
for insert to authenticated
with check (true);

drop policy if exists "mesh_helpers_read" on public.community_helpers;
create policy "mesh_helpers_read"
on public.community_helpers
for select to authenticated, anon
using (at > now() - interval '1 hour');

drop policy if exists "mesh_helpers_insert" on public.community_helpers;
create policy "mesh_helpers_insert"
on public.community_helpers
for insert to authenticated
with check (true);

-- Cleanup function — run periodically (cron / Edge Function) to delete
-- expired beacons and old helper replies.
create or replace function public.community_mesh_prune()
returns void language plpgsql as $$
begin
  delete from public.community_beacons where expires_at < now() - interval '5 minutes';
  delete from public.community_helpers where at < now() - interval '1 hour';
end;
$$;

commit;
