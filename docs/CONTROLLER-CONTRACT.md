# Shared controller and game contract

Protocol version 2 extends the existing BLE motion/center frames with buttons and dynamic profiles. All integer fields below use little endian.

## BLE service

| Characteristic | UUID | Direction |
|---|---|---|
| Service | 4d1a0001-9cf1-4ee3-a71b-9438ef5d3400 | Phone peripheral / laptop central |
| Motion | 4d1a0002-9cf1-4ee3-a71b-9438ef5d3400 | Phone notifications to laptop |
| Control | 4d1a0003-9cf1-4ee3-a71b-9438ef5d3400 | Phone notifications (cached indications supported) and laptop writes with response |

Native apps prefer the original control notification path and accept indication subscriptions from clients that cached the previous APK. Control edges remain ordered and bounded; fresh motion gets a turn between queued controls. Only held buttons send periodic refreshes; release edges always send immediately. Application-level profile acknowledgements and CRC/epoch validation remain required. Laptop writes serialize; profile transfer takes precedence over ping/feedback. Live sensor traffic suppresses unnecessary echo probes.

An initial transient GATT connection/discovery failure retries the already-selected phone once after 500 ms. No second picker opens. Initialization disconnects cannot start overlapping reconnect timers; notification listeners are cleaned before retry. Cancellation, revoked permissions, unsupported services and a second failed attempt stop normally. Later connection loss retains bounded session-safe reconnect handling.

After a successful verified connection, the host remembers that phone's id for its player slot. On reload, Bluetooth.getDevices supplies only devices the browser still permits. Connect reuses that saved grant instead of opening the pairing dialog again. Choose another phone explicitly opens the picker; missing/revoked grants fall back to normal selection. Device ids are local preferences, never gateway credentials. Initial operating-system pairing still belongs to the browser.

## Packet formats

| Packet | Bytes | Fields |
|---|---:|---|
| Motion | 20 | code 1; flags u8; sequence u16; capture ms u32; XYZW quaternion 4 × i16; speed u16; calibration epoch u16 |
| Captured center | 15 | code 2; calibration epoch u16; capture ms u32; XYZW quaternion 4 × i16 |
| Waiting center | 3 | code 2; epoch u16; first fresh pose in that epoch becomes neutral |
| Buttons | 7 | code 4; mask u16; button sequence u16; profile epoch u16 |
| Begin profile | 9 | code 0x40; transfer id u16; UTF-8 byte length u16; CRC32 u32 |
| Profile chunk | ≤20 | code 0x41; transfer id u16; exact byte offset u16; up to 15 data bytes |
| End profile | 3 | code 0x42; transfer id u16 |
| Profile acknowledgement | 6 | code 0x43; transfer id u16; status u8 (0 accepted); profile epoch u16 |
| Android wheel display rotation (optional) | 4 | opcode 0x44, Surface rotation u8 (0 through 3), profile epoch u16 |
| Android preset capability (Control read) | 2 | 0x45, version 1 |
| Select bundled profile | 10 | 0x46, transfer id u16, profile CRC32 u32, player u8, profile epoch u16 |
| Ping / pong | 5 | code 0x10 / 0x90; echoed timestamp token u32 |

Quaternion components use ±32767 and are normalized on decode. Speed uses 0.01 degrees/second. Motion flags bit 0 means active and bit 1 means fresh gyro. Capture clocks and sequence numbers unwrap independently.

Android 2.0.7 bundles the standard profiles. Their IDs are CRC32 values of the UTF-8 JSON returned by validateProfile with player and profileEpoch omitted. After reading the capability once per connection, the host can select a layout with one write. The phone replies with the usual 0x43 acknowledgement. Status 1 requests the full JSON for an unknown preset. A phone without the capability receives the full JSON directly.

One-byte legacy control commands remain: 1 starts a round, 3 suspends motion, 5 requests disconnect. Profile data is at most 4096 UTF-8 bytes. Both native receivers reject incomplete, reordered, oversized or bad-checksum transfers.

## Buttons

Bits 0–10 correspond to up, right, down, left, a, b, one, two, plus, minus and home. A snapshot includes all held controls. Button sequence and profile epoch prevent duplicate/old state from reactivating input. Release on pointer cancellation, lost capture, page hiding, disconnect and profile change. Native heartbeat snapshots refresh every 400 ms; the host releases held input after 1250 ms without a refresh.

## Profile schema

~~~json
{
  "id": "fruit-ninja",
  "title": "Fruit Ninja",
  "orientation": "portrait",
  "motion": "aim",
  "controls": [
    { "id": "a", "label": "Play", "action": "start" },
    { "id": "b", "label": "Practice", "action": "practice" },
    { "id": "plus", "label": "Pause", "action": "pause" },
    { "id": "home", "label": "Games", "action": "home" }
  ],
  "instruction": "Center your aim, then sweep your wrist.",
  "centerLabel": "Center aim",
  "player": 1,
  "profileEpoch": 42
}
~~~

