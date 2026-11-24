# OmniRoute + OpenCode controller workshop

The prepared application is ControllerKit: one Wii-style phone remote, a neutral laptop dashboard and a common input contract for games. Today's release includes Controller Lab and Fruit Ninja. The extension stage supplies a small working template for attendee games.

## Start here

1. Organizers read [ORGANIZER-SETUP.md](ORGANIZER-SETUP.md), [TEACHING-SCRIPT.md](TEACHING-SCRIPT.md), [FINAL-SYSTEM.md](FINAL-SYSTEM.md) and [device preparation](NETWORK-CHECK.md).
2. Participants follow [NEW-LAPTOP.md](NEW-LAPTOP.md) in the supplied starter.
3. Start with [PROMPTS.md](PROMPTS.md) for setup, then copy one complete labelled build block per stage from [STAGE-PROMPTS.md](STAGE-PROMPTS.md). Each prompt loads the shared [CONTEXT.md](CONTEXT.md).
4. Extend a clean completed export with [EXTENDING-GAMES.md](EXTENDING-GAMES.md).

Windows, macOS and Linux use the same stage commands. Prepare the matching shell/browser/JDK setup with [PLATFORMS.md](PLATFORMS.md); only Windows has been rehearsed here so far.

## Prepare before the session

Run the final checks, build the Android APK and prepare/sign the iPhone app on a Mac if demonstrating iPhone. Check the actual venue laptop and phones. The native foundation and game engine are provided so the live session can focus on interfaces, input, profiles and integration.

~~~sh
npm ci
npm test
npm run audit:stage -- 7
npm run audit:controller
npm run test:native-protocol
npm run workshop:kit
npm run export:workshop
~~~

Give attendees dist/controllerkit-kit/, keeping starter/.workshop/. A transfer ZIP is supplied with the final kit. The root is complete Stage 7; starter/ is Stage 0.

## Teaching order

| Stage | Suggested build time | Demonstration |
|---|---:|---|
| 1. Host and pairing | 10 min | Two isolated BLE slots and download QR |
| 2. Wii-style buttons | 10 min | Multi-touch press/release in the input lab |
| 3. Motion and centering | 10 min | Calibrated wrist aim; center creates no cut |
| 4. Profiles and adapters | 10 min | Shared schema, action mappings and game registry |
| 5. Fruit Ninja | 15 min | Native A starts the first round; Space plays again; motion slices; scoring/restart work |
| 6. Your own game | 10 min | Working counter template and new profile |
| 7. Verify/package | 10 min | Clean complete source export |

These are planning estimates. Stages 1–5 total 55 minutes after setup. Model quotas, downloads and physical device setup affect session timing.

The reconstruction prompts use supplied source and hashes. OpenCode inspects, assembles, runs checks and explains each layer. A separate exercise asks the model to write a feature in an exported copy. The setup does not claim freeform generation yields byte-identical source.

Provider keys remain in OmniRoute. The OpenCode [example](opencode.workshop.example.json) reads the gateway key from OMNIROUTE_API_KEY. Confirm that workshop-free exists as a saved combo and select a tool-capable route before the model smoke check.

## Verification status

See [VERIFICATION.md](../docs/VERIFICATION.md). Browser/GATT fixtures establish covered application behavior, not physical radio performance. iPhone source requires a Mac build and actual phone checks.
