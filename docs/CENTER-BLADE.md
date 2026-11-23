# Center blade: captured-pose calibration

The browser button now uses a standard click handler, so touch, mouse, Enter and Space activate the same action. It clears pending motion, captures the current fresh pose and increments the sensor epoch. The reliable command carries `{ type: 'recentre', epoch, pose }`; subsequent motion uses that epoch. If no fresh reading exists, centering waits for the next valid pose instead of reporting a captured grip that does not exist.

The previous implementation sent a bare reset command and independently incremented the motion epoch. A command or packet arriving late could choose a later grip or reset calibration twice. `MotionInput` now owns this ordering:

1. Bind the reference to the pose captured for the button press.
2. Reject older calibration epochs and old capture timestamps.
3. If new-epoch motion arrives before its command, apply the anchor and re-project the latest pose relative to that anchor.
4. Ignore a duplicate/older anchored command.
5. Clear pending collisions, game/visual trails and the interpolation buffer. A snap cannot become a slice.

Host keyboard recentering uses the latest held measured pose. Ordinary sensor silence preserves the grip and visible point; resume breaks the previous stroke. Native epochs wrap modulo 65536, while browser epochs are increasing integers.

## Android v1.2

Install/update the packaged v1.2 APK to get captured-pose centering. The existing 20-byte motion protocol is unchanged. Center notifications use a 15-byte little-endian control payload:

| Offset | Value |
|---|---|
| 0 | Command 2 |
| 1–2 | Calibration epoch, uint16 |
| 3–6 | Sensor capture milliseconds, uint32 |
| 7–14 | XYZW quaternion, four signed int16 / 32767 |

Before a fresh sensor pose exists, a 3-byte command carries only command 2 and the epoch. The browser also accepts the old one-byte reset for compatibility; its missing anchor cannot recover exact button-time pose information. `BleTimeline.captureTime()` unwraps an anchor without consuming/reordering motion sequence numbers.

Regression checks cover touch/keyboard activation, both command/motion arrival orders, repeated presses, stale epochs, native epoch wrap, pending sensors and Java-to-JavaScript bytes. Browser/GATT fixtures are simulated; check the installed APK on the actual workshop phone as well.
