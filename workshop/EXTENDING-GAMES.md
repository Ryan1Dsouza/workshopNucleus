# Add an attendee game

Work in a copy of the complete dist/controllerkit-workshop/ export. Preserve the staged starter for reproducible checkpoints.

## Try the working template

In public/games/catalog.mjs add:

~~~javascript
import { BUTTON_COUNTER_GAME } from './extension-template/adapter.mjs';
~~~

Inside registerGames(registry, features), add:

~~~javascript
registry.register(BUTTON_COUNTER_GAME);
~~~

Reload the host. Choose Button Counter: the same phone app changes to a landscape profile with Add one/Subtract. Buttons update the counter. No APK rebuild is required for a new supported layout/profile.

## Build your game

Use docs/CONTROLLER-CONTRACT.md. Define a unique game/profile id, controls with action names, orientation and motion mode. Return an adapter with mount, input, pause, reset and dispose. tick is optional.

Consume snapshot.actions and pressedActions. Respect ready, reset and motionLive. Release input and dispose listeners/timers when leaving a game. Register the entry in catalog.mjs.

A racing exercise can map steering to axes.steer, acceleration/brake to actions, and pause/Home to platform actions. The template can also support a target game, paddle game or a small button-driven experience.

## Optional OpenCode feature prompt

Copy this block in the completed export:

~~~text
Read AGENTS.md, docs/CONTROLLER-CONTRACT.md, public/games/catalog.mjs and the working extension-template adapter.
Build a small original target game as a separate adapter and profile. A confirms a hit at the current calibrated aim, B resets the round, plus pauses and Home returns to Controller Lab. Use normalized axes.x/y and measured input; respect ready/reset and never manufacture motion.
Register the game in the catalog. Preserve Fruit Ninja, the shared controller protocol and previous tests. Use the same native phone app; express the new controls through the profile.
Add behavior checks for scoring, reset, pause and cleanup, then run npm test and a browser integration check. Explain the files changed and demonstrate game switching and updated phone labels. Do not change the frozen staged kit or claim real Bluetooth performance from a fixture.
~~~

This is model-written feature work. Its source may vary. Check the behavior rather than expecting equality with a supplied reference.
