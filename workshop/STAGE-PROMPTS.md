# ControllerKit — copy-paste OpenCode stage prompts

Work inside the generated controllerkit-kit/starter/ after [NEW-LAPTOP.md](NEW-LAPTOP.md). The starter begins at Stage 0; the organizer project is already Stage 7.

Start with the setup smoke prompt in [PROMPTS.md](PROMPTS.md). [CONTEXT.md](CONTEXT.md) explains the architecture and reconstruction rules. Each block below reloads this context, verifies its starting checkpoint, inspects the owned source and restores exactly one layer. Use the Resume or Recovery prompts after a model switch, interruption or failed check.

All numbered build/test commands use Node/npm and are shared by Windows, macOS and Linux. Prepare the browser/JDK and shell environment using [PLATFORMS.md](PLATFORMS.md) before Stage 1. Report the actual OS and results; source review is not a live run on another OS.

**Copy only the text inside one fenced block per stage.** The block follows COPY THIS PROMPT — STAGE N and ends before END OF STAGE N PROMPT. Leave the headings, fence markers, explanations and tables out of the pasted prompt.

These are exact reconstruction prompts: OpenCode reads the supplied implementation, restores the owned layer and runs checks. The model explains the code and result. It does not invent the supplied renderer/native foundation. A later [extension exercise](EXTENDING-GAMES.md) asks the model to write features in a separate complete export.

The native apps/engine are prepared beforehand. Android has a supplied APK; iPhone installation/build requires Mac/signing and separate device checks. GATT/browser fixtures do not certify physical Bluetooth.

## Stage 1 — Host and Bluetooth pairing

**Starting point:** Stage 0. **Suggested build time:** 10 minutes.

**What it builds:** Restore the neutral dashboard, download page/QR and BLE receiver with two isolated device/session slots. The native phone foundation and APK are supplied. At this checkpoint send an empty control profile with motion disabled. Keep the host independent of game/phone-UI modules that arrive later. A disconnect must clear only its own slot.

**What you get:** The neutral host loads; two isolated BLE slots accept assigned phone profiles. APK/native foundations are supplied.

### COPY THIS PROMPT — STAGE 1

~~~text
Build Stage 1 only of the ControllerKit workshop in this starter folder.

Read AGENTS.md, workshop/CONTEXT.md, workshop/FINAL-SYSTEM.md, docs/ARCHITECTURE.md and docs/CONTROLLER-CONTRACT.md with file tools. Use frozen-source reconstruction, preserving the supplied implementation.

Read .workshop/state.json, .workshop/manifest.json and public/stage.mjs before changing files. If kit metadata is missing, report that this is not the generated starter and stop; do not create metadata or remove organizer source. The installed stage must be 0 to advance, or 1 to resume this stage's checks. For any other checkpoint, report the mismatch and stop.

When starting from Stage 0, run npm run workshop:verify -- 0 before applying this layer. If earlier unit/browser results are unavailable after a new chat, rerun the installed stage's checks as described in workshop/CONTEXT.md. Inspect failures before any restoration; use workshop/PROMPTS.md Recovery if the checkpoint differs.

List the files owned by Stage 1 from the frozen manifest. Read the important text sources under .workshop/reference/, especially server/index.cjs, public/host/hub.mjs, public/core/bluetooth-link.js, public/core/ble-protocol.js, public/core/controller-contract.js and public/core/controller-state.js; inspect the Android/iPhone bridge entry points. Explain briefly how this layer produces the stated behavior. Treat APKs, fonts and bundled native UI as supplied assets; do not read binaries as text or regenerate them.

Read docs/UI-DESIGN.md for the shared visual tokens, player dock, connection dialog and profile-driven remote. Use docs/screenshots/host-dashboard.png and docs/screenshots/phone-portrait.png as the final visual reference. Preserve their layout/style through the supplied source, while keeping later-stage features unavailable at this checkpoint.

