# ControllerKit: context for OpenCode

Read this file with file tools before applying a workshop prompt, and read it again after switching models or starting a new chat. The task is to reconstruct the supplied ControllerKit application one verified stage at a time. Use the provided implementation as the source of truth. Inspect it, restore it with the workshop tools, explain how it works and verify the result.

## Outcome

The laptop shows a neutral game dashboard. An Android phone or iPhone acts as a Wii-style remote with buttons and wrist motion. Two independent player slots share one controller contract. Selecting a game changes the phone's controls through a profile. Controller Lab and the supplied OpenWii Fruit Ninja are the baseline games; Button Counter demonstrates extensions.

The Android APK, native bridges, shared offline phone UI and Fruit Ninja engine are supplied. Preserve their implementation and attribution. An original game can be written later in a separate completed export.

## Where to work

| Location | Purpose | Action |
|---|---|---|
| Organizer project | Complete Stage 7 source; usually has no root .workshop/state.json | Create a participant kit here; do not downgrade or remove its application files |
| Generated kit's starter/ | Participant workspace; begins at Stage 0 | Run all baseline stage commands here |
| starter/.workshop/reference/ | Frozen complete implementation, including later stages | Read source here; never edit it |
| starter/dist/controllerkit-workshop/ | Complete source export after Stage 7 | Copy elsewhere for original feature work |

Read package.json, .workshop/state.json, .workshop/manifest.json and public/stage.mjs to establish the actual workspace and checkpoint. Missing .workshop metadata means this is not a staged starter. Stop baseline stage work and report the correct directory; do not fabricate metadata or convert the organizer project into a starter.

## Source of truth

For reconstruction, use these sources together:

1. AGENTS.md supplies workspace instructions and tool/skill requirements.
2. .workshop/manifest.json records exact file ownership and SHA-256 hashes for this kit. It is the authority for which files belong to each stage.
3. .workshop/reference/ contains the actual supplied implementation. Read the requested stage's important text files before restoring them. Native binaries, fonts and other bundled assets should be copied byte for byte.
4. .workshop/state.json records the installed checkpoint. It does not prove that unit or browser checks passed.
5. public/stage.mjs controls which features are available. Its stage constant is the one expected cumulative change to an earlier file; the stage tool generates its expected bytes.
6. docs/CONTROLLER-CONTRACT.md defines protocol and adapter APIs; docs/ARCHITECTURE.md explains the components. workshop/FINAL-SYSTEM.md defines release scope.
7. docs/screenshots/ supplies the final visual references. Preserve the supplied interface through its existing HTML, CSS and JavaScript. Earlier stages deliberately show fewer features.

workshop/stages.json describes ownership in the organizer source. Use the frozen manifest in a participant kit, rather than editing this description to accommodate changes.

## Architecture

There are two separate flows:

- Build time: you give OpenCode a prompt; OpenCode calls a model through the OmniRoute gateway and uses local file/terminal tools to inspect, assemble and check the project.
- Play time: the native phone app sends BLE buttons, orientation and center packets to the laptop browser. The browser updates common controller state, which the selected game adapter consumes. Node serves pages, assets and app downloads.

The host sends profiles back over the same BLE connection. The phone renders the supported controls and labels from profile data. OmniRoute and OpenCode are unnecessary for gameplay. The download QR installs the phone app; it is not a gameplay pairing code.

| Component | Important source | Responsibility |
|---|---|---|
| Local server | server/index.cjs | Host pages, assets, download URLs and retained room contracts |
| Host dashboard | public/host/index.html, host.css, hub.mjs | Game selection, two player slots, preview, keyboard input and download QR |
| BLE transport | public/core/bluetooth-link.js, ble-protocol.js | Device/session isolation, notifications and serialized control/profile writes |
| Input contract | public/core/controller-contract.js, controller-state.js | Stable button vocabulary, action edges, readiness and profile epochs |
| Shared phone UI | public/controller/index.html, phone.css, phone-ui.mjs | Profile-driven controls, simultaneous touches and press/release handling |
| Native bridge | native/android/, native/ios/, native/shared/ | Offline UI container, BLE peripheral and measured sensor orientation |
| Motion | public/core/motion-input.js, pose-pointer.js, orientation.js | Captured neutral pose, measured wrist aim and safe stroke resets |
| Profiles and adapters | public/core/controller-profiles.js, game-registry.js; public/games/catalog.mjs | Action mappings, game registration and lifecycle |
| Fruit Ninja | public/games/fruit-ninja/adapter.mjs, embedded.mjs, game.js, logic.js | Supplied renderer/rules consume common input through an embedded frame |
| Extension example | public/games/extension-template/adapter.mjs | Working Button Counter with a landscape profile |

Some of these files are absent in early checkpoints. Inspect them under .workshop/reference/ when they belong to the requested stage. Do not import or restore future layers early.

## Behavior to preserve

