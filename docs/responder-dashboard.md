# HearMe — Responder Dashboard architecture

A web dashboard for vetted partner organisations (NGO chapters, campus
security, women's-safety help-lines) that lets dispatchers see currently-
firing alerts from users who have explicitly opted in, accept the call,
and access evidence — with every read audit-logged.

This document is the architecture spec for the dashboard side. The
in-app, Supabase, and chain-of-custody pieces are already in this repo;
the dashboard itself is a separate Next.js / SvelteKit project that talks
to the same Supabase project via the RPCs defined in
`supabase/responder.sql`.

---

## Threat model

- **Privacy-by-default**: a responder NEVER sees a user's data unless that
  user explicitly linked themselves to the responder's org and granted
  the relevant scope (`location`, `evidence`, `journey`).
- **Auditability**: every read by every responder is written to
  `responder_audit`. The user can query "who looked at me?" themselves
  via the existing select policy.
- **Least privilege**: responders only get `viewer`, `dispatcher`, or
  `admin` roles. RLS gates membership reads. RPCs enforce the role +
  scope check before returning rows.
- **Bitcoin-anchored evidence**: the dashboard never *holds* evidence
  bytes. It serves a chain-hash + Ed25519 signature + OTS receipt; the
  dispatcher verifies authenticity off-server and downloads bytes via
  signed URLs that expire in minutes.

---

## Data flow

```
                           ┌─────────────────────────┐
                           │   user opts in to org   │
   in-app screen ─────────►│  user_org_links row     │
                           │  scopes: [location, …]  │
                           └────────────┬────────────┘
                                        │
                                        ▼
                          (RLS lets the user manage)
                                        │
                          ┌─────────────┴─────────────┐
                          │   user fires SOS          │
                          ▼                           ▼
                  evidence_sessions             incident_pings
                  (chain-of-custody)            (k-anon bucketed)
                          │                           │
                          └─────────────┬─────────────┘
                                        │
                                        ▼
                       responder_active_alerts(p_org)
                                        │
                              admin / dispatcher
                                        │
                                        ▼
                       responder_user_evidence(p_org, p_alert)
                                        │
                                        ▼
                              audit row written
```

---

## RPC surface

Defined in `supabase/responder.sql`:

- `responder_active_alerts(p_org uuid) → setof active_alert`
  - Asserts caller ∈ `organisation_members(p_org)`.
  - Returns alert_id, subject_user_id, lat/lon (bucketed if user only
    granted `location` scope, exact if `journey`), severity, fired_at,
    trigger_kind.
  - Audit row written.

- `responder_user_evidence(p_org uuid, p_alert uuid) → setof attestation`
  - Asserts caller ∈ org AND subject's `user_org_links.scopes`
    contains `evidence`.
  - Returns chain_hash, signature, public_key, OTS receipt fields.
  - Audit row written.
  - Dashboard then calls
    `supabase.storage.from('hearme-evidence').createSignedUrl(...)` for
    each linked item.

Future:
- `responder_dispatch_acknowledged(p_alert)` — dispatcher records "we
  see it, help is moving". Triggers a `band-feedback ackHelperOnTheWay`
  in the user's app via realtime.
- `responder_close_alert(p_alert, p_outcome)` — closes the active alert
  with an outcome code (resolved, false-alarm, lost-contact).

---

## Dashboard surface

A Next.js app deployed at e.g. `responders.hearme.app`. Auth via the
same Supabase Auth (admins invite responders with magic-link).

Pages:

1. **Live map**
   - Calls `responder_active_alerts(p_org)` every 5 s; subscribes to
     `evidence_sessions` realtime INSERTs scoped to org.
   - Marker per alert with severity colour. Click → side-panel with
     subject_user (anon id), trigger_kind, evidence chain_hash, "Open
     evidence" button.

2. **Evidence viewer**
   - Calls `responder_user_evidence(p_org, p_alert)`, then hashes the
     downloaded media and verifies the chain locally. Bad chain → red
     banner, evidence considered tampered.
   - Verifies the Ed25519 signature against the public key on file for
     the user's device (`evidence_signatures.public_key`). Mismatch →
     red banner.
   - Verifies the OTS receipt against the public Bitcoin block index.

3. **Audit log**
   - Read-only table backed by `responder_audit`, filterable by
     responder, subject, date.
   - Org admins can export CSV for compliance reviews.

4. **Org admin**
   - Invite / revoke members.
   - Set per-member role.
   - Inspect users currently linked to the org and the scopes they've
     granted.

---

## Privacy guarantees the dashboard must surface

- Show "you can see this user because they linked to you on
  `<linked_at>` with scopes `<scopes>`". Never hide consent.
- Show the audit count — "your org has performed N reads on this
  user's data" — so the user can see if a responder is over-reading.
- Provide a `revoke` button that calls a Supabase RPC the user has set
  on their account to clear `user_org_links`.

---

## Deployment notes

- Use a separate Supabase Auth audience for responders (`aud: responder`)
  so a leak of dashboard creds doesn't grant in-app user privileges.
- Lock `evidence_signatures` reads through the RPC only — direct
  selects bypass auditing.
- All RPC functions are `security definer`. Make sure their owner is a
  role with the minimum privileges required (`hearme_responder_role`).
- Rotate signing keys for any user whose phone is reported lost — the
  dashboard surfaces "verify with public key v1 only".

---

## Files

- `supabase/responder.sql` — schema + RPC surface (in this repo).
- `responders/` — separate dashboard project (NOT in this repo;
  expected layout: Next.js 15 + tailwindcss + supabase-ssr + maplibre).
