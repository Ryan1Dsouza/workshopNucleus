# Final system and release scope

ControllerKit is a reusable Wii-style phone controller for laptop games. Native Android/iPhone bridges handle BLE and sensor fusion. Both embed the same offline UI. The laptop dashboard owns pairing, the game catalog, profiles and adapters.

## Release

The application includes a neutral host, two independent BLE player slots, Wii-style buttons, calibrated wrist motion, reliable centering, dynamic profiles, Controller Lab and Fruit Ninja. A small button-counter template demonstrates attendee game integration. A full racing game is outside this release.

The Android APK is built from the supplied source. The iPhone Xcode project is supplied and needs Mac/signing/device checks; no Windows check establishes its compilation or radio performance.

## Interface target

- Host: neutral game library, large play area and a two-player dock with a visible Scan to install QR. Connect phones opens the larger QR and installation guide. Playable games offer Enlarge game with Restore/Escape; keyboard input and the controller preview stay available.
- Phone: tactile D-pad, A/B, plus/minus/Home and 1/2; readable profile labels, 48-pixel touch targets, current game/player, connection status, motion toggle and prominent Center action. Paired connection controls live in Controller options.
- Profiles: game-selected labels/actions/orientation with supported controls rendered from data.
- Games: common input snapshot and adapter lifecycle, with cleanup during switching.
- Motion: capture-timed displayAxes for fluid visible motion; immediate measured collision input. Idle mouse and connected-phone pointers remain visible.
- Fruit Ninja: Classic by default, explicit Practice, held-mouse slicing, two split lanes with confined BLE pointers and lane-owned fruit, separate scores and shared lives. Each bomb costs one life; missed fruit is ignored. Select 1/2/3 minutes or No limit before starting. Background pause resumes automatically; manual pause persists.

See [UI-DESIGN.md](../docs/UI-DESIGN.md), the implementation references in docs/screenshots/ and [CONTROLLER-CONTRACT.md](../docs/CONTROLLER-CONTRACT.md).

## Stage plan

| Stage | Layer | Result |
|---|---|---|
| 1 | Host and BLE/native foundation | Neutral page, downloadable app and isolated paired slots |
| 2 | Wii buttons/shared UI | Touch/keyboard press-release and input lab |
| 3 | Motion/calibration | Measured wrist aim; safe captured-pose centering |
| 4 | Profiles/adapters | Shared action mappings and catalog/lifecycle |
| 5 | Fruit Ninja | Supplied renderer/game connected through its adapter |
| 6 | Game extension | Small working counter template and extension guide |
| 7 | Checks/export | Complete verified source and participant kit |

The native foundation and engine are prepared for the workshop. Participants reconstruct the baseline from checked source and use a separate export for model-written features.

## Boundaries

Gameplay uses BLE. The network downloads the app and serves laptop content. Wrist sensors measure rotation, not absolute room position. Centering and visual interpolation cannot manufacture a slice. Device/session/profile epochs protect against late data.

Native app installation, real BLE pairing and iPhone signing require the actual hardware/tools. Keep that status separate from source equality and simulated checks.
