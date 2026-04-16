-- HearMe — cloud-synced evidence locker (FINAL VERSION)

begin;

-- Enable required extensions
create extension if not exists "pgcrypto";

-- =====================================================
-- 1) Sessions Table
-- =====================================================

create table if not exists public.evidence_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  start_time timestamptz not null,
  end_time timestamptz,
  trigger_type text not null,
  chain_hash text,
  item_count int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists evidence_sessions_user_idx 
on public.evidence_sessions(user_id);

create index if not exists evidence_sessions_start_idx 
on public.evidence_sessions(start_time desc);

-- =====================================================
-- 2) Items Table
-- =====================================================

create table if not exists public.evidence_items (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.evidence_sessions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  seq int not null,
  type text not null check (type in ('photo','audio','location','text')),
  text text,
  lat double precision,
  lon double precision,
  cloud_path text,
  content_hash text,
  chain_hash text,
  captured_at timestamptz not null,
  tags text[] not null default '{}'::text[],
  created_at timestamptz not null default now()
);

create index if not exists evidence_items_session_idx 
on public.evidence_items(session_id);

create index if not exists evidence_items_user_idx 
on public.evidence_items(user_id);

-- =====================================================
-- 3) Enable RLS
-- =====================================================

alter table public.evidence_sessions enable row level security;
alter table public.evidence_items enable row level security;

-- =====================================================
-- 4) RLS Policies (Sessions)
-- =====================================================

drop policy if exists "evidence_sessions_select_own" on public.evidence_sessions;
create policy "evidence_sessions_select_own"
on public.evidence_sessions
for select to authenticated
using (auth.uid() = user_id);

drop policy if exists "evidence_sessions_insert_own" on public.evidence_sessions;
create policy "evidence_sessions_insert_own"
on public.evidence_sessions
for insert to authenticated
with check (auth.uid() = user_id);

drop policy if exists "evidence_sessions_update_own" on public.evidence_sessions;
create policy "evidence_sessions_update_own"
on public.evidence_sessions
for update to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

-- =====================================================
-- 5) RLS Policies (Items)
-- =====================================================

drop policy if exists "evidence_items_select_own" on public.evidence_items;
create policy "evidence_items_select_own"
on public.evidence_items
for select to authenticated
using (auth.uid() = user_id);

drop policy if exists "evidence_items_insert_own" on public.evidence_items;
create policy "evidence_items_insert_own"
on public.evidence_items
for insert to authenticated
with check (auth.uid() = user_id);

drop policy if exists "evidence_items_update_own" on public.evidence_items;
create policy "evidence_items_update_own"
on public.evidence_items
for update to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

-- =====================================================
-- 6) Storage Bucket (PRIVATE)
-- =====================================================

insert into storage.buckets (id, name, public)
values ('hearme-evidence', 'hearme-evidence', false)
on conflict (id) do nothing;

-- IMPORTANT: Enable RLS for storage
alter table storage.objects enable row level security;

-- =====================================================
-- 7) Storage Policies (STRICT + IMMUTABLE)
-- =====================================================

-- Read own files only
drop policy if exists "evidence_owner_read" on storage.objects;
create policy "evidence_owner_read"
on storage.objects
for select to authenticated
using (
  bucket_id = 'hearme-evidence'
  and auth.uid()::text = (storage.foldername(name))[1]
);

-- Insert only into own folder
drop policy if exists "evidence_owner_insert" on storage.objects;
create policy "evidence_owner_insert"
on storage.objects
for insert to authenticated
with check (
  bucket_id = 'hearme-evidence'
  and auth.uid()::text = (storage.foldername(name))[1]
);

-- 🚫 No UPDATE / DELETE → immutable storage

commit;