- Each BLE slot has its own device/session generation. Disconnecting or resetting one player must preserve the other player.
- First-pairing transient GATT failures retry the selected phone once after 500 ms, without a second picker or overlapping discovery. Preserve cleanup and cancellation; permission/service failures and a second failure must remain visible.
- Successful pairing remembers the phone per player. Reconnect uses an existing browser grant without reopening pairing; Choose another phone selects a different device. Revoked/missing grants still require selection. Do not bypass browser permissions.
- Preserve the 2.0.2 low-latency transport: prefer control notifications while supporting cached indication subscriptions, keep ordered button/profile edges, and give fresh motion a turn between controls. Only held buttons need refreshes; quiet links can be probed, active gyro links do not need echo traffic. Missing button refreshes release buttons without resetting fresh motion. Keep application-level profile acknowledgement and validation.
- Fixed button ids are up, right, down, left, a, b, one, two, plus, minus and home. Handle simultaneous input, short taps, release, pointer cancellation, lost capture and page hiding. Disconnect and profile change clear held input.
- Profiles choose controls, labels, actions, orientation and motion mode. Validate them; render labels as text. Serialize bounded, checksummed profile chunks and require a matching acknowledgement before input becomes ready.
- Motion measures wrist orientation, not absolute hand position. Keep the 20-byte motion and 15-byte captured-center formats, capture clocks, sequence ordering and calibration epochs compatible with both native bridges.
- Centering, stale data, quiet corrections and visual smoothing must not manufacture a slice. Collision uses immediate axes and cutting/reset flags; displayAxes uses capture-timed interpolation only for the visible dot/blade. Idle mouse hover and quiet connected phones retain visible aim without cutting.
- Keep extra host input filtering disabled. Presentation delay adapts from 8 to 64 ms to packet cadence/jitter; do not force a long delay on fast links or extrapolate beyond measured endpoints. The embedded game presents host displayAxes without adding another animation-frame wait. Update the Android APK to 2.0.2 when testing this transport; older APKs retain their previous sending behavior.
- Switching games releases old input and disposes the previous adapter's own view, listeners and timers. Preserve protection against late asynchronous mounts.
- Adapters implement mount(container), input(slot, snapshot), pause(value), reset(options) and dispose(); tick(dt, now) is optional. Use common axes, actions and action edges; respect ready, cutting and reset. Consult the exact contract before explaining details.
- Fruit Ninja starts Classic by default. Each bomb costs one shared life; the third bomb ends the round. Dropped fruit costs no life and produces no miss haptic. Explicit Practice retains unlimited lives and deducts 10 points for a bomb. Hold the left mouse button and drag to slice; a held mouse stroke owns Player 1 input even while a phone sends snapshots. Release/cancellation resets the stroke before returning to phone input.
- Two Bluetooth phones enable two split-screen lanes. Phone axes/displayAxes map into their own half; Player 1 uses the left, Player 2 the right. Fruit stays in its assigned lane and only that player's blade can cut it. Keep separate player scores, the combined total and existing shared-life rules. The laptop can also select two lanes before pairing.
- Choose 1, 2 or 3 minutes, or No limit, before Play/Restart. Phone start/restart uses these same selections. Automatic background pause resumes the same round on return, excluding paused time from the timer, spawn difficulty and combo deadlines. Manual pauses remain paused; clicking inside the game iframe must not pause it.
- Warm Three.js materials/textures during loading before fruit-ready. Preserve bounded fruit, halves and instanced particles; do not replace the renderer or lower game difficulty based on guesses about lag. Optional missing audio overrides use synthesized cues without console errors.
- Fruit Ninja uses the existing shared BLE connection. Preserve artwork, audio, scoring, practice/Classic rules and OpenWii attribution. A starts the first round only; Space plays again, B selects practice, 1 selects Classic, plus pauses, minus/2 restart and Home returns to Controller Lab.
- A full racing game is an optional later exercise and is outside the seven-stage baseline.

## Stages and inspection targets

These are reading targets, not a substitute for the manifest's complete file list.

| Stage | Layer | Read before restoring | Demonstrate after checks |
|---|---|---|---|
| 0 | Starter/tooling | package.json, manifest/state, scripts/workshop/stage.mjs and verify.mjs | Starter is valid; no host yet |
| 1 | Host and Bluetooth pairing | server/index.cjs, public/host/hub.mjs, core BLE/contract/state files; native bridge entry points | Host/download QR; two independent slots, empty controls and motion disabled |
| 2 | Wii-style buttons | controller/phone-ui.mjs, phone.css; games/controller-lab/adapter.mjs | Simultaneous presses/releases in the remote and lab; motion stays disabled |
| 3 | Motion and centering | core/motion-input.js, pose-pointer.js, orientation.js; controller/sensors.mjs | Calibrated wrist aim; center breaks the stroke without a cut |
| 4 | Profiles and game adapters | core/controller-profiles.js, game-registry.js; games/catalog.mjs | Validated profile mapping, game lifecycle and phone updates |
| 5 | Fruit Ninja integration | games/fruit-ninja/adapter.mjs, embedded.mjs, game.js and logic.js | A starts the first round; Space plays again; measured motion slices real rendered fruit; score/restart work |
| 6 | Your own game extension | games/extension-template/adapter.mjs; workshop/EXTENDING-GAMES.md | Counter template changes phone labels/orientation; disposal works |
| 7 | Verification and packaging | scripts/workshop/export.mjs, scripts/audit/controller.mjs; manifest-owned regression sources | Final checks and portable complete source export |

