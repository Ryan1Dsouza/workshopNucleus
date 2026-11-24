# Organizer teaching script — 2 PM to 5 PM

## Explain the project first

Say: “The phone is our Wii-style remote. It knows buttons and wrist orientation. The laptop runs games. A profile tells the remote which controls to show, and an adapter translates its input into a particular game.”

Show the neutral dashboard, then Controller Lab and Fruit Ninja. Point out that picking a game changes the phone UI while the app and Bluetooth connection stay the same.

Say: “Node serves the pages and app download. BLE carries gameplay input. OmniRoute gives us model access; OpenCode inspects code and runs our building tools.”

## Suggested event flow

| Time | Activity |
|---|---|
| 14:00–14:15 | Goal, final demonstration and controller/game architecture |
| 14:15–14:35 | OmniRoute/OpenCode setup, route/tool smoke test and phone app installation |
| 14:35–15:30 | Stages 1–5: controller foundation through playable Fruit Ninja |
| 15:30–15:40 | Pause, recovery and questions |
| 15:40–16:10 | Extension template and attendee game/profile exercise |
| 16:10–16:25 | Final checks, packaging and sharing |
| 16:25–16:45 | Compare models on a small feature in a separate export |
| 16:45–17:00 | Demonstrations and questions |

These are planning allocations. Rehearse on the actual venue devices/network. Provide the native apps and dependencies in advance where possible.

During setup, paste the smoke prompt from [PROMPTS.md](PROMPTS.md). It loads [CONTEXT.md](CONTEXT.md) and checks real file/terminal tools at Stage 0. Continue with the numbered [STAGE-PROMPTS.md](STAGE-PROMPTS.md) blocks. The session prompts also cover model switches, interruptions and recovery.

## Stage 1 — host and pairing

Say: “We establish the application shell and a reliable connection before giving input any game meaning. Each player gets its own session.”

Paste the Stage 1 block. Show the host, download QR and two player cards. With prepared phones, pair them independently. Explain that this QR downloads the app; it is not a Wi-Fi gameplay pairing code.

Check: disconnect one phone and confirm the other stays connected. The audit uses simulated GATT; distinguish that from your physical demonstration.

## Stage 2 — Wii-style buttons

Say: “A button has a press and a release. Multi-touch and cancellation matter: losing focus must not leave a future accelerator or action stuck.”

Show A/B, the D-pad, 1/2 and menu buttons. Hold two controls and release each. Compare the phone UI with the laptop input chips. Show keyboard/preview fallback for attendees without a phone.

Explain ButtonStore, the compact button snapshot and stale-profile rejection.

## Stage 3 — motion and centering

Say: “Sensor fusion gives us orientation. Centering captures the grip you want to use as neutral. Small wrist turns become small input movements.”

Hold still, center, turn slowly and sweep. Recenter while moving. Explain capture time versus delivery time and why an old packet must not undo a newer center.

Hover the mouse in Controller Lab and stop: the dot stays visible. Explain that displayAxes interpolates the visible motion between captured samples, while axes and movement flags remain immediate game input.

Check: centering changes the reference without generating a cut. State clearly that this measures rotation, not absolute hand position.

## Stage 4 — profiles and adapters

Say: “The controller understands input. The game decides what it means.”

Open the profile declaration and common snapshot contract. Explain controls, labels, actions, orientation and motion mode. Show the registry/lifecycle: mount, input, pause, reset and dispose.

Explain why switching clears old input and sends the new profile to both phones. The phone renderer receives data; it does not require another app for each game.

## Stage 5 — Fruit Ninja

Say: “We now connect a game to the controller. We reuse the supplied tested renderer and rules, then adapt our neutral input.”

Choose Fruit Ninja, select a timer and click Play or press A. If phone controls are still transferring, Preparing phones appears; the round starts automatically when ready, without another click. Classic starts by default: each bomb costs one shared life; the third bomb ends the round. Dropped fruit costs no life. Select Practice (or press B) to keep unlimited lives with a 10-point bomb penalty.

Hold the left mouse button and drag through fruit. Hover alone does not cut; the tip stays visible at rest. Mouse dragging works even while a phone sends motion. Pair two phones: Player 1 stays in the left lane, Player 2 in the right, with fruit and scoring assigned to their lane. Players keep separate scores and share the round's total, lives and timer.

Show 1, 2 and 3 minute choices and No limit before Play/Restart. Switch to another app, then return: the same round resumes and paused time is excluded. Manually pause and repeat: it stays paused. Show Enlarge game, Restore/Escape, and the visible Scan to install QR beside Player connections.

Explain the adapter boundary and separate collision/visual movement. Centering cannot cut fruit; smoothing cannot invent a swipe. Preserve OpenWii attribution.

## Stage 6 — your own game

Say: “A new game needs a profile and an adapter, not a rewritten phone app.”

Inspect the working Button Counter template. Register it in a completed export, change its labels and show the phone receiving the new orientation/actions. A adds, B subtracts. Dispose it and return to another game.

Have attendees ask OpenCode for a small game using the fixed adapter contract. The supplied template is the reliable starting point; creative code runs in its own export and is checked behaviorally.

## Stage 7 — verify and share

Say: “We check the promised behavior and package source that another laptop can run.”

Show cumulative source equality, unit/browser results and separate physical-device status. Export, then explain npm ci and npm start on another laptop.

## Explain what the AI did

The seven baseline prompts read and reconstruct frozen source. This keeps the workshop consistent across provider/model choices. Explain each restored layer and its checks; do not imply the model invented the supplied renderer.

For a coding comparison, give models the same bounded feature in separate exports. Ask them to preserve the existing tests and use the common contract, then compare actual output and checks.

## Recovery cue

If a stage fails: read the error, verify the current checkpoint, restore only the named reference file and rerun the checks. Keep manifest/reference intact. For provider errors, confirm the route/key/quota before retrying. Do not ask a model to weaken assertions.
