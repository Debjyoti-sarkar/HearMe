/*
 * Sensor read layer.
 *
 * v1 of this file ships with synthetic readings so the firmware boots and
 * the BLE link can be validated before any sensors are physically wired.
 * Replace each `read_*` stub with the real I2C/ADC driver call as the
 * hardware comes online — function signatures don't change.
 *
 * Recommended driver source:
 *   - MAX30102 PPG     → Maxim app note 6409, or community Zephyr driver
 *   - Grove GSR        → Zephyr ADC API on AIN0
 *   - MAX30205 temp    → I2C addr 0x48, register 0x00 (16-bit two's complement, 0.00390625 °C/LSB)
 *   - BMI270 IMU       → Zephyr in-tree driver (CONFIG_BMI270=y)
 *   - DRV2605L haptic  → I2C addr 0x5A, fire effect via reg 0x04 + GO 0x0C
 *   - MyoWare 2.0 sEMG → ADC on AIN1, software envelope = abs() + EMA
 */

#include "sensors.h"

#include <zephyr/kernel.h>
#include <zephyr/logging/log.h>
#include <zephyr/random/random.h>
#include <math.h>

LOG_MODULE_REGISTER(sensors, LOG_LEVEL_INF);

/* ---- Synthetic-reading state machine ----
 *
 * Three modes: calm, active, duress. The firmware boots in calm; tap the
 * cap-touch pad three times to advance. This mirrors the JS-side mock so
 * you can test the BLE link with realistic data before sensors land.
 *
 * Once real drivers are in, delete the synthetic generator and replace
 * with direct sensor reads in sensors_read().
 */

enum sim_mode {
    SIM_CALM = 0,
    SIM_ACTIVE = 1,
    SIM_DURESS = 2,
};

static enum sim_mode sim = SIM_CALM;

void sensors_set_sim_mode(int m) {
    if (m >= 0 && m <= 2) sim = (enum sim_mode)m;
}

static float urand(float lo, float hi) {
    /* sys_rand32_get returns 0..UINT32_MAX */
    uint32_t r = sys_rand32_get();
    return lo + ((float)r / (float)UINT32_MAX) * (hi - lo);
}

int sensors_init(void) {
    /* TODO: probe MAX30102, MAX30205, BMI270 over I2C; enable ADC channels;
     * configure DRV2605L for an LRA. For now, just log and continue. */
    LOG_INF("sensors_init (synthetic mode)");
    return 0;
}

void sensors_read(struct bio_reading *r) {
    /* TODO: replace with real sensor reads. See top-of-file driver list. */

    switch (sim) {
    case SIM_DURESS:
        r->hr_bpm        = (uint8_t)urand(110, 130);
        r->hrv_rmssd_ms  = (uint8_t)urand(15, 35);
        r->spo2_pct      = (uint8_t)urand(91, 96);
        r->gsr_us        = urand(6.0f, 12.0f);
        r->skin_temp_c   = urand(31.6f, 32.4f);
        r->motion        = BF_MOTION_STILL;
        r->semg_envelope = (uint8_t)urand(140, 220);
        break;
    case SIM_ACTIVE:
        r->hr_bpm        = (uint8_t)urand(95, 115);
        r->hrv_rmssd_ms  = (uint8_t)urand(20, 50);
        r->spo2_pct      = (uint8_t)urand(96, 99);
        r->gsr_us        = urand(3.0f, 5.0f);
        r->skin_temp_c   = urand(33.2f, 34.0f);
        r->motion        = (urand(0, 1) > 0.4f) ? BF_MOTION_WALK : BF_MOTION_RUN;
        r->semg_envelope = (uint8_t)urand(40, 90);
        break;
    case SIM_CALM:
    default:
        r->hr_bpm        = (uint8_t)urand(64, 76);
        r->hrv_rmssd_ms  = (uint8_t)urand(35, 70);
        r->spo2_pct      = (uint8_t)urand(96, 99);
        r->gsr_us        = urand(2.0f, 3.0f);
        r->skin_temp_c   = urand(32.8f, 33.6f);
        r->motion        = BF_MOTION_STILL;
        r->semg_envelope = (uint8_t)urand(20, 60);
        break;
    }

    /* Battery + flags — replace with PMIC reads when available. */
    r->battery_pct = 78;
    r->flags = 0;  /* OR in BF_FLAG_LOW_BAT etc. as needed */
}

void haptic_buzz_short(void) {
    /* TODO: drive DRV2605L → fire effect 0x10 (Strong Buzz 100%). */
    LOG_INF("haptic buzz");
}
