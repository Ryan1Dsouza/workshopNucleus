# Air Slice reference: copy-paste stage prompts

Scope: the previous Fruit Ninja-focused reference workshop. These prompts rebuild the current Air Slice source. For the new reusable controller target, read [FINAL-SYSTEM.md](FINAL-SYSTEM.md) and [PROMPT-SPEC.md](PROMPT-SPEC.md). Its participant prompts follow implementation and verification of that target.

Use these in the generated `dist/air-slice-kit/starter` folder after `npm ci` and provider setup. Paste one block at a time, in order. The participant app starts at Stage 0; the finished project root is already at Stage 7.

These prompts **reconstruct the supplied source**, rather than asking a model to invent an equivalent renderer. The reference, per-file stage ownership and SHA-256 verification make source equality testable. Hardware behavior still requires the network/phone check.

## Stage 1: Server and projector shell

Suggested time: 10 minutes. Outcome: A running Node server and responsive projector shell, with no game or phone input yet.

```text
Build Stage 1 only of this Air Slice workshop.
Read AGENTS.md, workshop/stages.json, docs/ARCHITECTURE.md and the Stage 1 entries in .workshop/manifest.json. Inspect the corresponding frozen files in .workshop/reference before changing the active app.

Restore the Node/Express/Socket.IO server and the responsive projector shell. Keep the existing room isolation and health endpoints. The host must load without importing the game, phone transport or Bluetooth receiver. Verify /api/health and /host. There must be no Play button or phone card visible at this checkpoint.

Reconstruct this layer exactly with:
npm run workshop:stage -- 1

This command restores only this stage's files and its feature configuration. Explain the important implementation after inspecting those files. Keep the frozen reference and prior stages byte-for-byte intact. Keep provider credentials out of the game and APK.

Then run:
npm run workshop:verify -- 1
npm test
npm run audit:stage -- 1

Do not advance to the next stage in this turn. If a check fails, inspect its cause and restore the affected stage-owned file from the frozen reference; do not weaken assertions. Report the files added, the visible behavior, the commands that actually passed, and any real-device check remaining. A source hash pass alone is not a browser or physical-device pass.
```

## Stage 2: Fruit Ninja and desktop blade

Suggested time: 20 minutes. Outcome: The supplied OpenWii 3D game runs locally; a held mouse drag cuts fruit.

```text
Build Stage 2 only of this Air Slice workshop.
Read AGENTS.md, workshop/stages.json, docs/ARCHITECTURE.md and the Stage 2 entries in .workshop/manifest.json. Inspect the corresponding frozen files in .workshop/reference before changing the active app.

Restore the supplied MIT OpenWii game, its 3D renderer, the blade overlay, audio and the core motion/visual support modules. Preserve the procedural fruit and wood scene exactly. Activate desktop play only. A held mouse drag must cut fruit; practice mode forgives misses and Classic uses three lives. Phone, Bluetooth and diagnostics controls remain hidden.

Reconstruct this layer exactly with:
npm run workshop:stage -- 2

This command restores only this stage's files and its feature configuration. Explain the important implementation after inspecting those files. Keep the frozen reference and prior stages byte-for-byte intact. Keep provider credentials out of the game and APK.

Then run:
npm run workshop:verify -- 2
npm test
npm run audit:stage -- 2

Do not advance to the next stage in this turn. If a check fails, inspect its cause and restore the affected stage-owned file from the frozen reference; do not weaken assertions. Report the files added, the visible behavior, the commands that actually passed, and any real-device check remaining. A source hash pass alone is not a browser or physical-device pass.
```

## Stage 3: Phone sensors and Center blade

Suggested time: 20 minutes. Outcome: One phone pairs by QR and controls a calibrated blade through the explicitly labeled server relay.

```text
Build Stage 3 only of this Air Slice workshop.
Read AGENTS.md, workshop/stages.json, docs/ARCHITECTURE.md and the Stage 3 entries in .workshop/manifest.json. Inspect the corresponding frozen files in .workshop/reference before changing the active app.

Restore the browser controller, SensorStream, calibrated MotionInput and the relay adapter. Activate one phone. Keep this checkpoint on the server relay so the next stage has an observable transport change. Center blade must use a captured pose plus epoch, work on touch/Enter/Space, reject older epochs and preserve the grip when the reliable command arrives late. Small yaw/pitch movements are proportional; centering never creates a cut.

Reconstruct this layer exactly with:
npm run workshop:stage -- 3

This command restores only this stage's files and its feature configuration. Explain the important implementation after inspecting those files. Keep the frozen reference and prior stages byte-for-byte intact. Keep provider credentials out of the game and APK.

Then run:
npm run workshop:verify -- 3
npm test
npm run audit:stage -- 3

Do not advance to the next stage in this turn. If a check fails, inspect its cause and restore the affected stage-owned file from the frozen reference; do not weaken assertions. Report the files added, the visible behavior, the commands that actually passed, and any real-device check remaining. A source hash pass alone is not a browser or physical-device pass.
```

## Stage 4: Direct WebRTC and two players

Suggested time: 20 minutes. Outcome: Two isolated phone sessions use direct WebRTC, reliable commands and relay fallback.

