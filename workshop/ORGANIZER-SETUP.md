# Organizer setup

This file is for the instructor. Attendees use [NEW-LAPTOP.md](NEW-LAPTOP.md) and [PROMPTS.md](PROMPTS.md).

## Use the supplied kit

The prepared quickstart ZIP already contains a Stage 0 starter, frozen reference source and OpenCode configuration. Share that ZIP with attendees. Extracting the complete ZIP includes starter/.workshop/ automatically.

Prepare Node.js 22+, OpenCode, OmniRoute and Chrome before the session. Supply the gateway key and exact working, tool-capable model name. Demonstrate the short setup checklist and run its model/tool smoke prompt before Stage 1.

## Generate another kit when needed

This command turns the complete Stage 7 organizer project into a fresh Stage 0 participant kit. Run it from the complete source project when you need a new kit:

~~~sh
npm run workshop:kit -- --out dist/controllerkit-today-kit
~~~

The output must be new or empty; choose another name if it already exists. The command copies the supplied source into a frozen reference and prepares the participant starter. Keep the complete organizer application intact.

Share the complete generated folder. Participants open its starter/ directory, run npm ci and follow NEW-LAPTOP.md. A complete game source export without .workshop/ is for playing/extending the finished application and cannot run the staged reconstruction commands.

## Gateway and demonstrations

Keep OmniRoute running and verify the chosen route supports tool calls. OpenCode receives OMNIROUTE_API_KEY from its launch terminal; the supplied configuration contains an environment placeholder. Enter keys in the terminal, not in model prompts. Resolve authentication, model and quota errors during setup.

Use [TEACHING-SCRIPT.md](TEACHING-SCRIPT.md) for the teaching flow and [NETWORK-CHECK.md](NETWORK-CHECK.md) for the physical-phone demonstration. The [LAPTOP-DETAILS.md](LAPTOP-DETAILS.md) and [PLATFORMS.md](PLATFORMS.md) references cover troubleshooting and platform requirements.
