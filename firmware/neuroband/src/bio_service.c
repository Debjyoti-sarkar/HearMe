#include "bio_service.h"

#include <zephyr/bluetooth/bluetooth.h>
#include <zephyr/bluetooth/conn.h>
#include <zephyr/bluetooth/gatt.h>
#include <zephyr/bluetooth/uuid.h>
#include <zephyr/kernel.h>
#include <zephyr/logging/log.h>
#include <string.h>

LOG_MODULE_REGISTER(bio_service, LOG_LEVEL_INF);

/* ---- UUIDs ----
 *
 * Base 128-bit UUID:  a89f3000-e5b8-4f7c-9e02-9b0c54a4e201
 *   - Service:        a89f3000-...
 *   - bio_frame:      a89f8001-...
 *   - silent_trigger: a89f8002-...
 *   - command:        a89f8003-...
 *   - device_info:    a89f8004-...
 *
 * BT_UUID_128_ENCODE byte order is reverse — keep this consistent with the
 * TypeScript constants in lib/neuroband-ble.ts.
 */
#define HEARME_UUID_BASE(short_) \
    BT_UUID_128_ENCODE(0xa89f0000u | ((uint32_t)(short_)), 0xe5b8, 0x4f7c, 0x9e02, 0x9b0c54a4e201ull)

static struct bt_uuid_128 hearme_svc_uuid           = BT_UUID_INIT_128(HEARME_UUID_BASE(0x3000));
static struct bt_uuid_128 hearme_bio_frame_uuid     = BT_UUID_INIT_128(HEARME_UUID_BASE(0x8001));
static struct bt_uuid_128 hearme_silent_uuid        = BT_UUID_INIT_128(HEARME_UUID_BASE(0x8002));
static struct bt_uuid_128 hearme_command_uuid       = BT_UUID_INIT_128(HEARME_UUID_BASE(0x8003));
static struct bt_uuid_128 hearme_device_info_uuid   = BT_UUID_INIT_128(HEARME_UUID_BASE(0x8004));

/* ---- Device info characteristic value ---- */
static uint8_t  device_info[2 + 24];     /* [fwMajor][fwMinor][serial] */
static size_t   device_info_len = 2;

/* ---- Subscription state ---- */
static struct bt_conn *current_conn;
static bool bio_frame_subscribed;

static void ccc_bio_frame_changed(const struct bt_gatt_attr *attr, uint16_t value) {
    bio_frame_subscribed = (value == BT_GATT_CCC_NOTIFY);
    LOG_INF("bio_frame subscribed=%d", bio_frame_subscribed);
}

/* Stub silent_trigger CCC handler — we don't gate on it but Zephyr requires
 * the descriptor to be declared if the characteristic is notifiable. */
static void ccc_silent_trigger_changed(const struct bt_gatt_attr *attr, uint16_t value) {
    LOG_INF("silent_trigger ccc=0x%04x", value);
}

/* device_info read — return packed [fwMajor][fwMinor][serial...] */
static ssize_t read_device_info(struct bt_conn *conn,
                                const struct bt_gatt_attr *attr,
                                void *buf, uint16_t len, uint16_t offset) {
    return bt_gatt_attr_read(conn, attr, buf, len, offset,
                             device_info, device_info_len);
}

/* command write handler — extend with real command parsing as needed. */
static ssize_t write_command(struct bt_conn *conn,
                             const struct bt_gatt_attr *attr,
                             const void *buf, uint16_t len, uint16_t offset, uint8_t flags) {
    if (offset != 0 || len < 1) return BT_GATT_ERR(BT_ATT_ERR_INVALID_OFFSET);
    const uint8_t *cmd = (const uint8_t *)buf;
    LOG_INF("command write: 0x%02x (len=%u)", cmd[0], len);

    switch (cmd[0]) {
    case 0x01:  /* haptic buzz */
        /* TODO: hand off to DRV2605L driver — see sensors.c haptic_buzz_short() */
        break;
    case 0x02:  /* enter calibration mode */
        break;
    default:
        break;
    }
    return len;
}

