# OmniRoute + OpenCode controller workshop

The workshop goal is a reusable Wii-style phone controller for Android and iOS, with game-selected layouts and a common input interface. Fruit Ninja and an original racing demo are the first integrations.

The organizer handles provider connections and OpenCode setup. The build material will explain each layer and provide one complete, checked prompt per stage.

## Start here

- [Final system and planned stages](FINAL-SYSTEM.md): the agreed target, interface, connection and game integration requirements.
- [Participant prompt format](PROMPT-SPEC.md): exactly what to copy, what each stage builds and how the agent must follow the final design.
- [OpenCode configuration](opencode.workshop.example.json): the organizer's provider/model entries with the gateway key read from the environment.
- [Network check](NETWORK-CHECK.md): practical phone/network preparation using the current reference application.

## Implementation status

The current source is the working Air Slice game and Android BLE v1.2 reference. The controller redesign, dynamic game profiles and racing demo are the next implementation work. New participant prompts and a matching starter are published after that system is tested.

The old [stage prompts](STAGE-PROMPTS.md), [stage ownership](stages.json) and [new-laptop guide](NEW-LAPTOP.md) remain reference material for the previous Air Slice reconstruction. Their kit/export tools describe that reference system. Previous generated bundles and obsolete instructions were moved to the external backup; see [cleanup record](../docs/CLEANUP.md).

## Provider setup

Save the included configuration as opencode.json in the participant project's root. Set OMNIROUTE_API_KEY to an enabled OmniRoute gateway key in the terminal that launches OpenCode. Provider connection keys remain in OmniRoute.

The configured localhost address refers to that laptop. A workshop-free entry requires an actual saved combo of that name in OmniRoute. Select a working tool-capable route and check file/tool access before construction prompts.
