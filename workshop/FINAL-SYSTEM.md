# Final system: reusable Wii-style phone controller

Status: agreed product direction and implementation target. The current running code is the Air Slice reference game. The universal controller and racing integration need to be implemented and checked before participant prompts are published.

## The workshop goal

Build one phone controller that attendees can connect to different browser games. A laptop/projector runs the game. An Android phone or iPhone supplies buttons and wrist motion. The game chooses a controller profile and maps those inputs to its own actions.

The organizer handles OmniRoute providers and OpenCode connections. The workshop supplies the project starter, final design, stage explanations, one complete prompt per stage, checks and recovery checkpoints. Gameplay runs through the server and browser.

## Target interface

- Host: game picker, two player slots, QR pairing, connection status, game area and pause/restart controls.
- Phone: a responsive Wii-style remote with a D-pad, A/B, 1/2, plus/minus and Home controls. Show the current game, player and connection state. Keep touch targets large and respect phone safe areas.
- Motion actions: explicitly enable sensors and center the current grip. Use game-appropriate labels, such as Center aim or Center steering.
- Profiles: a game declares the controls, labels, orientation and mappings it needs. The same renderer builds the phone interface from that declaration.
- Visual reference: capture the finished host and phone screens, including the racing layout, before writing participant prompts. Those images and dimensions become the design reference for the building agent.

## Platform and connection

Use a shared mobile web interface as the Android/iOS foundation. Android Chrome and iPhone Safari must support pairing, touch controls and the available browser motion APIs. Sensor permission comes from a user action over trusted HTTPS. Buttons remain usable when motion is unavailable or declined.

Reuse the working room isolation, relay/WebRTC transport and captured-pose calibration where practical. Display the actual connection path. Preserve two independent player slots and clean up a departing controller without affecting the other player.

The existing Android BLE APK/source remains a useful motion reference and optional Android transport. It does not establish iPhone Bluetooth support. The cross-platform participant path is the phone browser.

## Shared controller contract

Lock down and document the actual message schema and game adapter API during implementation, before producing stage prompts.

- Every input belongs to a session and player, with a sequence number and capture timestamp.
- Button state uses stable control identifiers and includes press and release. Games receive neutral controller state and map it to their actions.
- Motion uses finite measured orientation, a captured calibration reference and a calibration epoch. Rotation drives aiming/steering; it does not measure absolute hand position.
- Commands such as centering, profile changes and pause preserve ordering. Frequent motion updates remain fresh instead of accumulating in a queue.
- Release held controls on pointer cancellation, page hiding, disconnect and game/profile changes. A racing accelerator must never remain stuck after a disconnect.
- Validate profile declarations. Render supported controls from data; profiles must not inject arbitrary markup or executable controller code.
- Game adapters initialize, consume player input, pause/reset and dispose. Switching games clears the previous game's state/resources and updates paired phones.

## First game integrations

| Game | Controller mapping | Completion demonstration |
|---|---|---|
| Fruit Ninja | Calibrated wrist motion controls the blade; profile buttons provide the chosen game actions. | Preserve the supplied renderer/rules and demonstrate slicing, centering and independent player input through the common adapter. |
| Original racing demo | Tilt or D-pad steers; labelled controls accelerate and brake; pause/restart remain available. | Drive using the same controller and switch back to Fruit Ninja without changing controller source. |
| Attendee game | Declare a profile and implement the documented game adapter. | A small new game consumes the same button/motion state and appears in the host picker. |

The racing demo uses original code and assets. Its controls can be inspired by kart racing; the workshop does not require Nintendo game files.

## Planned teaching stages

This is the proposed breakdown. Confirm the file boundaries and exact checks from the completed implementation.

| Stage | What it builds | Visible result |
|---|---|---|
| 1. Host and pairing | Server, host shell, phone shell and isolated player connections. | Scan a QR and see the correct player connect. |
| 2. Wii-style buttons | Shared layout, multi-touch button state and release handling. | The host input display responds to every press and release. |
| 3. Motion and centering | Permissions, sensor capture, calibrated orientation and button fallback. | Tilt moves the input display; recentering changes the reference without generating an action. |
| 4. Dynamic profiles and game adapters | Profile renderer, input contract, game picker and switching lifecycle. | Selecting a game updates paired phone controls and clears old input. |
| 5. Fruit Ninja integration | Adapter around the existing renderer and rules. | Play Fruit Ninja using the common controller. |
| 6. Racing integration | Original racing game and steering/throttle/brake profile. | Drive using the same controller and switch between both games. |
| 7. Verify and teach | Regression checks, cross-platform demos, clean export, starter checkpoints and final prompts. | Share a tested participant kit and an extension guide for attendee games. |

## Ready for participant prompts

Before publishing, demonstrate both game profiles; exercise buttons, permissions, centering, cancellation, reconnect and switching; and run the relevant automated checks. Try the actual Android/iPhone devices and workshop network separately from simulated browser checks.

Then derive stage ownership and prompts from the tested source. Follow [PROMPT-SPEC.md](PROMPT-SPEC.md) for presentation and completion rules. Each prompt must refer to the final visual design and fixed controller/game contracts.