Restore the neutral dashboard, download page/QR and BLE receiver with two isolated device/session slots. The native phone foundation and APK are supplied. At this checkpoint send an empty control profile with motion disabled. Keep the host independent of game/phone-UI modules that arrive later. A disconnect must clear only its own slot.

If the installed checkpoint is 0, reconstruct this exact layer with the command below. If it is already 1, do not reinstall or advance; run the checks instead.
npm run workshop:stage -- 1

Preserve the frozen reference/manifest, earlier layers and attribution. Keep gateway/provider keys outside the application. Explain the implementation after reading the restored files. This stage must run with later source modules absent.

Then run:
npm run workshop:verify -- 1
npm test
npm run audit:stage -- 1

If JDK 17+ is available, run npm run test:native-protocol. Run node scripts/native/check-ios-package.mjs to check supplied project resources; this is not a Mac compilation or physical iPhone test.

If a check fails, inspect the cause and use the Recovery prompt in workshop/PROMPTS.md. Do not weaken checks or alter reference hashes. Read test-results/stages/stage-1.json and inspect stage-1.png when image/browser tools are available. Name unavailable required tools and use the existing terminal audit fallback. Stop after this stage. Report the checkpoint, important source read/restored, visible behavior, actual command exit results, report paths and physical-device checks pending. Do not infer radio or iPhone build readiness from a simulated test.
~~~

### END OF STAGE 1 PROMPT

**Check the result:** run the listed checks, then demonstrate the result from [TEACHING-SCRIPT.md](TEACHING-SCRIPT.md). Continue only after the current checkpoint passes.

## Stage 2 — Wii-style buttons

**Starting point:** Stage 1. **Suggested build time:** 10 minutes.

**What it builds:** Expose the shared offline Wii-style interface and Controller Lab. Use the D-pad, A/B, 1/2, plus/minus/Home and large touch targets from the final visual reference. Handle simultaneous pointers, press/release, cancellation, lost capture, keyup and page hiding. The desktop preview and input chips must reflect button state; keep motion disabled until Stage 3.

**What you get:** The shared remote and input lab show multi-touch presses/releases without stuck buttons.

### COPY THIS PROMPT — STAGE 2

~~~text
Build Stage 2 only of the ControllerKit workshop in this starter folder.

Read AGENTS.md, workshop/CONTEXT.md, workshop/FINAL-SYSTEM.md, docs/ARCHITECTURE.md and docs/CONTROLLER-CONTRACT.md with file tools. Use frozen-source reconstruction, preserving the supplied implementation.

Read .workshop/state.json, .workshop/manifest.json and public/stage.mjs before changing files. If kit metadata is missing, report that this is not the generated starter and stop; do not create metadata or remove organizer source. The installed stage must be 1 to advance, or 2 to resume this stage's checks. For any other checkpoint, report the mismatch and stop.

When starting from Stage 1, run npm run workshop:verify -- 1 before applying this layer. If earlier unit/browser results are unavailable after a new chat, rerun the installed stage's checks as described in workshop/CONTEXT.md. Inspect failures before any restoration; use workshop/PROMPTS.md Recovery if the checkpoint differs.

List the files owned by Stage 2 from the frozen manifest. Read the important text sources under .workshop/reference/, especially public/controller/phone-ui.mjs, public/controller/phone.css and public/games/controller-lab/adapter.mjs. Explain briefly how this layer produces the stated behavior. Treat APKs, fonts and bundled native UI as supplied assets; do not read binaries as text or regenerate them.

Read docs/UI-DESIGN.md for the shared visual tokens, player dock, connection dialog and profile-driven remote. Use docs/screenshots/host-dashboard.png and docs/screenshots/phone-portrait.png as the final visual reference. Preserve their layout/style through the supplied source, while keeping later-stage features unavailable at this checkpoint.

