# ControllerKit

A reusable Wii-style phone controller and a neutral laptop game dashboard. Native Android/iPhone bridges provide BLE and sensors; both apps host the same offline HTML/CSS interface. Games receive a shared controller state and choose their button labels, motion mode and actions through profiles.

The workshop release includes Controller Lab, the supplied OpenWii Fruit Ninja game and a small extension template. Racing is a future attendee exercise.

## Run the complete application

Use current Node.js 22 LTS or 24 LTS and desktop Chrome/Edge. [Platform setup](workshop/PLATFORMS.md) covers Windows/macOS/Linux browser dependencies, shell syntax and Linux's experimental physical Web Bluetooth support.

~~~sh
npm ci
npm start
~~~

Open http://localhost:3000/host. If another application owns that port:

~~~powershell
$env:PORT = "3001"
npm start
~~~

On macOS/Linux Bash or Zsh, use PORT=3001 npm start.

Scan **Scan to install** beside Player connections, or click **Connect phones** for the larger QR and installation guide. Put the phone and laptop on the same Wi-Fi/hotspot, download the supplied [Android APK](public/downloads/air-slice-ble.apk), install it and open ControllerKit. Allow Nearby devices and start Bluetooth. Connect a player in the laptop's player dock, choose a game and center your grip. The QR is for app downloads; gameplay input uses BLE.

Use **Enlarge game** beside Fruit Ninja's Play/Pause/Restart controls for a larger play surface. **Restore size** or Escape returns to the dashboard while preserving the round and paired phones.

The [iPhone project](native/ios/README.md) needs a Mac, Xcode and signing before installation. Its source and shared UI are supplied; Windows checks do not establish an iOS build or physical Bluetooth readiness.

## Organizer and participant material

- [Workshop guide](workshop/README.md): scope, preparation and teaching order.
- [New-laptop setup](workshop/NEW-LAPTOP.md): transfer, dependencies, model smoke check and gameplay.
- [Platform setup](workshop/PLATFORMS.md): Windows, macOS and Linux prerequisites and validation coverage.
- [OpenCode session prompts](workshop/PROMPTS.md): setup, resume, recovery and stage order.
- [Model context](workshop/CONTEXT.md): architecture, supplied-source reconstruction and completion rules.
- [Stage prompts](workshop/STAGE-PROMPTS.md): copy one complete labelled block per stage.
- [Teaching script](workshop/TEACHING-SCRIPT.md): short explanations and demonstrations.
- [Controller contract](docs/CONTROLLER-CONTRACT.md): message formats, profiles and adapter API.
- [Game extension guide](workshop/EXTENDING-GAMES.md): connect attendee games to the same app.

Create a participant kit and clean complete source export:

~~~sh
npm run workshop:kit
npm run export:workshop
~~~

Outputs are dist/controllerkit-kit/ and dist/controllerkit-workshop/. Share the full starter including .workshop/. The source equality checks use a supplied frozen reference. The current root is the complete Stage 7 application; participants work inside kit/starter/.

## Project layout

| Folder | Responsibility |
|---|---|
| server/ | Local webpages, downloads, LAN address discovery and retained room-isolation contracts |
| public/host/ | Neutral dashboard, game library, BLE pairing and controller preview |
| public/controller/ | Shared Wii-style phone UI and input handling |
| public/core/ | BLE protocol, shared state, calibration, profiles, adapter registry and reusable helpers |
| public/games/ | Catalog, Controller Lab, Fruit Ninja and extension template |
| native/android/ | Android BLE/sensor foreground service and offline UI container |
| native/ios/ | iPhone CoreBluetooth/CoreMotion bridge, Xcode project and same UI |
| tests/ | Unit checks and simulated GATT fixture |
| scripts/ | Audits, native preparation, kit creation and reconstruction tools |
| workshop/, docs/, licenses/ | Teaching material, contracts, visual reference and attribution |

## Checks

~~~sh
npm test
npm run audit:stage -- 7
npm run audit:controller
npm run audit:filter
npm run test:native-protocol
~~~

The native byte check needs JDK 17+. Browser checks use simulated GATT/sensors. Check real phones separately; see [verification](docs/VERIFICATION.md).

Fruit Ninja uses Patrick Sun's MIT OpenWii source. Exact attribution and the original source revision remain in [licenses/](licenses/OpenWii-source.json).
