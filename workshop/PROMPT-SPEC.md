# How to use the participant prompts

[PROMPTS.md](PROMPTS.md) is the session entry point: setup/tool smoke check, stage links, resume and recovery. [CONTEXT.md](CONTEXT.md) supplies the shared architecture, directory roles, source authority, behavior constraints and reporting requirements. [STAGE-PROMPTS.md](STAGE-PROMPTS.md) contains one complete numbered build block per checkpoint.

PROMPTS.md is for attendees and starts directly with the setup check. Kit-generation and gateway-preparation instructions are in [ORGANIZER-SETUP.md](ORGANIZER-SETUP.md).

Copy only the block between **COPY THIS PROMPT — STAGE N** and **END OF STAGE N PROMPT**. Start at Stage 1 in the generated starter and wait for each stage's checks before proceeding.

Every stage block explicitly tells OpenCode to read the shared context, AGENTS.md, final system, exact controller contract, visual references and current manifest/state. It validates the starting checkpoint, lists stage ownership, reads concrete reference entry points, restores only that layer and checks source/unit/browser behavior. It stops after the requested stage and reports actual command results and pending hardware checks.

The file name CONTEXT.md is descriptive; do not assume OpenCode automatically loads it. The setup and stage prompts load it through file tools. Keep model input focused on the context, requested layer and relevant contracts. The state file records an installed checkpoint, not test completion; a fresh session reruns missing validation before advancing.

The baseline reconstruction is deliberate: source hashes establish equality with the provided implementation. The agent's job includes inspection, explanation, tools and verification. Model-written features belong in a separate completed export; their source can differ while preserving the controller contract.

Organizers use [TEACHING-SCRIPT.md](TEACHING-SCRIPT.md) for explanations and [EXTENDING-GAMES.md](EXTENDING-GAMES.md) for the later coding exercise.
