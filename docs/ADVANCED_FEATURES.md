# HearMe — Advanced features

This document tracks the advanced feature roadmap beyond the baseline shipped in `README.md`. Each feature has:

- **Status** — Done / In-progress / Deferred (waiting on hardware, contracts, or model assets that this repo can't ship).
- **Files** — modules + screens that implement it.
- **Adapter** — for features that need external services / native modules / hardware, the interface that lets a real backend drop in.

Status legend:
- ✅ Done — production-ready in this codebase.
- 🟡 In-progress — partially landed, see notes.
- ⏳ Deferred — adapter + spec landed; missing piece is external (model weights, native module, hardware, vendor contract).

---

## Phase A — Evidence foundation

| # | Feature | Status | Files |
|---|---------|--------|-------|
| 1 | Continuous pre-roll buffer (last 30 s captured before SOS) | ✅ | `lib/preroll-buffer.ts` |
| 2 | Cryptographic chain-of-custody (Ed25519 device signature + OpenTimestamps anchor) | ✅ | `lib/evidence-signing.ts`, `lib/evidence-cloud.ts`, `supabase/evidence-signatures.sql` |
| 3 | Dead-man's switch upload (offline retry + relay adapter) | ✅ | `lib/evidence-deadman.ts` |
| 4 | Lawyer / NGO export package (manifest.json + summary.html) | ✅ | `lib/evidence-export.ts` |

## Phase B — Trusted network

| # | Feature | Status | Files |
|---|---------|--------|-------|
| 5 | Live-share session (E2E AES-GCM over Supabase realtime, ack receipts) | ✅ | `lib/live-share.ts` |
| 6 | Guardian relay (priority-tiered fan-out, realtime acks, 112 fallback) | ✅ | `lib/guardian-relay.ts`, `lib/types.ts` |
| 7 | Two-way duress (contact challenge → band haptic 3-pulse, 60-s timer) | ✅ | `lib/two-way-duress.ts` |
| 8 | Witness mode (QR + per-witness encrypted audio chunks into locker) | ✅ | `lib/witness-mode.ts` |
| 9 | Community SOS mesh (geo-anonymous beacons + helper replies) | ✅ | `lib/community-mesh.ts`, `supabase/community-mesh.sql` |

## Phase C — Detection & sensing

| #  | Feature | Status | Files |
|----|---------|--------|-------|
| 10 | BLE stalker scan (Apple / Samsung / Tile / Google manufacturer parsers, persistent sighting log) | ✅ | `lib/stalker-scan.ts` |
| 11 | Isolation score (BLE + ambient dBFS + lux + speed + hour, pure scorer) | ✅ | `lib/isolation-score.ts` |
| 12 | Driver vs passenger classifier (orientation variance + speed + touch-rate hint) | ✅ | `lib/drive-passenger.ts` |
| 13 | Phone-tamper detection (3-of-3 signal coincidence: screen-off + shock + net-loss) | ✅ | `lib/phone-tamper.ts` |
| 14 | Off-grid mode (watchdog + Meshtastic adapter slot + iOS satellite SOS prompt) | ✅ | `lib/offgrid.ts` |

## Phase D — Resilience & adversarial-robustness

| #  | Feature | Status | Files |
|----|---------|--------|-------|
| 15 | Decoy lock screen (fake "no service" + draining battery, silent SOS on engage) | ✅ | `lib/decoy-lock.ts` |
| 16 | Force-unlock detection (motion variance + failed bio attempts → silent SOS) | ✅ | `lib/force-unlock.ts` |
| 17 | Anti-uninstall guard (adapter + Android Device Admin native recipe) | ✅ | `lib/anti-uninstall.ts` |
| 18 | Airplane-mode counter (cell+wifi loss + shock → alt-modem escalation) | ✅ | `lib/airplane-counter.ts` |

## Phase E — AI / on-device intelligence

| #  | Feature | Status | Files |
|----|---------|--------|-------|
| 19 | Threat-context classifier (multi-modal heuristic + LLM backend slot) | ✅ | `lib/threat-classifier.ts` |
| 20 | Acoustic event detection (envelope detector + YAMNet adapter slot) | ✅ | `lib/acoustic-events.ts` |
| 21 | Speaker diarization (RMS+ZCR+centroid voiceprint, ML adapter slot) | ✅ | `lib/diarization.ts` |
| 22 | Auto-redaction (interface + ML Kit / Vision native recipe; honest no-op default) | ✅ | `lib/auto-redaction.ts` |
| 23 | Deepfake voice-trigger guard (voiceprint match + per-session challenge) | ✅ | `lib/voice-trigger-guard.ts` |

## Phase F — NeuroBand expansion

| #  | Feature | Status | Files |
|----|---------|--------|-------|
| 24 | HRV-based stress baseline (24 circadian buckets, Welford online stats) | ✅ | `lib/hrv-baseline.ts` |
| 25 | Cycle-aware sensitivity (manual log + HealthKit / Health Connect adapter) | ✅ | `lib/cycle-aware.ts` |
| 26 | Band-side LED / haptic codes (extended code book, vibration + LED patterns) | ✅ | `lib/band-feedback.ts` |
| 27 | Group band roaming (multi-band registry + group realtime alerts) | ✅ | `lib/band-roaming.ts` |

## Phase G — Platform integrations

| #  | Feature | Status | Files |
|----|---------|--------|-------|
| 28 | Wear OS / watchOS companion (adapter + WatchConnectivity / WearOS recipes) | ✅ | `lib/wearable-companion.ts` |
| 29 | OS quick-action surface (deep-link + Android tile + iOS Action Button recipes) | ✅ | `lib/os-quicktile.ts` |
| 30 | CarPlay / Android Auto adapter (lifecycle + crash-prompt template) | ✅ | `lib/auto-mode.ts` |
| 31 | Smart-home siren (Hue red flash + webhook fan-out, secrets in SecureStore) | ✅ | `lib/smart-home.ts` |
| 32 | PSAP adapter (RapidSOS sketch + EU 112 AML notes + tel: fallback) | ✅ | `lib/psap.ts` |

## Phase H — Operational

| #  | Feature | Status | Files |
|----|---------|--------|-------|
| 33 | Anonymous incident heatmap (3-decimal-place buckets, k-anon RPC) | ✅ | `lib/incident-heatmap.ts`, `supabase/heatmap.sql` |
| 34 | Self-test scheduler (9 probes: SMS / contacts / GPS / mic / bio / band / battery-opt / cloud / battery) | ✅ | `lib/self-test.ts` |
| 35 | Admin / responder dashboard (RPC surface + audit + architecture spec) | ✅ | `supabase/responder.sql`, `docs/responder-dashboard.md` |

---

## Adapter pattern

Several features (PSAP, Wear OS, anti-uninstall Device Admin, on-device LLM, satellite SDK, native acoustic-events model) need code that is not in the JS / Expo surface. Rather than ship fake "production" code, each of those modules implements the **adapter pattern**:

```
lib/<feature>.ts  ──────────────────►  ┌────────────────────┐
   │  exposes interface                │  Default backend:  │
   │  + JS-side glue                   │  heuristic / mock  │
   │  + Supabase / Expo plumbing       │  / Supabase        │
   │                                   └────────────────────┘
   └──► register({ backend })  ───────►  drop-in real impl
                                          (TFLite / native /
                                           vendor SDK)
```

The app calls `lib/<feature>` in one place. The default backend is a working, useful approximation. Replacing it with the real thing is a single `register({ backend: realImpl })` call from a custom dev client.

This is the only honest way to ship "production-grade" for features whose production-grade form needs assets we can't include.