Expose the shared offline Wii-style interface and Controller Lab. Use the D-pad, A/B, 1/2, plus/minus/Home and large touch targets from the final visual reference. Handle simultaneous pointers, press/release, cancellation, lost capture, keyup and page hiding. The desktop preview and input chips must reflect button state; keep motion disabled until Stage 3.

If the installed checkpoint is 1, reconstruct this exact layer with the command below. If it is already 2, do not reinstall or advance; run the checks instead.
npm run workshop:stage -- 2

Preserve the frozen reference/manifest, earlier layers and attribution. Keep gateway/provider keys outside the application. Explain the implementation after reading the restored files. This stage must run with later source modules absent.

Then run:
npm run workshop:verify -- 2
npm test
npm run audit:stage -- 2

If a check fails, inspect the cause and use the Recovery prompt in workshop/PROMPTS.md. Do not weaken checks or alter reference hashes. Read test-results/stages/stage-2.json and inspect stage-2.png when image/browser tools are available. Name unavailable required tools and use the existing terminal audit fallback. Stop after this stage. Report the checkpoint, important source read/restored, visible behavior, actual command exit results, report paths and physical-device checks pending. Do not infer radio or iPhone build readiness from a simulated test.
~~~

### END OF STAGE 2 PROMPT

**Check the result:** run the listed checks, then demonstrate the result from [TEACHING-SCRIPT.md](TEACHING-SCRIPT.md). Continue only after the current checkpoint passes.

## Stage 3 — Motion and centering

**Starting point:** Stage 2. **Suggested build time:** 10 minutes.

**What it builds:** Bind native measured orientation to MotionInput and the common state. Enable wrist-motion controls and captured-pose centering. Preserve the 20-byte motion and 15-byte center formats, capture timestamps, epochs, late-command ordering, held aim and stroke reset. Centering/quiet corrections must never create a slice. Explain that sensors measure wrist rotation, not room position. Expose displayAxes for capture-timed visual interpolation while keeping axes/cutting/reset immediate for collision. Preserve notification-based native controls, fair motion/control scheduling and cached-indication compatibility. Keep extra host input filtering disabled and adapt the presentation buffer to actual packet cadence/jitter (8?64 ms). Keep idle mouse and quiet-phone pointers visible without creating a slice.

**What you get:** Native wrist motion moves a calibrated aim; centering uses a captured pose and never creates a cut.

### COPY THIS PROMPT — STAGE 3

~~~text
Build Stage 3 only of the ControllerKit workshop in this starter folder.

Read AGENTS.md, workshop/CONTEXT.md, workshop/FINAL-SYSTEM.md, docs/ARCHITECTURE.md and docs/CONTROLLER-CONTRACT.md with file tools. Use frozen-source reconstruction, preserving the supplied implementation.

Read .workshop/state.json, .workshop/manifest.json and public/stage.mjs before changing files. If kit metadata is missing, report that this is not the generated starter and stop; do not create metadata or remove organizer source. The installed stage must be 2 to advance, or 3 to resume this stage's checks. For any other checkpoint, report the mismatch and stop.

When starting from Stage 2, run npm run workshop:verify -- 2 before applying this layer. If earlier unit/browser results are unavailable after a new chat, rerun the installed stage's checks as described in workshop/CONTEXT.md. Inspect failures before any restoration; use workshop/PROMPTS.md Recovery if the checkpoint differs.

List the files owned by Stage 3 from the frozen manifest. Read the important text sources under .workshop/reference/, especially public/core/motion-input.js, public/core/pose-pointer.js, public/core/orientation.js and public/controller/sensors.mjs. Explain briefly how this layer produces the stated behavior. Treat APKs, fonts and bundled native UI as supplied assets; do not read binaries as text or regenerate them.

Read docs/UI-DESIGN.md for the shared visual tokens, player dock, connection dialog and profile-driven remote. Use docs/screenshots/host-dashboard.png and docs/screenshots/phone-portrait.png as the final visual reference. Preserve their layout/style through the supplied source, while keeping later-stage features unavailable at this checkpoint.