```text
Build Stage 4 only of this Air Slice workshop.
Read AGENTS.md, workshop/stages.json, docs/ARCHITECTURE.md and the Stage 4 entries in .workshop/manifest.json. Inspect the corresponding frozen files in .workshop/reference before changing the active app.

Restore the direct WebRTC transport, latest-only motion queue and motion clock. Activate Player 2. Use unordered motion with no retransmission, a separate reliable command channel and explicit Socket.IO relay fallback. Preserve the Stage 3 calibration contract. Both phones must have independent blades/scores; a departure hides only its own blade. Explain why capture time, sequence numbers and backpressure matter.

Reconstruct this layer exactly with:
npm run workshop:stage -- 4

This command restores only this stage's files and its feature configuration. Explain the important implementation after inspecting those files. Keep the frozen reference and prior stages byte-for-byte intact. Keep provider credentials out of the game and APK.

Then run:
npm run workshop:verify -- 4
npm test
npm run audit:stage -- 4

Do not advance to the next stage in this turn. If a check fails, inspect its cause and restore the affected stage-owned file from the frozen reference; do not weaken assertions. Report the files added, the visible behavior, the commands that actually passed, and any real-device check remaining. A source hash pass alone is not a browser or physical-device pass.
```

## Stage 5: Measurements and smooth motion

Suggested time: 15 minutes. Outcome: Motion check, blade-only mode and measured smoothing comparisons become available.

```text
Build Stage 5 only of this Air Slice workshop.
Read AGENTS.md, workshop/stages.json, docs/ARCHITECTURE.md and the Stage 5 entries in .workshop/manifest.json. Inspect the corresponding frozen files in .workshop/reference before changing the active app.

Restore the Motion check UI, browser/filter/render audits and filtering checks. Expose the One Euro and BladeDisplay support already shared with the engine. Compare Direct/Light filtering separately from visual dot interpolation; neither can predict a slice. Show actual sensor/received/pose rates, echo RTT and frame work. Blade-only mode stops 3D rendering without moving the coordinate system. Run npm run audit:filter in addition to the standard stage checks.

Reconstruct this layer exactly with:
npm run workshop:stage -- 5

This command restores only this stage's files and its feature configuration. Explain the important implementation after inspecting those files. Keep the frozen reference and prior stages byte-for-byte intact. Keep provider credentials out of the game and APK.

Then run:
npm run workshop:verify -- 5
npm test
npm run audit:stage -- 5

Do not advance to the next stage in this turn. If a check fails, inspect its cause and restore the affected stage-owned file from the frozen reference; do not weaken assertions. Report the files added, the visible behavior, the commands that actually passed, and any real-device check remaining. A source hash pass alone is not a browser or physical-device pass.
```

## Stage 6: Android Bluetooth controller

Suggested time: 20 minutes. Outcome: The v1.2 APK supplies direct BLE motion and captured-pose centering; the live Android demonstration is optional.

```text
Build Stage 6 only of this Air Slice workshop.
Read AGENTS.md, workshop/stages.json, docs/ARCHITECTURE.md and the Stage 6 entries in .workshop/manifest.json. Inspect the corresponding frozen files in .workshop/reference before changing the active app.

Restore the BLE receiver, documented codecs, complete Android source/wrapper, native checks and the supplied v1.2 APK. Activate Bluetooth controls. The 15-byte Center command carries epoch, capture time and quaternion and must work in either GATT arrival order. Preserve two-player input isolation and the foreground-service camera workflow. Run npm run audit:bluetooth. If a JDK is installed, run npm run test:native-protocol; building Android is optional for participants using the supplied APK. Do not claim physical radio or recording performance from simulated checks.

Reconstruct this layer exactly with:
npm run workshop:stage -- 6

This command restores only this stage's files and its feature configuration. Explain the important implementation after inspecting those files. Keep the frozen reference and prior stages byte-for-byte intact. Keep provider credentials out of the game and APK.

Then run:
npm run workshop:verify -- 6
npm test
npm run audit:stage -- 6

Do not advance to the next stage in this turn. If a check fails, inspect its cause and restore the affected stage-owned file from the frozen reference; do not weaken assertions. Report the files added, the visible behavior, the commands that actually passed, and any real-device check remaining. A source hash pass alone is not a browser or physical-device pass.
```

## Stage 7: Verify and share the complete build

Suggested time: 10 minutes. Outcome: All source hashes and automated checks pass, then a clean runnable source export is created.

```text
Build Stage 7 only of this Air Slice workshop.
Read AGENTS.md, workshop/stages.json, docs/ARCHITECTURE.md and the Stage 7 entries in .workshop/manifest.json. Inspect the corresponding frozen files in .workshop/reference before changing the active app.

Restore the clean export script and activate the complete build. Run npm run audit:browser and npm run audit:bluetooth once after the standard stage checks. Run npm run export:workshop to a new/empty output folder. Confirm that source, lockfile, licenses and v1.2 APK are included while installed packages, certificates, SDK paths, native build output and workshop reference/state are excluded. Report the automated results and the separate real-phone checks still needed.

Reconstruct this layer exactly with:
npm run workshop:stage -- 7

This command restores only this stage's files and its feature configuration. Explain the important implementation after inspecting those files. Keep the frozen reference and prior stages byte-for-byte intact. Keep provider credentials out of the game and APK.

Then run:
npm run workshop:verify -- 7
npm test
npm run audit:stage -- 7

Do not advance to the next stage in this turn. If a check fails, inspect its cause and restore the affected stage-owned file from the frozen reference; do not weaken assertions. Report the files added, the visible behavior, the commands that actually passed, and any real-device check remaining. A source hash pass alone is not a browser or physical-device pass.
```

# Optional feature-writing exercise after Stage 7

Copy the completed source export into a separate folder. Ask different models routed through OmniRoute to add one small feature, such as a round timer or fruit-theme toggle, while keeping the existing input/collision tests passing. This is the exercise for comparing generated implementations; the seven reconstruction stages keep the workshop baseline consistent.
