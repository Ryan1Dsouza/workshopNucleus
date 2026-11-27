# Android BLE steering and blade audit

## Chrome replay

On Windows, Playwright launched headless Chrome 158.0.8127.38 at 1366 × 900 against the running Node server. The receiver, profile exchange, binary decoder, host animation loop and game iframe all ran normally. A simulated GATT peripheral supplied 261 q15 notifications per slot over 6.8 seconds. Capture intervals ranged from 17 to 40 ms. A timer independent of animation frames delivered groups of one to three packets. The schedule included eleven measured direction reversals.

| Active game in /host | Capture Hz | Delivered Hz per slot | rAF FPS | Median frame ms | Frame jitter p95 ms | Median response ms | Response p95 ms |
|---|---:|---:|---:|---:|---:|---:|---:|
| Kart, before | 38.309 | 38.268 | 135.945 | 7.100 | 2.000 | 155.699 | 160.161 |
| Kart, after | 38.309 | 38.260 | 135.487 | 7.000 | 2.400 | 76.910 | 104.228 |
| Fruit, split screen, before | 38.309 | 38.266 | 143.739 | 7.000 | 0.900 | 66.708 | 67.826 |
| Fruit, split screen, after | 38.309 | 38.289 | 144.040 | 6.900 | 0.800 | 66.571 | 67.595 |

Frame jitter is the 95th percentile absolute deviation of successive rAF callback intervals from their median. Response is the time from a scripted neutral crossing to the interpolated crossing of the local kart's physics steering or the visible blade. Fruit's measured collision cursor crossed in **22.901 ms median**. These measurements include the imposed delivery delays and local scheduling. They exclude physical sensors, radio, compositor scanout and display response.

The host accepted all 261 captures for each slot. The longest interarrival gaps were 115.4 ms for Kart and 83.2 ms for Fruit. Both games recorded zero motion-drop frames, console errors and page errors. Fruit covered x = 0–0.5 and 0.5–1 in the respective lanes and y = 0–1 in each. A separate test placed a stationary fruit outside the endpoints of a three-notification return slash. The batched slash removed it and scored.

## Android capture and host liveness

- Android requests a 10 ms period for the game rotation vector and gyroscope. MotionService retains the newest pose, permits one GATT operation in flight, and spaces active sends by at least 16 ms. That gives a **62.5 Hz ceiling**. Sensor scheduling, negotiated connection intervals, queued controls and the central's callbacks determine delivered Hz. The UI's capture, send and host arrival rates can differ.
- Android sensor timestamps and elapsedRealtimeNanos share the boot-time clock. The service rejects stale, pre-registration and non-increasing captures per sensor. It bounds up to 2 ms of future skew to arrival time and rejects larger future timestamps. Only fresh, finite, near-unit attitudes enter the encoder. Gyro magnitude is marked fresh only when both its age and its separation from the pose are below 80 ms.
- Fresh poses can be sent for up to 100 ms after capture. Explicit inactivity waits for the game's 150 ms aim or 450 ms wheel lease. Turning motion off still suspends immediately. Failed motion sends can retry and the existing five-second in-flight watchdog handles a wedged connection.
- Motion sequence and calibration epoch wrap at 16 bits. The host rejects duplicate, backward and ambiguous half-range increments. The 32-bit millisecond capture clock unwraps across rollover, including a center command preceding the first motion notification. An inactive packet's dispatch timestamp cannot supersede the last active pose.
- The host expires motion from the last fresh capture, using the earliest observed Bluetooth transit offset with a small allowance for clock drift. No signed phone-to-laptop clock synchronization is required. A replayed capture cannot rearm steering or cutting, and a delayed batch cannot refresh a lease just by arriving. Gaps break a stroke while preserving the grip. A 230 ms wheel gap is covered by regression tests. Native v1 contains no dispatch timestamp, so diagnostics leave capture-to-send latency empty.

## Wheel direction, smoothing and controls

Android sends an optional four-byte control notification with opcode 0x44, the current Surface rotation and little-endian profile epoch. The 20-byte motion format is unchanged. The host uses the elevation of the display's left edge. For rotations 0, 90, 180 and 270 degrees, this is device −X, +Y, +X and −Y respectively. It also handles landscape-native tablets. Profile and session checks isolate late hints. A flip clears steering until the next capture. A later manual center uses the actual captured bank angle, including a banked grip.

Older controllers continue using gravity-sign hysteresis and the portrait-reference fallback. A perfectly flat legacy controller has no gravity cue identifying its left end. On a current Android phone the hint follows the OS display rotation, which can stay latched while the device lies flat.

The host filters bank angles at capture time with One Euro settings of 4.5 Hz minimum cutoff, 0.35 beta and 1 Hz derivative cutoff. The original replay used a 2.5° center deadband and 38° full lock. The party update holds zero steering through ±4.5° around the centered grip and eases into the original steering curve by 9°. Full lock is still 38°. A bounded 8–36 ms interpolation buffer feeds the embedded kart. The extra 14/s smoothing stage was removed from this path. Kart physics uses a 45/s response for measured wheels and retains its 20/s keyboard response.

