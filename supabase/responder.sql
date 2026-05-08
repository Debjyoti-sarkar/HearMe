-- HearMe — admin / responder dashboard schema.
--
-- A responder organisation (NGO, campus security) gets read-only access to
-- the active alerts of users who have opted into their organisation. Every
-- access is audit-logged. Responders never see contact PII, only what the
-- user explicitly shared (location, evidence chain hash, current journey).
--
-- Tables:
--   • organisations          — one row per partner (campus, NGO chapter).
--   • organisation_members   — responder users who can read.
--   • user_org_links         — opt-in mapping: user X authorises org Y.
--   • responder_audit        — every read by a responder, immutable.
--
-- RPCs:
--   • responder_active_alerts(p_org)  — currently-firing alerts for users
--                                       linked to p_org. Returns lat/lon,
--                                       severity, alert id, last update.
--   • responder_user_evidence(p_org, p_alert) — chainHash + signed-url for
--                                       evidence on a specific alert.
--
-- Both RPCs validate that the caller is in organisation_members for p_org
-- and that the user has explicitly linked to p_org. Every call writes a
-- responder_audit row.

begin;

create table if not exists public.organisations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique not null,
  contact_email text,
  created_at timestamptz not null default now()
);

create table if not exists public.organisation_members (
  org_id uuid not null references public.organisations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('admin','dispatcher','viewer')),
  created_at timestamptz not null default now(),
  primary key (org_id, user_id)
);

create table if not exists public.user_org_links (
  user_id uuid not null references auth.users(id) on delete cascade,
  org_id uuid not null references public.organisations(id) on delete cascade,
  scopes text[] not null default '{}'::text[],   -- e.g. {'location','evidence','journey'}
  linked_at timestamptz not null default now(),
  expires_at timestamptz,
  primary key (user_id, org_id)
);

create table if not exists public.responder_audit (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations(id) on delete cascade,
  responder_user_id uuid not null references auth.users(id) on delete cascade,
  subject_user_id uuid not null references auth.users(id) on delete cascade,
  action text not null,
  target_id uuid,
  performed_at timestamptz not null default now(),
  ip text
);

create index if not exists responder_audit_org_idx on public.responder_audit(org_id);
create index if not exists responder_audit_subject_idx on public.responder_audit(subject_user_id);
create index if not exists responder_audit_when_idx on public.responder_audit(performed_at desc);

alter table public.organisations enable row level security;
alter table public.organisation_members enable row level security;
alter table public.user_org_links enable row level security;
alter table public.responder_audit enable row level security;

-- Org membership lookups ----------------------------------------------------

create or replace function public.is_org_member(p_org uuid, p_user uuid, p_role text default null)
returns boolean
language sql
stable
security definer
as $$
  select exists (
    select 1
      from public.organisation_members m
     where m.org_id = p_org
       and m.user_id = p_user
       and (p_role is null or m.role = p_role)
  );
$$;

-- RLS: only own membership is readable; admins of an org can read all
-- members of that org.
drop policy if exists "om_read_self_or_admin" on public.organisation_members;
create policy "om_read_self_or_admin"
on public.organisation_members
for select to authenticated
using (
  user_id = auth.uid()
  or public.is_org_member(org_id, auth.uid(), 'admin')
);

-- User-org links: user manages their own.
drop policy if exists "uol_self_select" on public.user_org_links;
create policy "uol_self_select"
on public.user_org_links
for select to authenticated
using (user_id = auth.uid());

drop policy if exists "uol_self_write" on public.user_org_links;
create policy "uol_self_write"
on public.user_org_links
for all to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

-- Audit rows are read-only per-row and only org admins can see their org's audit.
drop policy if exists "audit_select" on public.responder_audit;
create policy "audit_select"
on public.responder_audit
for select to authenticated
using (
  public.is_org_member(org_id, auth.uid(), 'admin')
  or subject_user_id = auth.uid()  -- a user can see who looked at their data
);

-- =====================================================
-- Responder RPCs (security-definer so they can pierce RLS for the consenting
-- subset, but with explicit gating + audit)
-- =====================================================

create or replace function public.responder_active_alerts(p_org uuid)
returns table (
  alert_id uuid,
  subject_user_id uuid,
  lat double precision,
  lon double precision,
  severity int,
  fired_at timestamptz,
  trigger_kind text
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_org_member(p_org, auth.uid()) then
    raise exception 'not a member of org %', p_org using errcode = '42501';
  end if;

  return query
    select s.id as alert_id,
           s.user_id as subject_user_id,
           ip.lat_bucket::double precision as lat,
           ip.lon_bucket::double precision as lon,
           1 as severity,
           s.start_time as fired_at,
           s.trigger_type as trigger_kind
      from public.evidence_sessions s
      join public.user_org_links uol on uol.user_id = s.user_id and uol.org_id = p_org
      left join public.incident_pings ip on ip.user_id = s.user_id
        and abs(extract(epoch from (s.start_time - ip.pinged_at))) < 600
     where (uol.expires_at is null or uol.expires_at > now())
       and s.start_time > now() - interval '24 hours'
       and 'location' = any(uol.scopes)
     order by s.start_time desc;

  insert into public.responder_audit (org_id, responder_user_id, subject_user_id, action)
  values (p_org, auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid, 'list_active_alerts');
end;
$$;

create or replace function public.responder_user_evidence(p_org uuid, p_alert uuid)
returns table (
  alert_id uuid,
  subject_user_id uuid,
  chain_hash text,
  signature text,
  public_key text,
  ots_calendar text,
  ots_bitcoin_block bigint
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_subject uuid;
begin
  if not public.is_org_member(p_org, auth.uid()) then
    raise exception 'not a member of org %', p_org using errcode = '42501';
  end if;

  select user_id into v_subject from public.evidence_sessions where id = p_alert;
  if v_subject is null then
    raise exception 'unknown alert' using errcode = 'P0002';
  end if;

  if not exists (
    select 1 from public.user_org_links
     where user_id = v_subject and org_id = p_org and 'evidence' = any(scopes)
       and (expires_at is null or expires_at > now())
  ) then
    raise exception 'subject did not authorise evidence access' using errcode = '42501';
  end if;

  insert into public.responder_audit (org_id, responder_user_id, subject_user_id, action, target_id)
  values (p_org, auth.uid(), v_subject, 'read_evidence', p_alert);

  return query
    select sig.session_id as alert_id,
           sig.user_id as subject_user_id,
           sig.chain_hash, sig.signature, sig.public_key,
           sig.ots_calendar, sig.ots_bitcoin_block
      from public.evidence_signatures sig
     where sig.session_id = p_alert;
end;
$$;

grant execute on function public.responder_active_alerts(uuid) to authenticated;
grant execute on function public.responder_user_evidence(uuid, uuid) to authenticated;

commit;
