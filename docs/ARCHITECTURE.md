# ControllerKit architecture

ControllerKit separates a phone remote from the games it controls. Node serves the laptop dashboard, assets and app download page. Gameplay button/motion input crosses BLE between the native phone app and the laptop browser.

~~~mermaid
flowchart LR
  UI[Shared phone UI] --> Native[Android / iOS bridge]
  Sensors[Gyro + accelerometer fusion] --> Native
  Native -->|BLE buttons / orientation / center| Receiver[Laptop BLE receiver]
  Receiver --> State[Common controller state]
  State --> Adapter[Selected game adapter]
  Adapter --> Game[Fruit Ninja / attendee game]
  Picker[Host game picker] -->|Profile JSON over BLE| Native
  Native --> UI
  Node[Node server] -->|Pages and APK downloads| Picker
~~~

## Responsibilities and files

| Part | Implementation | Contract |
|---|---|---|
| Host shell | public/host/index.html, host.css, hub.mjs | Pair players, display connection state, pick adapters and download the app |
| BLE receiver | core/bluetooth-link.js, ble-protocol.js | Two independent device/session records, fresh motion, ordered commands and serialized writes |
| Shared input | core/controller-state.js, controller-contract.js | Stable button ids, action edges, profile epochs, watchdog release and normalized motion |
| Motion mapping | motion-input.js, pose-pointer.js, orientation.js | Captured neutral grip and proportional measured rotation; center creates no cut |
| Profile catalog | controller-profiles.js, games/catalog.mjs | Game-selected controls and action mappings |
| Adapter lifecycle | game-registry.js | mount, input, pause, reset, dispose; optional tick |
| Phone UI | controller/index.html, phone.css, phone-ui.mjs | Render supported controls from profiles; send press/release and native commands |
| Native Android | MainActivity, MotionService, FrameCodec, ProfileTransfer | Offline WebView, BLE peripheral, fused sensor quaternion and captured center |
| Native iPhone | ControllerViewController, ControllerPeripheral, FrameCodec | Same offline UI, CoreBluetooth peripheral and CoreMotion orientation |
| Fruit Ninja | games/fruit-ninja/adapter.mjs, embedded.mjs, game.js, logic.js | Use common state through an isolated rendering frame |

## Input and calibration

Phones expose the BLE service; desktop Chrome/Edge acts as the central. Two player slots have distinct device ids and session generations. A disconnect clears only that slot. Button snapshots carry a separate profile epoch so a delayed packet cannot restore controls from the previous game.

Native sensor fusion produces an XYZW quaternion. MotionInput binds a captured pose to its calibration epoch and maps wrist rotation to normalized aim. Steering also exposes rotation around the grip's device axis. Sensor capture time, delivery time and calibration/profile epochs have different meanings.

Collision consumes measured motion once. The visual blade can interpolate measured endpoints, but visual frames cannot submit new collision travel. Centering, stale data and discontinuities break strokes.

## Game switching

The host releases old buttons and motion, increments the profile epoch, disposes the old adapter and selects the new one. It transfers a validated profile to each phone with bounded, checksummed BLE chunks. Controls become ready after the matching acknowledgement. The phone changes its UI from data and clears held touches.

The Fruit Ninja adapter reuses the supplied renderer/logic in an iframe. Its embedded mode receives normalized state from the parent and does not open another BLE/phone link. This preserves its artwork and game rules while using the common controller.

## Teaching checkpoints

Stage 0 is the starter/tooling. Stage 1 installs the host and prepared native/BLE foundation. Stage 2 exposes the shared remote and button lab. Stage 3 binds motion/calibration. Stage 4 adds profiles and the game registry. Stage 5 connects Fruit Ninja. Stage 6 supplies the extension template. Stage 7 adds final audits/export and retained transport regression references.

The exact file ownership is workshop/stages.json. public/stage.mjs is the one shared feature file rewritten at every checkpoint. Early checkpoints run with later modules absent; the native app/UI bundle is prepared in advance and controlled by the host's stage profile.

See [CONTROLLER-CONTRACT.md](CONTROLLER-CONTRACT.md) for exact APIs and [VERIFICATION.md](VERIFICATION.md) for what has been checked.
