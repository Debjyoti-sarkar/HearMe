/*
 * HearMe Bio Service — custom 128-bit GATT service exposed by the band.
 * UUIDs MUST match lib/neuroband-ble.ts exactly.
 */

#ifndef NEUROBAND_BIO_SERVICE_H_
#define NEUROBAND_BIO_SERVICE_H_

#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>

/* Notify the central with a freshly-packed 20-byte BioFrame. Safe to call
 * from a workqueue; returns 0 on success. If no central is subscribed, the
 * call is a no-op and still returns 0. */
int bio_service_notify_frame(const uint8_t frame[20]);

/* Notify a silent-trigger event (cap-touch, auto-fire, tamper). The byte
 * is bit0=triple-tap, bit1=auto-fired, bit2=tamper. */
int bio_service_notify_trigger(uint8_t trigger_bits);

/* Set the device-info characteristic. Format expected by the host:
 *   [fwMajor u8][fwMinor u8][serial UTF-8 ...]
 * The serial is also broadcast as manufacturer data so the phone scan list
 * can show it before connecting. */
void bio_service_set_device_info(uint8_t fw_major,
                                 uint8_t fw_minor,
                                 const char *serial);

/* True if a central is connected and has subscribed to bio_frame notifications. */
bool bio_service_is_subscribed(void);

/* Initialize the service + start advertising. Call once after bt_enable(). */
int bio_service_init(void);

#endif /* NEUROBAND_BIO_SERVICE_H_ */