Stage 6 supplies a template; it does not add a new original game to the baseline catalog. The audit registers it dynamically. Catalog customization belongs in a separate completed export.

## Execution and completion

Use OpenCode's Build agent and a tool-capable OmniRoute route. Prose responses alone cannot complete these prompts. Keep model input bounded: read this context, the stage block, relevant contracts and the owned source rather than loading the entire reference tree into chat.

For a requested stage N:

1. Read the actual state. If it is N-1, verify that checkpoint before applying N. If it is N, resume checks for N. If it is anything else, report the mismatch and stop; do not jump stages or downgrade.
2. Run npm run workshop:verify -- CURRENT_STAGE with the actual numeric checkpoint. Inspect errors before any mutation.
3. Read the manifest's owned files and the relevant reference source. Explain briefly which component supplies the visible behavior.
4. Run npm run workshop:stage -- N only when advancing from N-1. This tool validates and copies the owned layer, updates public/stage.mjs and records the installed checkpoint.
5. Run npm run workshop:verify -- N, npm test and npm run audit:stage -- N in order. A zero exit status is required for each; diagnose a failure before continuing to the next command. In Stage 7 also run the final controller/filter audits, native-resource check and export listed in its prompt.
6. Read the browser JSON report and inspect the captured screenshot when tools support it. Report the actual results. Stop after N; the next stage requires its own prompt.

Use the exact numbered commands in STAGE-PROMPTS.md; do not type CURRENT_STAGE or N as literal command arguments. If a fresh chat lacks evidence for an installed checkpoint's unit/browser results, rerun those checks before advancing.

Never mark a failed stage complete. A browser dependency, unavailable JDK, gateway failure or hardware step should be reported by its actual cause, separately from source equality. Historical results in docs/VERIFICATION.md are background, not evidence from this run.

## Tools, environment and recovery

Read workshop/PLATFORMS.md for OS prerequisites, shell syntax and current validation coverage. The stage commands are portable Node/npm commands; do not substitute PowerShell-only file operations on macOS/Linux. Report which platform is actually running the checks. Physical Linux Web Bluetooth is experimental and separate from the simulated browser audits.

Current Node.js 22 LTS or 24 LTS and pinned npm dependencies are recommended. Use npm ci in the starter before the first stage; preserve package.json and package-lock.json. After Stage 1, npm start serves http://localhost:3000/host. Use a second terminal and reload after each stage. If needed, set PORT to 3001 in that server terminal using the shell-specific syntax in workshop/NEW-LAPTOP.md.

Follow AGENTS.md for relevant skills and MCP tools. Report any unavailable required tool or skill. Use the existing npm browser audits through the terminal if Playwright MCP is unavailable; this is a scripted Playwright check. Chrome DevTools MCP is for investigating browser problems and Context7 is for unfamiliar library APIs. Preserve existing UI source during reconstruction. Load frontend-design before any original interface changes in the later extension exercise.

Browser audits use simulated GATT and sensor input. Their stage reports are test-results/stages/stage-N.json and stage-N.png. The complete controller audit writes test-results/controller/report.json and screenshots. Use installed Chrome/Edge through the audit's browser fallback; if no supported executable is present, install the pinned Playwright browser with npx playwright install chromium and rerun the failed audit.

If verification reports Missing or Different, restore only the named file from .workshop/reference/ after confirming it belongs to the installed stage. public/stage.mjs must use the current installed stage constant, not the reference's final constant. Keep manifest, reference and state intact. The stage command does not repair a modified checkpoint automatically; use the Recovery prompt in PROMPTS.md. If the frozen reference itself differs, report the problem and recover from the organizer's intact kit.

Keep gateway/provider credentials outside application source. The supplied OpenCode configuration points to http://localhost:20128/v1 and reads OMNIROUTE_API_KEY from the terminal environment. Do not print keys, inspect credential stores or write keys into Markdown. A listed workshop-free model does not create that combo in OmniRoute; the organizer must select a working tool-capable route and pass the setup smoke prompt.

Native byte checks require JDK 17+. iOS resource checks on Windows verify supplied files only. Physical Android BLE behavior and Mac/Xcode signing/build/iPhone behavior require separate device checks. Report these according to what was actually observed.

## Report after each stage

Keep the report short and use this structure:

- Checkpoint: requested stage, installed stage, complete or incomplete.
- Source: restored layer and important files read; source equality result.
- Behavior: what became available and how the components connect.
- Checks: commands actually run, exit results and report/screenshot paths.
- Pending: missing tools, failed checks or physical-device steps.
- Next: stop here and name the next stage; do not execute it.

Play, Restart, phone start actions and embedded Space start requests wait for any connecting/preparing phone profiles. Show Preparing phones and queue one start; begin automatically after the required controllers acknowledge their controls. Cancel start or changing games cancels the queued request. Never run a fruit round with cutting disabled because its phone profile is still transferring. Native setup sends captured Center before ready acknowledgement; newly received anchors seed interpolation and input freshness.
