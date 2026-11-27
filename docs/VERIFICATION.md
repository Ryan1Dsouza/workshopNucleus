# Verification — ControllerKit 2.0

The Android 2.0.3 steering audit includes a timed Chrome replay, a signed APK build and the physical-device verification boundary. [BLE steering audit](BLE-STEERING-AUDIT.md)

## Observed software results

A fresh Stage 0 starter installed its pinned dependencies and advanced sequentially through all seven checkpoints. Source equality, units and the staged browser checks passed at each layer.

| Stage | Passing unit checks | Passing browser checks |
|---|---:|---:|
| 1 | 36 | 4 |
| 2 | 36 | 5 |
| 3 | 70 | 7 |
| 4 | 72 | 8 |
| 5 | 127 | 29 |
| 6 | 127 | 30 |
| 7 | 133 | 30 |

The final browser checks exercise multi-touch, two simulated BLE slots, captured centering, interpolated displayAxes, dynamic profiles, decoded BLE motion slicing Fruit Ninja, extension disposal and player isolation. Fruit regressions cover mouse slicing without a phone and during active phone motion, harmless hover/release, one-life bomb damage, harmless dropped fruit, last-bomb game over, first-Play input, Practice penalties, two confined split lanes, both phones slicing lane-owned fruit, selected timer/expiry, automatic background resume and preserved manual pause. Game enlargement preserves the round/profile and clean stroke boundaries; Restore and iframe Escape work, including when browser fullscreen is rejected.

Playwright MCP checked the split-screen desktop and 390 × 844 mobile layouts, 44-pixel timer selectors and both visible pointers. Playwright and Chrome DevTools MCP reported zero console errors after fixing absent optional audio/favicon requests; required missing assets still return 404.

Chrome DevTools traced empty, eight-fruit and maximum-load rendering (24 fruits, 48 halves, 256 instanced particles) on this Windows laptop at a 1032 × 448 drawing buffer. Steady normal rendering measured about 144 FPS; the extreme frozen load measured about 134 FPS. It costs more GPU/CPU work, but does not explain the broken mouse collision. Cold material frames previously took about 191/97 ms. Loading-time shader compilation and texture preparation removed game-frame calls over 50 ms in the subsequent trace; the observed maximum was about 33 ms when creating the extreme load. Nine shader programs remained constant across all three loads. These measurements isolate rendering with frozen entities; they do not measure physical BLE latency or certify every laptop.

The redesigned interface follows [UI-DESIGN.md](UI-DESIGN.md). Its native HTML rendered from a local file with both embedded fonts, an enabled Center action and no browser errors, failed requests or external stylesheet links. The connected remote fits the checked 390 × 844 viewport. The APK's controller asset matches the current native source exactly.

Android assembleDebug and lintDebug passed. The APK used in that workshop rehearsal had versionName 2.0.2, versionCode 6, minimum SDK 26 and target SDK 35. Java/JavaScript checks passed for motion, center, buttons, bounded UTF-8 transfer, malformed data and fair bounded native motion/control scheduling. iOS project/resources and the matching UI bundle passed the packaging check; Xcode compilation remains a Mac check.

The Bluetooth reliability update prefers control notifications (cached indications remain supported), skips idle button refreshes and live-link echo probes, and removes the extra host input filter. The display buffer adapts to uneven 25 Hz delivery. Playwright/DevTools MCP measured zero stationary animation frames during a steady simulated sweep where the previous buffer paused repeatedly; a standard 60 Hz run also retained smooth presentation and safe centering. The user reported successful automatic connection and smoother motion on their Android setup; occasional pauses and first-Play behavior were subsequently addressed and remain part of the device follow-up. Simulated results do not establish performance on other phones. Initial-connection regressions cover one successful retry with no second picker, repeated failure, permission rejection, cancellation, and a disconnect during notification setup. The staged browser audits inject that first failure and verify profile switches do not reconnect the devices.

Reports remain under test-results/controller/, test-results/stages/, test-results/fruit-mcp/ and test-results/ui-rehearsal/ in the organizer workspace; generated reports are excluded from the clean source export. The refreshed starter rehearsal runs stages sequentially on Node 22 with source equality, units and browser checks at each checkpoint. The fruit-load trace and desktop/mobile references accompany the organizer's local report.

## Required external checks

- Physical Android: the user reported successful connection and smoother motion with app 2.0.2. Long-run stability, the final first-Play behavior, camera use and other phones still need device checks. Simulated GATT results do not certify radio performance.
- Mac/iPhone: source/project/resources are supplied. Xcode compilation, signing and physical iPhone behavior remain unverified on this Windows machine.
- OpenCode model route: the organizer must run the authenticated OmniRoute model/tool smoke prompt before teaching. The source reconstruction rehearsal does not exercise an authenticated model route.

The [new-laptop guide](../workshop/NEW-LAPTOP.md) includes that model smoke check. The [venue/device checklist](../workshop/NETWORK-CHECK.md) covers physical validation.

## Meaning of the checks

SHA-256 establishes equality with supplied source. Units and browser fixtures establish covered software behavior. Echo RTT is a round trip; it does not measure physical sensor-to-screen latency. Model-written extensions need behavioral checks in separate exports.

Slow profile-transfer browser checks verify that the first Play queues while phones prepare, does not launch uncuttable fruit, then automatically starts a round in which the first gyro sweep cuts. Captured-center tests verify freshness and valid first movement after a pause. Startup calibration is sent before profile readiness/new-epoch motion. The initial fruit wave begins after 100 ms once the round is ready.

After the sequential rehearsal above, the controller browser audit and a focused Playwright MCP check passed the Space restart regression: A cannot restart an ended round, the game-over hint reads Space to play again, and an actual keyboard Space starts the next round. Desktop and mobile screenshots were reviewed; Playwright and Chrome DevTools MCP reported no console errors. The shared staged browser suite now includes this additional regression.
