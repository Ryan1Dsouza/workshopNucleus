# Architecture and stage boundaries

Air Slice has one Node server, a projector page and up to two phone inputs. Shared game math operates on normalized screen coordinates; Three.js maps the fixed 2D play field into the 3D scene. OpenCode writes/reconstructs the source through an OmniRoute provider. Neither tool participates in gameplay.

## Input flow

~~~text
Browser sensors -> SensorStream -> phone-link -> relay or WebRTC
Android sensors -> FrameCodec -> BLE -> BluetoothLink
                                |
                            MotionInput
                                |
                  calibrated PosePointer + epoch
                         /               \\
            immediate collision       BladeDisplay
                    |                 screen dot/trail
                FruitNinja                 |
                    +---------> Three.js / SVG / HUD
~~~

`public/core/input-links.js` loads phone/Bluetooth adapters only when the current stage enables them. `public/core/phone-link.js` uses the relay adapter at Stage 3 and the direct-capable transport from Stage 4. Early checkpoints can therefore run with future modules genuinely absent.

## Files and contracts

| Area | Files | Contract |
|---|---|---|
| Server | `server/index.cjs` | `createWorkshopServer()`, `/api/health`, `/host`, `/controller`, two isolated room slots |
| Host | `public/host/index.html`, `bootstrap.mjs`, `setup.mjs` | Fixed DOM IDs, lazy startup, QR origin preservation, practice/classic controls |
| Stage switch | `public/stage.mjs` | Explicit checkpoint number and feature flags; final source uses 7 |
| Phone capture | `public/controller/sensors.mjs` | Finite raw pose/rates, capture timestamps, source separation and monotonically increasing epochs |
| Calibration lifecycle | `public/core/motion-input.js` | Session/epoch fences, captured-pose centering, held aim and display/stroke resets |
| Proportional aim | `public/core/pose-pointer.js` | 60°/screen at 1×; fixed grip axis; no prediction/coasting; physical-motion gating |
| Phone network | `relay-link.js`, `transport.js`, `motion-queue.js`, `motion-clock.js` | Relay first, then direct unordered motion and reliable commands; freshness and sequence checks |
| Native input | `ble-protocol.js`, `bluetooth-link.js`, Android `FrameCodec.java` | Documented quaternion units/epochs, one source per slot and reconnect cleanup |
| Visual blade | `blade-display.js`, `screen-blade.js`, `blade-ribbon.js` | Bounded endpoint interpolation and fading ribbons above fruit; separate from collision input |
| Game | `public/games/fruit-ninja/logic.js`, `game.js` | Consume measured collision segments once; scoring/physics independent of cosmetic budgets |
| Measurements | core/host `diagnostics`, `scripts/audit/` | Separate sensor, packet, pose, RTT and frame timing; local JSON reports |

All tests live in `tests/`. The root package declares ES modules; the server alone uses `.cjs`, so redundant nested package manifests are unnecessary. Android source and Gradle wrapper remain under `native/android/`; machine SDK configuration and build caches are ignored.

## Construction layers

Stage 1 adds the server and host shell. Stage 2 adds the supplied game and shared engine/visual primitives. Stage 3 adds the controller, sensor capture and one-player relay. Stage 4 adds direct transport, queue/clock logic and Player 2. Stage 5 exposes diagnostics and smoothing controls, with shared filters/display support already present in the engine. Stage 6 adds native BLE source/receiver/APK. Stage 7 adds the export script and final verification.

The exact per-file ownership is `workshop/stages.json`. `workshop:kit` freezes the current source in the participant starter's `.workshop/reference/`, records per-file hashes and creates Stage 0. `workshop:stage` validates the preceding checkpoint before adding its own files. `workshop:verify` checks the cumulative file set, rejects premature/extra source and detects any byte difference. The stage switch is the only shared file rewritten at every checkpoint.

Fonts, QR code, renderer and native app are supplied reference assets. The workshop reconstructs this established implementation; it does not claim a freeform prompt can invent byte-identical procedural artwork. Generated feature work belongs in a separate copy after the final checkpoint.

## Limits to preserve

Sensor capture timestamps and network delivery timestamps serve different purposes. Echo RTT is a round trip, not physical one-way tracking latency. Browser motion pages stay visible; Android's user-started foreground service can keep running while the camera is open. Sensors measure wrist rotation, not absolute translation. Real phones, BLE support, HTTPS trust and Wi-Fi isolation remain physical acceptance checks.