Allowed orientations are portrait/landscape; motion modes are none/aim/steer. Control ids come from the fixed button vocabulary. Labels are at most 20 characters; titles 48, instructions 160 and center labels 24. Duplicate ids and invalid action names are rejected. Render labels as text, never injected markup. The laptop adds player and profileEpoch for each connection.

## Snapshot delivered to adapters

~~~javascript
{
  slot: 0, connected: true, ready: true, session: "ble:device:generation",
  name: "Phone", profileEpoch: 42,
  buttons: { a: true, b: false },
  pressed: { a: true }, released: { a: false },
  actions: { start: true },
  pressedActions: { start: true }, releasedActions: {},
  axes: { x: 0.5, y: 0.5, steer: 0 },
  displayAxes: { x: 0.5, y: 0.5 },
  motionLive: true, cutting: false, reset: true
}
~~~

The actual button objects include every supported id. Action objects use the selected profile's mappings. Multiple buttons mapped to one action remain held until all release. Edges survive short taps and are consumed once. x/y are normalized aim; steer is −1..1 measured grip rotation. A game must respect ready, cutting and reset rather than manufacturing a swipe.

displayAxes supplies capture-timed, interpolated coordinates for visible dots and blade tips. Its buffer adapts from 8 to 64 ms to the actual packet interval and arrival jitter; normal fast links retain a short delay. It holds the last measured endpoint during silence. Aim profiles also supply motionPath, an ordered batch of measured x/y positions with capture time poseTime, age in milliseconds, and per-vertex cutting/reset flags. Consume each batch once for collision. Wheel profiles supply displayAxes.steer with a maximum 36 ms interpolation delay and axes.steer with the latest measured steering. Centering and session changes clear the display buffer. Missing button heartbeats release held buttons without suspending a fresh gyro stream. Adapters without displayAxes can fall back to axes.

## Game entry and lifecycle

Register an entry in public/games/catalog.mjs:

~~~javascript
import { BUTTON_COUNTER_GAME } from './extension-template/adapter.mjs';
// Inside registerGames(registry, features):
registry.register(BUTTON_COUNTER_GAME);
~~~

Each entry has id, profile and create(context). Game/profile ids must match. Metadata can provide title, category, description, art and badge.

The returned adapter must implement:

- mount(container): create its own view; may be asynchronous.
- input(slot, snapshot): consume current state and action edges.
- pause(value = true): pause/resume without leaking active input.
- reset(options): restart game state.
- dispose(): remove its view, listeners, timers and resources.
- tick(dt, now): optional animation update called by the host.

Context provides container, feedback(data), notify(text) and onState({paused}). The registry protects against late asynchronous mounts replacing a newer selection. Dispose only the adapter's own view.

FruitAdapter also accepts optional roundOptions() and onOptions(options) from the host. Round options are practice (default false), splitScreen and durationSeconds (60/120/180/0; 0 means untimed). Both laptop and phone start/restart read the same selection. Pairing two BLE phones enables splitScreen; disconnect preserves the surviving lane and current round.

Fruit Ninja maps each phone's normalized axes and displayAxes into its own lane: slot 0 left, slot 1 right. Collision rejects the other lane's fruit. Desktop mouse coordinates are clamped to the left lane. While its left button is held, the mouse owns slot 0; incoming snapshots are cached and cannot reset/overwrite the stroke. Release, cancellation and source changes break the collision trail.

The embedded game reports pause state to its adapter. The host remembers automatically paused rounds and resumes only those on focus return. Pause duration is excluded from game timers and spawn/combo deadlines. Manual pause and iframe focus keep their expected behavior.

The phone app is unchanged when adding a game. Declare a profile and adapter, register the entry, then reload the host or use __controllerkit.registerGame(entry) for a local integration check.

Classic Fruit Ninja uses three shared lives. Each sliced bomb costs one life, and the third bomb ends the round. Dropped fruit is ignored with no damage or miss haptic. Practice remains unlimited with a 10-point bomb penalty. Starting a round preserves the host's calibration and seeds cached input before the first swing; iframe focus transfers do not trigger immediate background pause.

Native startup sends the captured center before the profile-ready acknowledgement and before new-epoch motion. Fresh captured anchors update receiver freshness and seed visual interpolation, so the first real movement does not get discarded by a stale-input reset. Ordinary button edges remain ordered and share turns with motion.

Fruit Ninja A starts only the initial idle round. It never resets an active or ended round. The game-over restart hint and keyboard action use Space.