Bind native measured orientation to MotionInput and the common state. Enable wrist-motion controls and captured-pose centering. Preserve the 20-byte motion and 15-byte center formats, capture timestamps, epochs, late-command ordering, held aim and stroke reset. Centering/quiet corrections must never create a slice. Explain that sensors measure wrist rotation, not room position. Expose displayAxes for capture-timed visual interpolation while keeping axes/cutting/reset immediate for collision. Preserve notification-based native controls, fair motion/control scheduling and cached-indication compatibility. Keep extra host input filtering disabled and adapt the presentation buffer to actual packet cadence/jitter (8?64 ms). Keep idle mouse and quiet-phone pointers visible without creating a slice.

If the installed checkpoint is 2, reconstruct this exact layer with the command below. If it is already 3, do not reinstall or advance; run the checks instead.
npm run workshop:stage -- 3

Preserve the frozen reference/manifest, earlier layers and attribution. Keep gateway/provider keys outside the application. Explain the implementation after reading the restored files. This stage must run with later source modules absent.

Then run:
npm run workshop:verify -- 3
npm test
npm run audit:stage -- 3

If a check fails, inspect the cause and use the Recovery prompt in workshop/PROMPTS.md. Do not weaken checks or alter reference hashes. Read test-results/stages/stage-3.json and inspect stage-3.png when image/browser tools are available. Name unavailable required tools and use the existing terminal audit fallback. Stop after this stage. Report the checkpoint, important source read/restored, visible behavior, actual command exit results, report paths and physical-device checks pending. Do not infer radio or iPhone build readiness from a simulated test.
~~~

### END OF STAGE 3 PROMPT

**Check the result:** run the listed checks, then demonstrate the result from [TEACHING-SCRIPT.md](TEACHING-SCRIPT.md). Continue only after the current checkpoint passes.

## Stage 4 — Profiles and game adapters

**Starting point:** Stage 3. **Suggested build time:** 10 minutes.

**What it builds:** Restore controller profiles, the game catalog and adapter registry. Labels, supported controls, orientation and actions come from validated profile data. Physical buttons map to shared actions and one-shot action edges. Serialize bounded checksummed BLE profile chunks and require matching acknowledgements. Switching must clear held input and dispose only the previous adapter. Future games remain unavailable until their layers arrive.

**What you get:** Profiles define actions/layouts; adapters share one lifecycle and input contract.

### COPY THIS PROMPT — STAGE 4

~~~text
Build Stage 4 only of the ControllerKit workshop in this starter folder.

Read AGENTS.md, workshop/CONTEXT.md, workshop/FINAL-SYSTEM.md, docs/ARCHITECTURE.md and docs/CONTROLLER-CONTRACT.md with file tools. Use frozen-source reconstruction, preserving the supplied implementation.

Read .workshop/state.json, .workshop/manifest.json and public/stage.mjs before changing files. If kit metadata is missing, report that this is not the generated starter and stop; do not create metadata or remove organizer source. The installed stage must be 3 to advance, or 4 to resume this stage's checks. For any other checkpoint, report the mismatch and stop.

When starting from Stage 3, run npm run workshop:verify -- 3 before applying this layer. If earlier unit/browser results are unavailable after a new chat, rerun the installed stage's checks as described in workshop/CONTEXT.md. Inspect failures before any restoration; use workshop/PROMPTS.md Recovery if the checkpoint differs.

List the files owned by Stage 4 from the frozen manifest. Read the important text sources under .workshop/reference/, especially public/core/controller-profiles.js, public/core/game-registry.js and public/games/catalog.mjs. Explain briefly how this layer produces the stated behavior. Treat APKs, fonts and bundled native UI as supplied assets; do not read binaries as text or regenerate them.

Read docs/UI-DESIGN.md for the shared visual tokens, player dock, connection dialog and profile-driven remote. Use docs/screenshots/host-dashboard.png and docs/screenshots/phone-portrait.png as the final visual reference. Preserve their layout/style through the supplied source, while keeping later-stage features unavailable at this checkpoint.

