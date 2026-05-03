#include "bio_frame.h"

#include <string.h>

static inline void put_u16_le(uint8_t *p, uint16_t v) {
    p[0] = (uint8_t)(v & 0xff);
    p[1] = (uint8_t)((v >> 8) & 0xff);
}

static inline void put_i16_le(uint8_t *p, int16_t v) {
    put_u16_le(p, (uint16_t)v);
}

static inline void put_u32_le(uint8_t *p, uint32_t v) {
    p[0] = (uint8_t)(v & 0xff);
    p[1] = (uint8_t)((v >> 8) & 0xff);
    p[2] = (uint8_t)((v >> 16) & 0xff);
    p[3] = (uint8_t)((v >> 24) & 0xff);
}

static inline uint8_t clamp_u8(int v) {
    if (v < 0) return 0;
    if (v > 255) return 255;
    return (uint8_t)v;
}

static inline int16_t clamp_i16(int v) {
    if (v < -32768) return -32768;
    if (v > 32767) return 32767;
    return (int16_t)v;
}

static inline uint16_t clamp_u16(int v) {
    if (v < 0) return 0;
    if (v > 65535) return 65535;
    return (uint16_t)v;
}

size_t bio_frame_pack(uint8_t out[20],
                      uint16_t seq,
                      uint32_t counter,
                      uint8_t fw_minor,
                      const struct bio_reading *r) {
    /* Layout — see lib/neuroband-ble.ts decodeBioFrame:
     *  0   seq      u16 LE
     *  2   hr       u8
     *  3   hrv      u8
     *  4   spo2     u8
     *  5   gsr      u16 LE  (gsr_us * 100)
     *  7   temp     i16 LE  (skin_temp_c * 10)
     *  9   motion   u8
     *  10  semg     u8
     *  11  battery  u8
     *  12  flags    u8
     *  13  counter  u32 LE
     *  17  fw_minor u8
     *  18  reserved u8 (0)
     *  19  reserved u8 (0)
     */
    memset(out, 0, 20);

    put_u16_le(&out[0], seq);
    out[2]  = r->hr_bpm;
    out[3]  = r->hrv_rmssd_ms;
    out[4]  = r->spo2_pct;
    put_u16_le(&out[5], clamp_u16((int)(r->gsr_us * 100.0f + 0.5f)));
    put_i16_le(&out[7], clamp_i16((int)(r->skin_temp_c * 10.0f)));
    out[9]  = r->motion;
    out[10] = r->semg_envelope;
    out[11] = (r->battery_pct > 100) ? 100 : r->battery_pct;
    out[12] = r->flags;
    put_u32_le(&out[13], counter);
    out[17] = fw_minor;
    /* out[18..19] left zero — reserved */

    return 20;
}
