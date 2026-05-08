-- HearMe — evidence chain-of-custody attestations
-- Stores per-session Ed25519 signature + OpenTimestamps receipt.
-- Run after evidence.sql.

begin;

create table if not exists public.evidence_signatures (
  session_id uuid primary key references public.evidence_sessions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  chain_hash text not null,
  signature text not null,
  public_key text not null,
  signed_at timestamptz not null,
  ots_calendar text,
  ots_receipt_base64 text,
  ots_submitted_at timestamptz,
  ots_upgraded_at timestamptz,
  ots_bitcoin_block bigint,
  created_at timestamptz not null default now()
);

create index if not exists evidence_signatures_user_idx
  on public.evidence_signatures(user_id);
create index if not exists evidence_signatures_chain_idx
  on public.evidence_signatures(chain_hash);

alter table public.evidence_signatures enable row level security;

drop policy if exists "evidence_signatures_select_own" on public.evidence_signatures;
create policy "evidence_signatures_select_own"
on public.evidence_signatures
for select to authenticated
using (auth.uid() = user_id);

drop policy if exists "evidence_signatures_insert_own" on public.evidence_signatures;
create policy "evidence_signatures_insert_own"
on public.evidence_signatures
for insert to authenticated
with check (auth.uid() = user_id);

drop policy if exists "evidence_signatures_update_own" on public.evidence_signatures;
create policy "evidence_signatures_update_own"
on public.evidence_signatures
for update to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

-- Public verification helper: anyone with the chain_hash + signature + pubkey
-- can verify off-server. We expose a read-only RPC that returns the trio for a
-- given session_id WITHOUT requiring auth, so external auditors can fetch.
create or replace function public.evidence_attestation(p_session uuid)
returns table (
  chain_hash text,
  signature text,
  public_key text,
  signed_at timestamptz,
  ots_calendar text,
  ots_receipt_base64 text,
  ots_bitcoin_block bigint
)
language sql
stable
security definer
as $$
  select chain_hash, signature, public_key, signed_at,
         ots_calendar, ots_receipt_base64, ots_bitcoin_block
  from public.evidence_signatures
  where session_id = p_session;
$$;

grant execute on function public.evidence_attestation(uuid) to anon, authenticated;

commit;