Restore controller profiles, the game catalog and adapter registry. Labels, supported controls, orientation and actions come from validated profile data. Physical buttons map to shared actions and one-shot action edges. Serialize bounded checksummed BLE profile chunks and require matching acknowledgements. Switching must clear held input and dispose only the previous adapter. Future games remain unavailable until their layers arrive.

If the installed checkpoint is 3, reconstruct this exact layer with the command below. If it is already 4, do not reinstall or advance; run the checks instead.
npm run workshop:stage -- 4

Preserve the frozen reference/manifest, earlier layers and attribution. Keep gateway/provider keys outside the application. Explain the implementation after reading the restored files. This stage must run with later source modules absent.

Then run:
npm run workshop:verify -- 4
npm test
npm run audit:stage -- 4

If a check fails, inspect the cause and use the Recovery prompt in workshop/PROMPTS.md. Do not weaken checks or alter reference hashes. Read test-results/stages/stage-4.json and inspect stage-4.png when image/browser tools are available. Name unavailable required tools and use the existing terminal audit fallback. Stop after this stage. Report the checkpoint, important source read/restored, visible behavior, actual command exit results, report paths and physical-device checks pending. Do not infer radio or iPhone build readiness from a simulated test.
~~~

### END OF STAGE 4 PROMPT

**Check the result:** run the listed checks, then demonstrate the result from [TEACHING-SCRIPT.md](TEACHING-SCRIPT.md). Continue only after the current checkpoint passes.

## Stage 5 — Fruit Ninja integration

**Starting point:** Stage 4. **Suggested build time:** 15 minutes.

**What it builds:** Connect the supplied MIT OpenWii Fruit Ninja renderer/logic through FruitAdapter. Preserve its procedural artwork, audio, scoring, practice/Classic rules and attribution. The embedded game receives normalized common state and opens no second phone/BLE connection. Map profile actions to start, practice, Classic, pause/restart and Home. Measured BLE motion must slice through the actual renderer/game; centering must not. Keep collision input separate from visual blade interpolation. Preserve held-left-mouse slicing even during active phone snapshots. Start Classic by default (each bomb costs one shared life; the third bomb ends the round; dropped fruit costs no life); Practice is explicit with unlimited lives and a 10-point bomb penalty. Two Bluetooth phones enable two split lanes; constrain each pointer and fruit to its lane and prevent cross-lane cuts. Keep separate player scores and shared lives/total. Provide 1/2/3 minute or untimed selection before laptop/phone start or restart. Resume automatically paused rounds after focus returns, exclude paused time from timer/spawn/combo deadlines, and preserve manual pause. Warm Three.js materials/textures during loading before fruit-ready; preserve the renderer and bounded effects. Queue the first Play/Restart while connected phone profiles prepare, then start automatically after acknowledgement; test the first gyro sweep with deliberately slow profile writes. Run the supplied fruit-game browser regressions through the stage audit.

**What you get:** The supplied OpenWii game uses the shared controller for motion slicing, scoring, practice/Classic and restart.

### COPY THIS PROMPT — STAGE 5

~~~text
Build Stage 5 only of the ControllerKit workshop in this starter folder.

Read AGENTS.md, workshop/CONTEXT.md, workshop/FINAL-SYSTEM.md, docs/ARCHITECTURE.md and docs/CONTROLLER-CONTRACT.md with file tools. Use frozen-source reconstruction, preserving the supplied implementation.

Read .workshop/state.json, .workshop/manifest.json and public/stage.mjs before changing files. If kit metadata is missing, report that this is not the generated starter and stop; do not create metadata or remove organizer source. The installed stage must be 4 to advance, or 5 to resume this stage's checks. For any other checkpoint, report the mismatch and stop.

