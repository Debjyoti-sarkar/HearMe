# HearMe

> A personal-safety mobile app paired with the **NeuroBand** wearable — designed to detect distress, capture evidence, and reach trusted contacts when seconds matter.

HearMe is an Expo / React Native app (iOS + Android) backed by Supabase, with optional integration to a custom BLE wristband running Zephyr firmware. It bundles SOS, evidence capture, journey tracking, behavior anomaly detection, hidden-camera scanning, voice triggers, fake calls, and a guided accessibility mode into a single safety toolkit.

---

## Table of contents

- [Features](#features)
- [Architecture](#architecture)
- [Project structure](#project-structure)
- [Tech stack](#tech-stack)
- [Getting started](#getting-started)
- [Environment variables](#environment-variables)
- [Supabase setup](#supabase-setup)
- [NeuroBand firmware](#neuroband-firmware)
- [Running on a device](#running-on-a-device)
- [Permissions](#permissions)
- [Scripts](#scripts)
- [Documentation](#documentation)
- [Contributing](#contributing)
- [License](#license)

---

## Features

### Emergency response
- **SOS button** — one-tap silent alarm that fires SMS with live location to trusted contacts.
- **Voice trigger** — listens for distress phrases and auto-fires SOS.
- **Triple-tap & duress PIN** — discreet activation paths when the screen can't be seen.
- **Fake call** — simulates an incoming call to defuse a hostile situation.
- **Siren** — loud alarm to deter attackers and attract attention.
- **Helplines** — quick dial to local emergency services and women's helplines.

### Evidence & monitoring
- **Audio recorder** — encrypted recording uploaded to the evidence locker.
- **Evidence locker** — Supabase-backed cloud storage for audio, photos, and incident logs.
- **Hidden camera detector** — uses the device camera to spot IR-LED reflections.
- **Journey monitor** — tracks a route and alerts contacts on deviation or no-show.
- **Check-in timer** — auto-alerts contacts if you don't confirm safety in time.
- **Behavior monitor** — uses on-device sensors and the BBA model to flag anomalies (falls, sudden stops, prolonged stillness).
- **Alert history** — chronological log of every triggered event.

### NeuroBand integration
- **BLE pairing** with secure passkey + bonding (`react-native-ble-plx`).
- **20-byte BioFrame** at 1 Hz: HR, HRV, SpO₂, GSR, skin temp, motion, sEMG envelope, battery, tamper.
- **Silent triple-tap trigger** from the band fires SOS without touching the phone.
- **Fusion engine** combines biosignal + phone sensors for higher-confidence triggers.
- **Mock mode** for development without hardware.

### Privacy, accessibility, and identity
- **PIN, biometric, and Aadhaar** identity options.
- **Disguise mode** — the app masquerades as another utility on the home screen.
- **App lock** with re-auth gates on sensitive screens.
- **Voice guide** — fully spoken navigation for visually-impaired users (i18next + `expo-speech`).
- **Multi-language** support via `i18next` / `react-i18next`.
- **Themeable UI** with light/dark and high-contrast variants.

---

## Architecture

```
┌──────────────────────┐        BLE (GATT)         ┌──────────────────────┐
│   NeuroBand (nRF52)  │ ───────────────────────► │  HearMe app (Expo)   │
│   Zephyr firmware    │   1 Hz BioFrame + tamper │  React Native + TS   │
└──────────────────────┘                          └──────────┬───────────┘
                                                             │
                                              Supabase JS    │   Native APIs
                                                             ▼
                              ┌────────────────────────────────────────────┐
                              │ Supabase: Auth · Postgres · Storage · RLS  │
                              │ Evidence files · Profiles · Alert history  │
                              └────────────────────────────────────────────┘
```

The phone is the source of truth: it ingests sensor data from itself and (optionally) the NeuroBand, runs detection locally, and pushes encrypted artifacts to Supabase only when an event fires.

---

## Project structure

```
HearMe/
├── app/                     # expo-router routes (file-based navigation)
│   ├── (main)/              # authenticated app
│   │   ├── (tabs)/          # bottom-tab navigator
│   │   │   ├── index.tsx        # home
│   │   │   ├── safety.tsx       # safety dashboard
│   │   │   ├── speed.tsx        # live speed
│   │   │   ├── contacts.tsx     # trusted contacts
│   │   │   └── settings.tsx
│   │   ├── alert-history.tsx
│   │   ├── audio-recorder.tsx
│   │   ├── behavior-monitor.tsx
│   │   ├── camera-detector.tsx
│   │   ├── check-in.tsx
│   │   ├── evidence-locker.tsx
│   │   ├── fake-call.tsx
│   │   ├── helplines.tsx
│   │   ├── journey-monitor.tsx
│   │   ├── nearby-services.tsx
│   │   ├── neuroband.tsx
│   │   └── user-profile.tsx
│   ├── onboarding.tsx
│   ├── language.tsx
│   ├── login.tsx
│   ├── verify-otp.tsx
│   ├── setup-pin.tsx
│   ├── lock.tsx
│   ├── aadhaar.tsx
│   ├── disguise.tsx
│   └── profile.tsx
├── components/              # reusable UI (SOSButton, GlassCard, etc.)
├── providers/               # React context: Auth, Theme, Language, Voice, Accessibility
├── hooks/                   # custom hooks (themed styles, etc.)
├── lib/                     # business logic
│   ├── supabase.js          # Supabase client
│   ├── neuroband-ble.ts     # BLE transport + frame decoder
│   ├── neuroband-fusion.ts  # bio + phone-sensor fusion
│   ├── neuroband-pairing.ts
│   ├── behavior-detector.ts
│   ├── bba-model.ts         # behavior-anomaly model
│   ├── evidence-locker.ts
│   ├── evidence-cloud.ts
│   ├── audio-recorder.ts
│   ├── voice-trigger.ts
│   ├── voice-guide.ts
│   ├── journey-monitor.ts
│   ├── timer-checkin.ts
│   ├── emergency-sms.ts
│   ├── duress.ts
│   ├── siren.ts
│   ├── trust-engine.ts
│   ├── safety-score.ts
│   ├── safe-zones.ts
│   ├── rideshare.ts
│   ├── alert-history.ts
│   ├── aadhaar.ts
│   ├── otp.ts
│   ├── i18n.ts
│   └── ...
├── constants/               # colors, theme tokens
├── assets/                  # icons, splash, images
├── android/                 # native Android project
├── firmware/neuroband/      # Zephyr firmware for the NeuroBand wristband
├── supabase/                # SQL: schema, RLS policies, evidence bucket
├── docs/                    # strategy / integration / competitive analysis (PDF + HTML)
├── app.json                 # Expo config (permissions, plugins, native build)
├── package.json
└── tsconfig.json
```

---

## Tech stack

| Layer       | Choice                                         |
|-------------|------------------------------------------------|
| App runtime | Expo SDK 54, React Native 0.81, React 19       |
| Routing     | `expo-router` (file-based)                     |
| Language    | TypeScript 5.9                                 |
| State / ctx | React Context (Auth, Theme, Language, Voice)   |
| Backend     | Supabase (Postgres + Auth + Storage + RLS)     |
| BLE         | `react-native-ble-plx` (background-enabled)    |
| Sensors     | `expo-sensors`, `expo-location`, `expo-camera` |
| Auth        | Supabase OTP, biometrics, Aadhaar, demo PIN    |
| i18n        | `i18next` + `react-i18next`                    |
| Firmware    | Zephyr / nRF Connect SDK on nRF52840           |

---

## Getting started

### Prerequisites

- **Node.js** ≥ 20 and **npm** (or pnpm / yarn)
- **Expo CLI** (`npx expo` is fine — no global install needed)
- **Android Studio** with an emulator or a physical Android device, *or* **Xcode** on macOS for iOS
- A **Supabase** project (free tier works)
- *(Optional)* **nRF Connect SDK** if you plan to flash NeuroBand firmware

### Install

```sh
git clone https://github.com/Debjyoti-sarkar/HearMe.git
cd HearMe
npm install
```

### Configure environment

Create a `.env.local` file in the project root:

```env
EXPO_PUBLIC_SUPABASE_URL=https://<your-project>.supabase.co
EXPO_PUBLIC_SUPABASE_KEY=<your-anon-key>
```

> Use the **anon** key, not the service-role key. The anon key is safe to ship to clients because Row-Level Security policies (see `supabase/rls.sql`) gate every table.

### Run the app

```sh
npm run start         # Expo dev server (QR for Expo Go / dev client)
npm run android       # build & launch on a connected Android device/emulator
npm run ios           # build & launch on iOS simulator (macOS only)
npm run web           # run in a browser (limited — no BLE / sensors)
```

> Several features (BLE, background location, biometrics, foreground services) require a **development build** rather than Expo Go. Use `npx expo run:android` or `eas build --profile development` to get a dev client with the right native modules.

---

## Environment variables

| Var                          | Required | Purpose                              |
|------------------------------|----------|--------------------------------------|
| `EXPO_PUBLIC_SUPABASE_URL`   | Yes      | Supabase project URL                 |
| `EXPO_PUBLIC_SUPABASE_KEY`   | Yes      | Supabase anon key                    |

The `EXPO_PUBLIC_` prefix is required for Expo to expose the variable to the runtime bundle.

---

## Supabase setup

The `supabase/` folder contains the SQL needed to provision a fresh project:

```sh
# Run in order against your Supabase SQL editor:
supabase/setup.sql        # tables (profiles, contacts, alerts, etc.)
supabase/rls.sql          # Row-Level Security policies
supabase/evidence.sql     # evidence storage bucket + access rules
```

After running these, enable **Phone OTP** auth in the Supabase dashboard (Auth → Providers) for the SMS sign-in flow.

---

## NeuroBand firmware

The `firmware/neuroband/` folder is a self-contained Zephyr application that targets the **nRF52840-DK**. It implements the BLE GATT service consumed by `lib/neuroband-ble.ts`.

```sh
cd firmware/neuroband
west build -b nrf52840dk/nrf52840 .
west flash
```

See [`firmware/neuroband/README.md`](firmware/neuroband/README.md) for the complete wire protocol, BioFrame layout, sensor wiring, and pairing instructions.

The app ships with a **Mock mode** so you can develop and test the full UX without the band attached.

---

## Running on a device

Because HearMe uses BLE, background location, foreground services, and biometrics, **Expo Go is not enough**. You need a development build:

```sh
# Android dev client (adb-connected device)
npx expo run:android

# iOS dev client (macOS + Xcode)
npx expo run:ios
```

For distributable builds use **EAS Build**:

```sh
npx eas build --profile preview --platform android
npx eas build --profile production --platform ios
```

---

## Permissions

HearMe requests the following at runtime — declared in `app.json`:

**iOS** — Location (always & when-in-use), Camera, Microphone, Contacts, Face ID, Photo Library (read/add), Bluetooth (always & peripheral), Background Modes (`bluetooth-central`).

**Android** — `SEND_SMS`, `CALL_PHONE`, `ACCESS_FINE_LOCATION`, `ACCESS_COARSE_LOCATION`, `VIBRATE`, `CAMERA`, `READ_CONTACTS`, `RECORD_AUDIO`, `USE_BIOMETRIC`, `USE_FINGERPRINT`, `BLUETOOTH`, `BLUETOOTH_ADMIN`, `BLUETOOTH_SCAN`, `BLUETOOTH_CONNECT`, `FOREGROUND_SERVICE`, `FOREGROUND_SERVICE_CONNECTED_DEVICE`.

Each permission is requested with a clear human-readable rationale at the moment it's first needed.

---

## Scripts

| Command              | What it does                              |
|----------------------|-------------------------------------------|
| `npm run start`      | Start the Expo dev server                 |
| `npm run android`    | Build + run on Android                    |
| `npm run ios`        | Build + run on iOS                        |
| `npm run web`        | Start the web target                      |
| `npm run typecheck`  | TypeScript check (no emit)                |

---

## Documentation

The `docs/` folder contains design and strategy documents (PDF + HTML):

- **HearMe_Competitive_Analysis** — landscape of personal-safety apps and where HearMe differentiates.
- **HearMe_Hardware_IoT_Strategy** — wearable roadmap, sensor stack, and supply considerations.
- **HearMe_NeuroBand_Integration** — BLE protocol, fusion logic, and the security envelope.

---

## Contributing

Contributions are welcome. To propose a change:

1. Fork the repo and create a feature branch.
2. Run `npm run typecheck` before pushing.
3. Open a PR against `main` describing the **why**, not just the **what**.

If you're adding a feature that touches sensors, BLE, or background services, please test on a physical device — the simulators don't model these accurately.

---

## License

This project is released for educational and research purposes. Production deployment in jurisdictions with regulated emergency-services interactions (SMS-to-emergency, location forwarding, evidence storage) is the operator's responsibility.

---

**Built by [@Debjyoti-sarkar](https://github.com/Debjyoti-sarkar).** If HearMe helps someone feel safer, that's the whole point.
