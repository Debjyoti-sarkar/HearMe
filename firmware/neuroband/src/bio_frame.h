/*
 * NeuroBand BioFrame — 20-byte packed payload sent over BLE notify at 1 Hz.
 *
 * The byte layout MUST match lib/neuroband-ble.ts decodeBioFrame in the
 * HearMe app. Don't change field order or sizes without changing both.
 */

#ifndef NEUROBAND_BIO_FRAME_H_
#define NEUROBAND_BIO_FRAME_H_

#include <stdint.h>
#include <stddef.h>

/* Motion classes — values must match MotionClass index in neuroband-ble.ts */
#define BF_MOTION_STILL    0
#define BF_MOTION_WALK     1
#define BF_MOTION_RUN      2
#define BF_MOTION_FALL     3
#define BF_MOTION_UNKNOWN  4

/* Flag bits */
#define BF_FLAG_CHARGING   (1u << 0)
#define BF_FLAG_TAMPER     (1u << 1)
#define BF_FLAG_LOW_BAT    (1u << 2)

/* Plain-language sensor reading — host-endian, what the firmware works with. */
struct bio_reading {
    uint8_t  hr_bpm;          /* 0..255 */
    uint8_t  hrv_rmssd_ms;    /* 0..255 */
    uint8_t  spo2_pct;        /* 0..100 typical */
    float    gsr_us;          /* µS */
    float    skin_temp_c;
    uint8_t  motion;          /* BF_MOTION_* */
    uint8_t  semg_envelope;   /* 0..255 normalised */
    uint8_t  battery_pct;
    uint8_t  flags;           /* BF_FLAG_* OR'd */
};

/* Pack a bio_reading + monotonic counter + sequence into the 20-byte
 * little-endian wire format. Returns the number of bytes written (always 20). */
size_t bio_frame_pack(uint8_t out[20],
                      uint16_t seq,
                      uint32_t counter,
                      uint8_t fw_minor,
                      const struct bio_reading *r);

#endif /* NEUROBAND_BIO_FRAME_H_ */