When starting from Stage 4, run npm run workshop:verify -- 4 before applying this layer. If earlier unit/browser results are unavailable after a new chat, rerun the installed stage's checks as described in workshop/CONTEXT.md. Inspect failures before any restoration; use workshop/PROMPTS.md Recovery if the checkpoint differs.

List the files owned by Stage 5 from the frozen manifest. Read the important text sources under .workshop/reference/, especially public/games/fruit-ninja/adapter.mjs, embedded.mjs, game.js and logic.js; trace common input into the supplied renderer. Explain briefly how this layer produces the stated behavior. Treat APKs, fonts and bundled native UI as supplied assets; do not read binaries as text or regenerate them.

Read docs/UI-DESIGN.md for the shared visual tokens, player dock, connection dialog and profile-driven remote. Use docs/screenshots/host-dashboard.png and docs/screenshots/phone-portrait.png as the final visual reference. Preserve their layout/style through the supplied source, while keeping later-stage features unavailable at this checkpoint.

Connect the supplied MIT OpenWii Fruit Ninja renderer/logic through FruitAdapter. Preserve its procedural artwork, audio, scoring, practice/Classic rules and attribution. The embedded game receives normalized common state and opens no second phone/BLE connection. Map profile actions to start, practice, Classic, pause/restart and Home. Measured BLE motion must slice through the actual renderer/game; centering must not. Keep collision input separate from visual blade interpolation. Preserve held-left-mouse slicing even during active phone snapshots. Start Classic by default (each bomb costs one shared life; the third bomb ends the round; dropped fruit costs no life); Practice is explicit with unlimited lives and a 10-point bomb penalty. Two Bluetooth phones enable two split lanes; constrain each pointer and fruit to its lane and prevent cross-lane cuts. Keep separate player scores and shared lives/total. Provide 1/2/3 minute or untimed selection before laptop/phone start or restart. Resume automatically paused rounds after focus returns, exclude paused time from timer/spawn/combo deadlines, and preserve manual pause. Warm Three.js materials/textures during loading before fruit-ready; preserve the renderer and bounded effects. Queue the first Play/Restart while connected phone profiles prepare, then start automatically after acknowledgement; test the first gyro sweep with deliberately slow profile writes. Run the supplied fruit-game browser regressions through the stage audit.

If the installed checkpoint is 4, reconstruct this exact layer with the command below. If it is already 5, do not reinstall or advance; run the checks instead.
npm run workshop:stage -- 5

Preserve the frozen reference/manifest, earlier layers and attribution. Keep gateway/provider keys outside the application. Explain the implementation after reading the restored files. This stage must run with later source modules absent.

Then run:
npm run workshop:verify -- 5
npm test
npm run audit:stage -- 5

If a check fails, inspect the cause and use the Recovery prompt in workshop/PROMPTS.md. Do not weaken checks or alter reference hashes. Read test-results/stages/stage-5.json and inspect stage-5.png when image/browser tools are available. Name unavailable required tools and use the existing terminal audit fallback. Stop after this stage. Report the checkpoint, important source read/restored, visible behavior, actual command exit results, report paths and physical-device checks pending. Do not infer radio or iPhone build readiness from a simulated test.
~~~

### END OF STAGE 5 PROMPT

**Check the result:** run the listed checks, then demonstrate the result from [TEACHING-SCRIPT.md](TEACHING-SCRIPT.md). Continue only after the current checkpoint passes.

## Stage 6 — Your own game extension

**Starting point:** Stage 5. **Suggested build time:** 10 minutes.

**What it builds:** Restore the working Button Counter extension template. It uses a new landscape profile and the same mount/input/pause/reset/dispose API. The browser audit registers it dynamically and proves that the existing phone app accepts new labels/actions without rebuilding. Keep the baseline catalog and previous files unchanged. Explain how attendees register/customize it in a separate complete export; do not add a full racing game.

**What you get:** A working button-counter adapter template demonstrates adding another profile without rebuilding the phone app.

