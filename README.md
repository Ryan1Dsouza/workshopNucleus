# Controller workshop / Air Slice reference

The workshop target is a reusable Wii-style phone controller for Android and iOS, with dynamic controls for Fruit Ninja, an original racing demo and attendee games. Start with the [final-system brief](workshop/FINAL-SYSTEM.md) and [workshop guide](workshop/README.md).

The current working source is Air Slice: a two-player phone-motion Fruit Ninja-style browser game built on the MIT OpenWii source. It supplies the tested game, calibration and transport reference for the redesign. Play with a mouse, browser phone sensors over Wi-Fi/WebRTC, or the Android Bluetooth controller.

## Run the finished game

Requires Node.js 22+ and a current desktop browser with WebGL 2.

~~~sh
npm ci
npm start
~~~

Open [http://localhost:3000/host](http://localhost:3000/host). Drag with the mouse button held, or scan a phone QR code, enable motion and tap **Center blade** in your natural grip. At 1.0×, a 60° wrist rotation spans the screen width. Phone sensors measure rotation, not absolute hand position.

Local HTTPS runs at port 3443 and creates a private development certificate in `.local/`. Phones need HTTPS and motion permission. For a trusted HTTPS tunnel, open the host through the tunnel before scanning; host and phone should share a private network for direct WebRTC. See [network setup](workshop/NETWORK-CHECK.md).

Android: install/update [the Bluetooth v1.2 APK](public/downloads/air-slice-ble.apk), start Bluetooth in the app, then connect it from Chrome/Edge on the host. This update fixes captured-pose centering and preserves background camera recording. See [Android setup and builds](native/android/README.md).

## Workshop

The new controller stages are described in [FINAL-SYSTEM.md](workshop/FINAL-SYSTEM.md). Their participant prompts will follow [PROMPT-SPEC.md](workshop/PROMPT-SPEC.md) after the complete implementation is tested.

The existing [stage prompts](workshop/STAGE-PROMPTS.md) and [new-laptop walkthrough](workshop/NEW-LAPTOP.md) belong to the previous Air Slice reference workshop. Its source reconstruction tools remain available:

~~~sh
npm run workshop:kit
~~~

That command creates an Air Slice reference kit under `dist/air-slice-kit/`, including its hidden `.workshop/` directory. Its seven stages are:

1. Server and projector shell.
2. Fruit Ninja and desktop blade.
3. One phone, sensors and Center blade over the relay.
4. Direct WebRTC and two players.
5. Measurements and smooth motion.
6. Android Bluetooth; live Android demonstration is optional.
7. Verification and clean export.

The current root contains all seven reference layers. Run reference reconstruction prompts inside their generated starter. Frozen source and SHA-256 checks establish exact source equality; physical phone behavior requires device checks. Old generated bundles and reports were archived in the [cleanup](docs/CLEANUP.md).

## Project layout

| Folder | Purpose |
|---|---|
| `server/` | HTTP/HTTPS, room pairing, signaling and relay |
| `public/host/` | Projector UI, setup and diagnostics |
| `public/controller/` | Browser phone UI and raw sensors |
| `public/core/` | Shared aiming, calibration, transports and visual support |
| `public/games/fruit-ninja/` | Game logic and procedural Three.js renderer |
| `native/android/` | Android BLE controller source and Gradle wrapper |
| `tests/` | All automated unit checks and fixtures |
| `scripts/audit/`, `scripts/native/`, `scripts/workshop/` | Browser audits, Android packaging and stage tooling |
| `workshop/`, `docs/`, `licenses/` | Prompts/setup, architecture and attribution |

Read [architecture](docs/ARCHITECTURE.md), [the Center blade contract](docs/CENTER-BLADE.md) and [cleanup notes](docs/CLEANUP.md).

## Checks and sharing

~~~sh
npm test
npm run audit:stage -- 7
npm run audit:browser
npm run audit:bluetooth
npm run audit:filter
npm run test:native-protocol
npm run export:workshop
~~~

The native protocol check requires a JDK. Browser audits use Playwright Chromium, an installed Chrome/Edge fallback, or `BROWSER_EXECUTABLE`. Reports go to `test-results/`. Automated sensor/GATT data are simulated; validate the actual workshop phones and network before presenting.

The clean source export is `dist/air-slice-workshop/`. Exports refuse to overwrite a nonempty folder; use `--out <new-folder>` for a new destination. `PORT`, `HTTPS_PORT` and `LOCAL_HTTPS=0` configure the server.

## Credits

Adapted from OpenWii, copyright Patrick Sun, MIT licensed. [Exact source revision](licenses/OpenWii-source.json) and [MIT license](licenses/OpenWii-MIT.txt) are retained. The Permanent Marker font uses the Apache license; the QR library license stays in `public/vendor/`.
