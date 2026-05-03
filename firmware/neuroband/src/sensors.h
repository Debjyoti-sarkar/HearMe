/*
 * Thin sensor abstraction layer. Real driver code goes in sensors.c —
 * the stubs there return synthetic readings so the firmware boots and
 * advertises before any sensor PCB is wired.
 */

#ifndef NEUROBAND_SENSORS_H_
#define NEUROBAND_SENSORS_H_

#include "bio_frame.h"

int  sensors_init(void);

/* Populate `r` with the latest readings. Always succeeds — missing sensors
 * fall back to last-known or default values rather than failing. */
void sensors_read(struct bio_reading *r);

/* Trigger one short haptic buzz on the LRA (DRV2605L). */
void haptic_buzz_short(void);

#endif /* NEUROBAND_SENSORS_H_ */