### COPY THIS PROMPT — STAGE 6

~~~text
Build Stage 6 only of the ControllerKit workshop in this starter folder.

Read AGENTS.md, workshop/CONTEXT.md, workshop/FINAL-SYSTEM.md, docs/ARCHITECTURE.md and docs/CONTROLLER-CONTRACT.md with file tools. Use frozen-source reconstruction, preserving the supplied implementation.

Read .workshop/state.json, .workshop/manifest.json and public/stage.mjs before changing files. If kit metadata is missing, report that this is not the generated starter and stop; do not create metadata or remove organizer source. The installed stage must be 5 to advance, or 6 to resume this stage's checks. For any other checkpoint, report the mismatch and stop.

When starting from Stage 5, run npm run workshop:verify -- 5 before applying this layer. If earlier unit/browser results are unavailable after a new chat, rerun the installed stage's checks as described in workshop/CONTEXT.md. Inspect failures before any restoration; use workshop/PROMPTS.md Recovery if the checkpoint differs.

List the files owned by Stage 6 from the frozen manifest. Read the important text sources under .workshop/reference/, especially public/games/extension-template/adapter.mjs and workshop/EXTENDING-GAMES.md; inspect the profile and mount/input/pause/reset/dispose methods. Explain briefly how this layer produces the stated behavior. Treat APKs, fonts and bundled native UI as supplied assets; do not read binaries as text or regenerate them.

Read docs/UI-DESIGN.md for the shared visual tokens, player dock, connection dialog and profile-driven remote. Use docs/screenshots/host-dashboard.png and docs/screenshots/phone-portrait.png as the final visual reference. Preserve their layout/style through the supplied source, while keeping later-stage features unavailable at this checkpoint.

Restore the working Button Counter extension template. It uses a new landscape profile and the same mount/input/pause/reset/dispose API. The browser audit registers it dynamically and proves that the existing phone app accepts new labels/actions without rebuilding. Keep the baseline catalog and previous files unchanged. Explain how attendees register/customize it in a separate complete export; do not add a full racing game.

If the installed checkpoint is 5, reconstruct this exact layer with the command below. If it is already 6, do not reinstall or advance; run the checks instead.
npm run workshop:stage -- 6

Preserve the frozen reference/manifest, earlier layers and attribution. Keep gateway/provider keys outside the application. Explain the implementation after reading the restored files. This stage must run with later source modules absent.

Then run:
npm run workshop:verify -- 6
npm test
npm run audit:stage -- 6

If a check fails, inspect the cause and use the Recovery prompt in workshop/PROMPTS.md. Do not weaken checks or alter reference hashes. Read test-results/stages/stage-6.json and inspect stage-6.png when image/browser tools are available. Name unavailable required tools and use the existing terminal audit fallback. Stop after this stage. Report the checkpoint, important source read/restored, visible behavior, actual command exit results, report paths and physical-device checks pending. Do not infer radio or iPhone build readiness from a simulated test.
~~~

### END OF STAGE 6 PROMPT

**Check the result:** run the listed checks, then demonstrate the result from [TEACHING-SCRIPT.md](TEACHING-SCRIPT.md). Continue only after the current checkpoint passes.

## Stage 7 — Verification and packaging

**Starting point:** Stage 6. **Suggested build time:** 10 minutes.

**What it builds:** Restore final controller audits, clean export and retained regression references. Verify the complete UI/input/game and extension lifecycle, preserve source/lockfile/licenses/APK/native projects and exclude local credentials, SDK paths, installed packages, caches and workshop reference/state from the source export. Report Windows software checks separately from real Android/iPhone and Mac/Xcode checks.

**What you get:** Cumulative checks pass and a clean source export is created; retained transport references are included. Real Android/iPhone checks are reported separately.

### COPY THIS PROMPT — STAGE 7

~~~text
Build Stage 7 only of the ControllerKit workshop in this starter folder.

