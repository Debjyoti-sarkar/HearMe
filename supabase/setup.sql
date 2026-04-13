-- HearMe production setup
-- Run this once in Supabase SQL Editor.

begin;

-- 1) Profiles table
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text,
  age int check (age is null or age > 0),
  dob date,
  phone text,
  email text,
  location text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists profiles_email_idx on public.profiles(email);

-- 2) Emergency logs table
create table if not exists public.emergency_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  location text not null,
  created_at timestamptz not null default now()
);

create index if not exists emergency_logs_user_id_idx on public.emergency_logs(user_id);
create index if not exists emergency_logs_created_at_idx on public.emergency_logs(created_at desc);

-- 3) Updated-at trigger helper
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_profiles_updated_at on public.profiles;
create trigger trg_profiles_updated_at
before update on public.profiles
for each row
execute function public.set_updated_at();

-- 4) RLS enable
alter table public.profiles enable row level security;
alter table public.emergency_logs enable row level security;

-- 5) RLS policies (profiles)
drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
on public.profiles
for select
to authenticated
using (auth.uid() = id);

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own"
on public.profiles
for insert
to authenticated
with check (auth.uid() = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
on public.profiles
for update
to authenticated
using (auth.uid() = id)
with check (auth.uid() = id);

-- 6) RLS policies (emergency logs)
drop policy if exists "emergency_select_own" on public.emergency_logs;
create policy "emergency_select_own"
on public.emergency_logs
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "emergency_insert_own" on public.emergency_logs;
create policy "emergency_insert_own"
on public.emergency_logs
for insert
to authenticated
with check (auth.uid() = user_id);

-- 7) Storage bucket + policies for avatars
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

drop policy if exists "avatars_public_read" on storage.objects;
create policy "avatars_public_read"
on storage.objects
for select
to public
using (bucket_id = 'avatars');

drop policy if exists "avatars_insert_own" on storage.objects;
create policy "avatars_insert_own"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'avatars'
  and auth.uid()::text = (storage.foldername(name))[1]
);

drop policy if exists "avatars_update_own" on storage.objects;
create policy "avatars_update_own"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'avatars'
  and auth.uid()::text = (storage.foldername(name))[1]
)
with check (
  bucket_id = 'avatars'
  and auth.uid()::text = (storage.foldername(name))[1]
);

commit;