- On a 144 Hz render loop replaying a steady 40 Hz bank ramp with paired arrivals, unchanged steering frames fell from 199/252 to 20/252. RMS per-frame step error fell from 0.004082 to 0.001088 normalized steering units. Presentation holds the last measured endpoint when history runs out. Long radio gaps can still produce a visible hold.
- On a known compound yaw, pitch and bank trajectory, p95 bank error was 0.4901° with scalar interpolation and 0.4875° with shortest-arc quaternion SLERP. Both require the same future endpoint. The native packet carries a saturated 0–655.35°/s angular magnitude, so signed rate extrapolation cannot determine turn direction at a reversal. The scalar buffer keeps the simpler capture-timed path.
- The tests exercise 0°, 30°, 45°, 60° and 90° grips, both landscape ends, portrait entry, a 180° flip, quaternion sign changes, resting and cornering tremor, and a 60° counter-steer in 110 ms.
- Chrome confirmed **2/B** gas, **1** brake and **A** drift. D-pad right uses an item during racing and navigates in menus. It no longer steers on loss of motion. Minus recenters on its button edge. Embedded keyboard R reaches the host's wheel calibration. The countdown can advance using driving keys when a paired wheel goes quiet.

## Fruit Ninja

The pointing beam is chosen from the calibrated grip. Its direction is projected onto a gravity-referenced basis. Split-screen mode measures the viewport per lane. At default sensitivity the horizontal span is 60° and vertical span is 60° times the lane height-to-width ratio, bounded to 33–75°. The gyro magnitude gates physical cuts and bounds fast-slash correction. Android game-vector yaw may drift over long sessions. Recentring establishes a new heading reference.

The host now retains up to 32 fresh measured vertices between render callbacks. Each vertex carries capture time, age, and its own cut/reset flags. Fruit evaluates speed on capture intervals, consumes each eligible segment once and expires segments older than 100 ms. A reset, lost sensor or change of mouse ownership breaks the stroke. The visible aim still interpolates measured endpoints independently. This keeps both legs of a coalesced reversal available for collision.

## Rendering and integration

A separate five-second rAF sampling run used the same Chrome channel and desktop viewport. Counts below are medians read from Three.js renderer.info.render.

| Kart view | FPS | Draw calls | Triangles |
|---|---:|---:|---:|
| Standalone menu | 81.186 | 299 | 215,428 |
| Host iframe menu | 140.026 | 311 | 217,634 |
| Host iframe racing with WASD | 138.822 | 334 | 208,506 |

Standalone document load was 33.8 ms and first rendered game readiness was 3,039.3 ms. The host document loaded in 106.5 ms. Game selection to rendered readiness took 1,635.9 ms, including the iframe's 49.7 ms document load. Both paths had zero GLB requests and zero page or console errors. The default constructs procedural karts and scenery, batches static geometry by material, uses real-time low-resolution MKTV screens, and disables shadow maps. The full-desktop menu and race screenshots showed the portrait grid, track, kart and HUD within the iframe. The inspection establishes fidelity to the implemented scene. No reference capture of the commercial game was supplied for a pixel comparison.

A Chrome DevTools trace attributed 16 ms total forced reflow to the kart frame path over 46.6 seconds. The draw loop now reuses viewport dimensions maintained by its resize handler. The filter measurements above came from separate untraced runs.

The two-session multiplayer regression completed a public lobby, private code and invite-link joins, split Fruit scoring, a full Kart lap for both racers, eight matching result rows, rematch and return to local play. The selected WebRTC candidate pair used UDP, with ordered false and maxRetransmits 0. The fixture stamps its long-running BLE driver from an elapsed clock so browser work cannot slow the simulated phone's clock. Local input and public/private room results had zero browser errors.

## Eight-player party check

Eight Chrome sessions joined one Mario Kart room and exchanged live frames over all 28 pairwise UDP connections. A ninth join was rejected. Each instance drove its assigned kart locally. Pressing Escape and invoking pause on the host and a guest, and pressing the host phone's Plus button, left all eight clocks and peer streams advancing. The eight-session run recorded zero console and page errors.

A simulated handheld wheel changed pitch and yaw continuously while banking within ±4.2°. Peak steering in this straight-ahead phase was zero. The same wheel then banked 20° each way, producing −0.493 and +0.493 steering. All seven other clients observed both turns. A separate bursty replay measured 79.957 ms median and 105.931 ms p95 steering response. Run `node scripts/audit/kart-party.mjs` for the eight-session check.

## Reproduce

With `node server/index.cjs` running, use `node scripts/audit/ble-steering.mjs after` for packet and frame telemetry and `node scripts/audit/multiplayer.mjs` for the room and local-mode regression. Run `npm test` and `npm run test:native-protocol` from the repo root. The browser JSON and screenshots are generated under `test-results/`.

The full Node suite passed all 154 tests with zero failures or skips after the party update. The static web build passed.

The Android 2.0.3 debug APK is version code 7 and has the same signing certificate as the previous download. Android assembleDebug, lintDebug and the native protocol check passed. Lint reported zero errors and three warnings for the WebView JavaScript setting, backup manifest settings and an unused string. No Android handset was attached during this audit. OEM fusion behavior, sustained radio cadence, physical input-to-photon latency and button reach remain hardware checks.