Read AGENTS.md, workshop/CONTEXT.md, workshop/FINAL-SYSTEM.md, docs/ARCHITECTURE.md and docs/CONTROLLER-CONTRACT.md with file tools. Use frozen-source reconstruction, preserving the supplied implementation.

Read .workshop/state.json, .workshop/manifest.json and public/stage.mjs before changing files. If kit metadata is missing, report that this is not the generated starter and stop; do not create metadata or remove organizer source. The installed stage must be 6 to advance, or 7 to resume this stage's checks. For any other checkpoint, report the mismatch and stop.

When starting from Stage 6, run npm run workshop:verify -- 6 before applying this layer. If earlier unit/browser results are unavailable after a new chat, rerun the installed stage's checks as described in workshop/CONTEXT.md. Inspect failures before any restoration; use workshop/PROMPTS.md Recovery if the checkpoint differs.

List the files owned by Stage 7 from the frozen manifest. Read the important text sources under .workshop/reference/, especially scripts/workshop/export.mjs, scripts/audit/controller.mjs and the retained regression sources owned by this stage. Explain briefly how this layer produces the stated behavior. Treat APKs, fonts and bundled native UI as supplied assets; do not read binaries as text or regenerate them.

Read docs/UI-DESIGN.md for the shared visual tokens, player dock, connection dialog and profile-driven remote. Use docs/screenshots/host-dashboard.png and docs/screenshots/phone-portrait.png as the final visual reference. Preserve their layout/style through the supplied source, while keeping later-stage features unavailable at this checkpoint.

Restore final controller audits, clean export and retained regression references. Verify the complete UI/input/game and extension lifecycle, preserve source/lockfile/licenses/APK/native projects and exclude local credentials, SDK paths, installed packages, caches and workshop reference/state from the source export. Report Windows software checks separately from real Android/iPhone and Mac/Xcode checks.

If the installed checkpoint is 6, reconstruct this exact layer with the command below. If it is already 7, do not reinstall or advance; run the checks instead.
npm run workshop:stage -- 7

Preserve the frozen reference/manifest, earlier layers and attribution. Keep gateway/provider keys outside the application. Explain the implementation after reading the restored files. This stage must run with later source modules absent.

Then run:
npm run workshop:verify -- 7
npm test
npm run audit:stage -- 7

Then run npm run audit:controller and npm run audit:filter. If JDK 17+ is available, run npm run test:native-protocol. Run node scripts/native/check-ios-package.mjs for supplied resources. Read test-results/controller/report.json and review its screenshots when tools support it.

After required software checks pass, run npm run export:workshop. The default output is dist/controllerkit-workshop/ and must be new or empty. If resuming with an existing export, verify that export instead of overwriting it; use -- --out dist/controllerkit-workshop-new only if a new copy is needed. Confirm exported source, package/lockfile, licenses, APK and native projects are present and .workshop/, node_modules/, local credentials, SDK paths and test reports are excluded. Do not claim the export is complete if a required check failed.

If a check fails, inspect the cause and use the Recovery prompt in workshop/PROMPTS.md. Do not weaken checks or alter reference hashes. Read test-results/stages/stage-7.json and inspect stage-7.png when image/browser tools are available. Name unavailable required tools and use the existing terminal audit fallback. Stop after this stage. Report the checkpoint, important source read/restored, visible behavior, actual command exit results, report paths and physical-device checks pending. Do not infer radio or iPhone build readiness from a simulated test.
~~~

### END OF STAGE 7 PROMPT

**Check the result:** run the listed checks, then demonstrate the result from [TEACHING-SCRIPT.md](TEACHING-SCRIPT.md). Continue only after the current checkpoint passes.

## After Stage 7

The complete export is starter/dist/controllerkit-workshop/. Make a separate copy for the model-written target-game exercise in [EXTENDING-GAMES.md](EXTENDING-GAMES.md). Keep the staged reference kit for recovery and repeatable teaching.
