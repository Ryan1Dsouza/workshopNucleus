# Participant prompts

Complete [NEW-LAPTOP.md](NEW-LAPTOP.md), then paste the setup prompt below into OpenCode's Build agent. Copy only the text inside the code block.

After the setup passes, use [STAGE-PROMPTS.md](STAGE-PROMPTS.md) for Stage 1 through Stage 7, one prompt at a time. OpenCode reads [CONTEXT.md](CONTEXT.md) itself.

## 1. Setup and model/tool smoke prompt

Paste this once after starting OpenCode in starter/. It checks the actual route's ability to read files and run a command without applying any stage.

~~~text
Prepare this ControllerKit workshop session using actual file and terminal tools.

Read AGENTS.md, workshop/CONTEXT.md, package.json, public/stage.mjs, .workshop/state.json and the metadata plus Stage 1 ownership in .workshop/manifest.json. Do not read or print credentials.

Confirm the working directory is the generated kit's starter/, not the complete organizer project. If .workshop metadata is missing, report the correct workspace and stop. Do not create metadata, remove source or apply a stage.

If the checkpoint is already above 0, report it and use the Resume prompt instead of resetting anything. For a fresh Stage 0 starter, run node --version and npm run workshop:verify -- 0. It must pass source equality. If dependencies are missing, run npm ci and repeat verification.

Report the project name, start command, actual checkpoint, Node version and verification exit result. Name any unavailable required skills/MCP tools and the existing terminal audit fallback. Explain in three sentences the phone-to-game architecture, the role of OpenCode/OmniRoute and why we use frozen-source reconstruction.

Do not modify application source or start Stage 1. Stop and report whether this setup smoke check passed. Actual tool output is required; do not answer from assumptions.
~~~

## 2. Build the seven stages

Paste the complete numbered blocks from [STAGE-PROMPTS.md](STAGE-PROMPTS.md), in this order:

| Prompt | Visible result |
|---|---|
| [Stage 1](STAGE-PROMPTS.md#stage-1--host-and-bluetooth-pairing) | Host, app download QR and independent BLE slots |
| [Stage 2](STAGE-PROMPTS.md#stage-2--wii-style-buttons) | Phone buttons and Controller Lab |
| [Stage 3](STAGE-PROMPTS.md#stage-3--motion-and-centering) | Smooth visible wrist aim, idle pointer and safe centering |
| [Stage 4](STAGE-PROMPTS.md#stage-4--profiles-and-game-adapters) | Profiles and adapter lifecycle |
| [Stage 5](STAGE-PROMPTS.md#stage-5--fruit-ninja-integration) | Fruit Ninja, two split lanes, timer and working mouse slicing |
| [Stage 6](STAGE-PROMPTS.md#stage-6--your-own-game-extension) | Working counter extension template |
| [Stage 7](STAGE-PROMPTS.md#stage-7--verification-and-packaging) | Final audits and portable source export |

After Stage 1 run npm start in a second terminal and open http://localhost:3000/host. Reload after each stage. Demonstration steps are in [TEACHING-SCRIPT.md](TEACHING-SCRIPT.md). A checkpoint's state file records installation; advance only after its required checks pass.

## 3. Resume after a new chat, model switch or interruption

~~~text
Resume the ControllerKit workshop from the actual files on disk.

Read AGENTS.md, workshop/CONTEXT.md, package.json, .workshop/state.json, .workshop/manifest.json and public/stage.mjs with file tools. If kit metadata is missing, report that this is not a staged starter and stop. Do not invent a checkpoint from chat history.

Run npm run workshop:verify with the installed stage's numeric argument. For installed Stage 1 or later, also run npm test and npm run audit:stage with that same numeric argument. For installed Stage 7, additionally run npm run audit:controller and npm run audit:filter. Inspect the actual reports. If anything fails, report the cause and use the Recovery prompt; do not advance.

Report installed checkpoint, actual checks and next numbered prompt. Do not install another layer, change the baseline or overwrite an existing export. If already at Stage 7, explain whether the complete export exists and point to the separate extension exercise.
~~~

## 4. Recover a failed checkpoint

~~~text
Diagnose and recover the current ControllerKit checkpoint without advancing it.

Read AGENTS.md, workshop/CONTEXT.md, .workshop/state.json, .workshop/manifest.json, public/stage.mjs and the failed command's output. Run source verification for the installed numeric stage. Inspect the first concrete failure and distinguish source drift from dependency/browser/tool problems.

If verification reports a Missing or Different file, confirm the file is owned by the installed or an earlier stage, confirm its frozen reference matches the manifest, and restore only that file. Use the existing stageContent helper in scripts/workshop/files.mjs for the expected bytes, particularly public/stage.mjs whose stage constant must match the installed checkpoint. Do not change reference files, hashes, tests, manifest, state or stage ownership. If an unexpected future-stage source file is present, report its path rather than deleting it automatically. A changed frozen reference requires an intact organizer kit.

If source equality passes, inspect the failing unit/browser command and report the actual cause. Restore a dependency installation with npm ci if needed; use the installed browser fallback or npx playwright install chromium if the browser executable is missing. Do not rewrite valid baseline source to work around an environment error, and do not weaken assertions.

Rerun source verification, npm test and the installed stage's browser audit after a repair; Stage 0 requires source verification only. Repeat any other required command that failed. Inspect browser reports and the screenshot when tools support it.

Report the cause, exact restoration/environment action, commands and exit results, and any remaining blockers or physical-device checks. Stop at this checkpoint; do not execute the next stage or fabricate a passing result.
~~~

## 5. After Stage 7

Copy starter/dist/controllerkit-workshop/ to a separate workspace for [EXTENDING-GAMES.md](EXTENDING-GAMES.md). The seven-stage baseline deliberately restores supplied source. Use the later bounded feature prompt to demonstrate original model-written code while preserving the controller contract.
