# Participant prompt format

Status: instructions for preparing the new controller workshop prompts. This file is an organizer specification. The existing [Air Slice reference prompts](STAGE-PROMPTS.md) describe the previous game-specific workshop.

## One place to copy from

The new participant STAGE-PROMPTS.md will contain one numbered section per tested stage, in execution order. A participant should immediately know what the stage builds, what to copy, what success looks like and when to continue.

Every section must contain:

1. **Stage title and purpose:** explain the layer in plain language.
2. **Starting point:** required previous checkpoint, prerequisites and current features.
3. **What you get:** the visible screen, controls or game behavior after completion.
4. **COPY THIS PROMPT — STAGE N:** one complete fenced text block containing all instructions for that stage.
5. **END OF STAGE N PROMPT:** a clear marker after the block.
6. **Check the result:** commands that exist in the supplied project and a short manual demonstration.
7. **Recovery:** the supplied checkpoint and concrete steps to retry that stage.

Only the block between the copy/end markers is pasted into OpenCode. Explain prerequisites and demonstrations outside it. Never split one stage across several unlabeled prompt blocks. Published participant prompts must contain no unresolved placeholders.

## What the building agent must be told

Each prompt must be self-contained and require the agent to:

- Read AGENTS.md, [FINAL-SYSTEM.md](FINAL-SYSTEM.md), final architecture/protocol documentation and the current checkpoint before editing.
- Build only the requested stage and preserve previous working layers.
- Use final host/phone screenshots, design dimensions, control identifiers and profile examples. State which elements appear at this checkpoint and how they match the final interface.
- Follow the fixed message schema and game adapter API. Include relevant exact fields/method signatures so models cannot invent incompatible versions.
- Name files to create/change, their responsibilities and available dependencies. Earlier checkpoints must run with later-stage files absent.
- State applicable interactions precisely: touch press/release, simultaneous controls, permissions, centering, player isolation, game switching and reconnect.
- Run actual stage checks and fix failures without weakening assertions. Include a browser check when changing the interface or input integration.
- Report files changed, observed behavior, passed commands and pending physical-device checks. Stop after this stage.

## Keep the final result consistent

Finish and test the universal controller before deriving reconstruction checkpoints. Preserve the baseline, file ownership and visual reference. State explicitly whether each exercise restores reference files or asks the model to write a feature.

Source hashes establish equality with supplied reference code. Model-written changes need behavioral and visual checks; a successful freeform prompt does not establish byte equality. Both routes must preserve the controller contract and expected behavior.

Use the same terms everywhere: host, controller, player, profile, buttons, motion and game adapter. Reusable phone labels/mappings come from profiles. Keep provider credentials in OmniRoute/development environment variables.

## Publication check

Run the participant sequence from a fresh starter using OpenCode through the organizer's working OmniRoute route. Confirm each prompt's commands exist and each checkpoint runs with later files absent. Try actual Android/iPhone controls and the network before the workshop.

Publish stage explanations and copy blocks together with the matching starter and recovery checkpoints. Label planned material clearly until this check is complete.