BT_GATT_SERVICE_DEFINE(hearme_bio_svc,
    BT_GATT_PRIMARY_SERVICE(&hearme_svc_uuid),

    /* bio_frame — notify */
    BT_GATT_CHARACTERISTIC(&hearme_bio_frame_uuid.uuid,
        BT_GATT_CHRC_NOTIFY,
        BT_GATT_PERM_NONE,
        NULL, NULL, NULL),
    BT_GATT_CCC(ccc_bio_frame_changed,
        BT_GATT_PERM_READ_ENCRYPT | BT_GATT_PERM_WRITE_ENCRYPT),

    /* silent_trigger — notify */
    BT_GATT_CHARACTERISTIC(&hearme_silent_uuid.uuid,
        BT_GATT_CHRC_NOTIFY,
        BT_GATT_PERM_NONE,
        NULL, NULL, NULL),
    BT_GATT_CCC(ccc_silent_trigger_changed,
        BT_GATT_PERM_READ_ENCRYPT | BT_GATT_PERM_WRITE_ENCRYPT),

    /* command — write (encrypted) */
    BT_GATT_CHARACTERISTIC(&hearme_command_uuid.uuid,
        BT_GATT_CHRC_WRITE,
        BT_GATT_PERM_WRITE_ENCRYPT,
        NULL, write_command, NULL),

    /* device_info — read */
    BT_GATT_CHARACTERISTIC(&hearme_device_info_uuid.uuid,
        BT_GATT_CHRC_READ,
        BT_GATT_PERM_READ,
        read_device_info, NULL, NULL),
);

/* attr index lookups — frame char value attr is index 2 (1-based after the
 * service decl), trigger value attr is index 5. Keep this in sync with the
 * SERVICE_DEFINE order above. */
#define ATTR_BIO_FRAME_VALUE   (&hearme_bio_svc.attrs[2])
#define ATTR_SILENT_VALUE      (&hearme_bio_svc.attrs[5])

int bio_service_notify_frame(const uint8_t frame[20]) {
    if (!current_conn || !bio_frame_subscribed) {
        return 0;  /* no subscriber — drop silently */
    }
    return bt_gatt_notify(current_conn, ATTR_BIO_FRAME_VALUE, frame, 20);
}

int bio_service_notify_trigger(uint8_t bits) {
    if (!current_conn) return 0;
    return bt_gatt_notify(current_conn, ATTR_SILENT_VALUE, &bits, 1);
}

bool bio_service_is_subscribed(void) {
    return current_conn && bio_frame_subscribed;
}

void bio_service_set_device_info(uint8_t fw_major, uint8_t fw_minor, const char *serial) {
    device_info[0] = fw_major;
    device_info[1] = fw_minor;
    size_t slen = strlen(serial);
    if (slen > sizeof(device_info) - 2) slen = sizeof(device_info) - 2;
    memcpy(&device_info[2], serial, slen);
    device_info_len = 2 + slen;
}

/* ---- Connection management + advertising ---- */

static void connected(struct bt_conn *conn, uint8_t err) {
    if (err) {
        LOG_WRN("connect failed err=0x%02x", err);
        return;
    }
    current_conn = bt_conn_ref(conn);
    LOG_INF("central connected");
}

static void disconnected(struct bt_conn *conn, uint8_t reason) {
    LOG_INF("central disconnected reason=0x%02x", reason);
    if (current_conn) {
        bt_conn_unref(current_conn);
        current_conn = NULL;
    }
    bio_frame_subscribed = false;
}

BT_CONN_CB_DEFINE(conn_callbacks) = {
    .connected = connected,
    .disconnected = disconnected,
};

static const struct bt_data ad[] = {
    BT_DATA_BYTES(BT_DATA_FLAGS, (BT_LE_AD_GENERAL | BT_LE_AD_NO_BREDR)),
    BT_DATA_BYTES(BT_DATA_UUID128_ALL,
        BT_UUID_128_ENCODE(0xa89f3000u, 0xe5b8, 0x4f7c, 0x9e02, 0x9b0c54a4e201ull)),
};

/* Manufacturer-data scan response carrying the first 4 chars of the serial
 * for the phone's pairing UI. Updated by main.c after bio_service_set_device_info. */
static uint8_t scan_resp_mfg[6] = { 0xff, 0xff, '?', '?', '?', '?' };
static struct bt_data scan_resp[] = {
    BT_DATA(BT_DATA_NAME_COMPLETE, "NeuroBand", 9),
    BT_DATA(BT_DATA_MANUFACTURER_DATA, scan_resp_mfg, sizeof(scan_resp_mfg)),
};

int bio_service_init(void) {
    int err;

    err = bt_le_adv_start(BT_LE_ADV_CONN_NAME, ad, ARRAY_SIZE(ad),
                          scan_resp, ARRAY_SIZE(scan_resp));
    if (err) {
        LOG_ERR("adv start failed err=%d", err);
        return err;
    }
    LOG_INF("advertising started");
    return 0;
}
