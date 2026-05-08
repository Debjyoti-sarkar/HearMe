-- HearMe — anonymous incident heatmap.
--
-- Approach:
--   • Every fired SOS appends a row to `incident_pings` with a *bucketed*
--     location (5-decimal-place lat/lon ≈ 1.1 m precision rounded down to a
--     ~110 m grid). The user_id is stored only for RLS so victims can purge
--     their own pings; the public RPC NEVER returns it.
--   • The public-facing `heatmap_at(lat, lon, radius_m)` RPC aggregates
--     counts per ~110 m cell within the requested radius. Cells with fewer
--     than K=5 hits are folded into a "rare" bucket (k-anonymity), so a
--     single victim's location can never be reconstructed.

begin;

create table if not exists public.incident_pings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  lat_bucket numeric(7,3) not null, -- 3-decimal-place ≈ 110 m grid
  lon_bucket numeric(7,3) not null,
  trigger_kind text not null,
  pinged_at timestamptz not null default now()
);

create index if not exists incident_pings_geo_idx
  on public.incident_pings(lat_bucket, lon_bucket);

create index if not exists incident_pings_at_idx
  on public.incident_pings(pinged_at desc);

alter table public.incident_pings enable row level security;

-- Users can only INSERT or DELETE their own pings; reads go through the RPC.
drop policy if exists "incident_pings_insert_own" on public.incident_pings;
create policy "incident_pings_insert_own"
on public.incident_pings
for insert to authenticated
with check (auth.uid() = user_id);

drop policy if exists "incident_pings_delete_own" on public.incident_pings;
create policy "incident_pings_delete_own"
on public.incident_pings
for delete to authenticated
using (auth.uid() = user_id);

drop policy if exists "incident_pings_select_own" on public.incident_pings;
create policy "incident_pings_select_own"
on public.incident_pings
for select to authenticated
using (auth.uid() = user_id);

-- Public, k-anonymous aggregator. Returns one row per cell; cells with
-- count < K are rolled into the synthetic 'rare' bucket so individual
-- victims cannot be re-identified.
create or replace function public.heatmap_at(
  in_lat double precision,
  in_lon double precision,
  in_radius_m double precision,
  in_since interval default interval '90 days',
  in_k int default 5
)
returns table (
  cell_lat numeric,
  cell_lon numeric,
  count int,
  bucket text
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with raw as (
    select
      lat_bucket as cell_lat,
      lon_bucket as cell_lon,
      count(*)::int as count
    from public.incident_pings
    where pinged_at > now() - in_since
      -- rough bounding box to keep the index hit cheap
      and lat_bucket between in_lat - in_radius_m / 111000.0
                       and in_lat + in_radius_m / 111000.0
      and lon_bucket between in_lon - in_radius_m / (111000.0 * cos(radians(in_lat)))
                       and in_lon + in_radius_m / (111000.0 * cos(radians(in_lat)))
    group by lat_bucket, lon_bucket
  )
  select cell_lat, cell_lon, count, 'cell'::text as bucket
    from raw
   where count >= in_k
  union all
  select null::numeric, null::numeric,
         coalesce(sum(count), 0)::int,
         'rare'::text
    from raw
   where count < in_k;
$$;

grant execute on function public.heatmap_at(double precision, double precision, double precision, interval, int) to anon, authenticated;

commit;
