/*
 * NeuroBand main loop.
 *
 * Boots the BLE stack, advertises the HearMe Bio Service, and pushes a
 * 20-byte BioFrame at 1 Hz to whichever central is subscribed.
 *
 * Pair this firmware with the HearMe app's NeuroBand screen (Mock mode OFF).
 * The byte layout matches lib/neuroband-ble.ts decodeBioFrame exactly.
 */

#include "bio_frame.h"
#include "bio_service.h"
#include "sensors.h"

#include <zephyr/kernel.h>
#include <zephyr/logging/log.h>
#include <zephyr/bluetooth/bluetooth.h>
#include <zephyr/settings/settings.h>

LOG_MODULE_REGISTER(neuroband_main, LOG_LEVEL_INF);

#define FW_MAJOR     1
#define FW_MINOR     0

/* Bake your real serial in here — the first 4 chars are also broadcast in
 * scan response so the phone's pairing UI shows it. */
#define BAND_SERIAL  "NB1A-000001"

/* PSK printed on the strap — used as Bluetooth fixed passkey for SC pairing.
 * 6-digit numeric per BT spec. The 12-char alphanumeric PSK from the spec
 * is hashed down to a 6-digit value at provisioning time. */
#define BAND_PASSKEY 482915u

static uint16_t seq_counter;
static uint32_t monotonic_counter;

static void publish_frame(void) {
    struct bio_reading r;
    sensors_read(&r);

    uint8_t frame[20];
    bio_frame_pack(frame, seq_counter++, ++monotonic_counter, FW_MINOR, &r);

    int err = bio_service_notify_frame(frame);
    if (err < 0) {
        LOG_WRN("notify err=%d", err);
    }
}

void main(void) {
    int err;

    LOG_INF("NeuroBand fw %d.%d booting (serial=%s)", FW_MAJOR, FW_MINOR, BAND_SERIAL);

    err = sensors_init();
    if (err) {
        LOG_ERR("sensors_init err=%d", err);
    }

    err = bt_enable(NULL);
    if (err) {
        LOG_ERR("bt_enable err=%d", err);
        return;
    }

    if (IS_ENABLED(CONFIG_SETTINGS)) {
        settings_load();
    }

    /* Bind the strap-printed PSK as the SC passkey. */
    bt_passkey_set(BAND_PASSKEY);

    bio_service_set_device_info(FW_MAJOR, FW_MINOR, BAND_SERIAL);

    err = bio_service_init();
    if (err) {
        LOG_ERR("bio_service_init err=%d", err);
        return;
    }

    LOG_INF("ready — waiting for central");

    /* Main loop — 1 Hz publish. Keep this tight so the band sleeps as much
     * as possible between ticks; real power management with k_sleep + WFI
     * gives ~3-day battery on a 110 mAh cell. */
    while (1) {
        publish_frame();
        k_sleep(K_MSEC(1000));
    }
}
