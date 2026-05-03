# NeuroBand firmware

Reference Zephyr firmware for the NeuroBand wrist module. Boots the BLE
stack, advertises the HearMe Bio Service, and notifies a 20-byte BioFrame
at 1 Hz that the HearMe app's `lib/neuroband-ble.ts` decoder consumes
byte-for-byte.

## What this repo gives you

- `src/main.c` — boot, advertise, 1 Hz publish loop
- `src/bio_frame.[ch]` — packs `struct bio_reading` into the 20-byte wire frame
- `src/bio_service.[ch]` — custom GATT service, characteristics, advertising
- `src/sensors.[ch]` — sensor abstraction layer with **synthetic readings** for v1
- `prj.conf` — Zephyr config (BLE, I2C, ADC, NVS, logging)
- `CMakeLists.txt` — Zephyr-style build

## What's NOT done yet

The sensor reads in `sensors.c` are synthetic. Replace each `read_*` stub
with real driver calls as the PCB gets populated. Function signatures don't
change — only the body of `sensors_read()` and `sensors_init()`.

Drivers needed:

| Sensor      | Bus  | Address  | Suggested |
|-------------|------|----------|-----------|
| MAX30102 PPG     | I²C  | 0x57     | Maxim app note 6409 |
| Grove GSR       | ADC  | AIN0     | Zephyr `<zephyr/drivers/adc.h>` |
| MAX30205 temp   | I²C  | 0x48     | Read reg 0x00, 16-bit two's complement |
| BMI270 IMU      | I²C  | 0x68     | In-tree Zephyr driver — `CONFIG_BMI270=y` |
| DRV2605L haptic | I²C  | 0x5A    | Reg 0x04 + GO 0x0C |
| MyoWare 2.0     | ADC  | AIN1     | Software envelope (abs + EMA) |

## Build & flash (nRF52840-DK)

```sh
# One-time: install Zephyr toolchain via nRF Connect SDK
# https://docs.nordicsemi.com/bundle/ncs-latest/page/nrf/installation/install_ncs.html

cd firmware/neuroband
west build -b nrf52840dk/nrf52840 .
west flash
```

After flashing, open RTT console (`JLinkRTTViewer` or `west attach`) — you
should see:

```
[neuroband_main] NeuroBand fw 1.0 booting (serial=NB1A-000001)
[bio_service]    advertising started
[neuroband_main] ready — waiting for central
```

## Pair with the HearMe app

1. In HearMe, go **Settings → NeuroBand → Bio-signal silent trigger**
2. Toggle **NeuroBand monitoring** ON, **Mock mode** OFF
3. Tap **Scan for NeuroBand**
4. Pick the device in the list (it advertises as "NeuroBand")
5. Enter the PSK — currently hardcoded in `main.c` as the 6-digit numeric
   form of `BAND_PASSKEY` (default `482915`). The strap sticker should
   print the same value.

## Wire-protocol contract

**Service UUID:** `a89f3000-e5b8-4f7c-9e02-9b0c54a4e201`

| Char | UUID suffix | Direction | Payload |
|------|-------------|-----------|---------|
| `bio_frame` | `…8001` | notify, 1 Hz | 20 B (see below) |
| `silent_trigger` | `…8002` | notify | 1 B: bit0=triple-tap, bit1=auto-fired, bit2=tamper |
| `command` | `…8003` | write encrypted | 1 B opcode (0x01=haptic, 0x02=calibrate) |
| `device_info` | `…8004` | read | `[fwMajor u8][fwMinor u8][serial UTF-8…]` |

### 20-byte BioFrame layout (little-endian)

| Offset | Size | Field | Encoding |
|--------|------|-------|----------|
| 0  | u16 | `seq` | rolling per-connection counter |
| 2  | u8  | `hr_bpm` | 0..255 |
| 3  | u8  | `hrv_rmssd_ms` | 0..255 |
| 4  | u8  | `spo2_pct` | 0..100 typical |
| 5  | u16 | `gsr` | µS × 100 |
| 7  | i16 | `skin_temp` | °C × 10 |
| 9  | u8  | `motion` | 0=still, 1=walk, 2=run, 3=fall, 4=unknown |
| 10 | u8  | `semg_envelope` | 0..255 |
| 11 | u8  | `battery_pct` | 0..100 |
| 12 | u8  | `flags` | bit0=charging, bit1=tamper, bit2=lowBat |
| 13 | u32 | `counter` | monotonic — phone rejects ≤ last accepted |
| 17 | u8  | `fw_minor` | per-frame fw version stamp |
| 18 | 2B  | reserved | zero |

## Security

Per Volume III §11:

- **LE Secure Connections + bonding mandatory** — `prj.conf` sets `BT_SMP_SC_PAIR_ONLY=y`
- **PSK printed on strap** binds the SC passkey
- **Monotonic counter** in every frame — phone drops `counter ≤ lastCounter`
- **No PII** stored on band — only the serial number
- Future: AES-CCM frame encryption (v2 protocol). Out-of-scope for v1.
