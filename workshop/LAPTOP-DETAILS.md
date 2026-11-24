# Laptop reference: phone setup and troubleshooting

Use this with your instructor when you need more detail. Attendees start with the short [NEW-LAPTOP.md](NEW-LAPTOP.md) checklist. New kits already supply opencode.json; the configuration copy commands below also support older kits.

The organizer handles OmniRoute provider connections. This guide starts with the supplied participant kit and a working OpenCode installation.

## 1. Transfer the complete kit

Extract controllerkit-kit.zip or copy the whole controllerkit-kit/ folder. Keep starter/.workshop/: it contains manifest.json, state.json and the frozen reference. Open a terminal inside starter/. Its initial checkpoint is Stage 0.

Use current Node.js 22 LTS or 24 LTS. Open a terminal inside the extracted starter/ directory on Windows, macOS or Linux. The common setup commands are:

~~~sh
node --version
npm ci
npm run workshop:verify -- 0
~~~

The verification should print PASS Stage 0. The starter has instructions/tools but no host until Stage 1.

Prepare the audit browser before the session. On Windows/macOS run npx playwright install chromium; on supported Debian/Ubuntu Linux run npx playwright install --with-deps chromium to include required system libraries. The Linux dependency installer may request sudo. The project pins Playwright 1.58.2; keep the lockfile. Full platform prerequisites and optional overrides are in [PLATFORMS.md](PLATFORMS.md).

## 2. Configure OpenCode

Keep OmniRoute running on this laptop at http://localhost:20128. Copy the included configuration beside package.json using the block for your shell.

**Windows PowerShell:**

~~~powershell
Copy-Item -LiteralPath .\workshop\opencode.workshop.example.json -Destination .\opencode.json
$workshopGatewayKey = Read-Host "OmniRoute gateway API key" -AsSecureString
$env:OMNIROUTE_API_KEY = [System.Net.NetworkCredential]::new("", $workshopGatewayKey).Password
opencode models omniroute
opencode
~~~

**macOS/Linux Bash:** run bash first if your terminal uses a different shell, then paste this block:

~~~bash
cp workshop/opencode.workshop.example.json opencode.json
read -r -s -p "OmniRoute gateway API key: " OMNIROUTE_API_KEY
export OMNIROUTE_API_KEY
printf '\n'
opencode models omniroute
opencode
~~~

Use the enabled OmniRoute gateway key. Provider connection keys stay in OmniRoute. Launch OpenCode from this same terminal so it inherits the environment variable.

In /models select omniroute/workshop-free if that combo exists in OmniRoute, or another verified tool-capable route. A JSON model entry alone does not create a gateway combo or prove that the route works.

## 3. Copy this setup smoke prompt

Open [PROMPTS.md](PROMPTS.md) and paste its complete **Setup and model/tool smoke prompt** into OpenCode. It tells the model to read [CONTEXT.md](CONTEXT.md), inspect the real starter metadata and run Stage 0 verification without applying a stage.

Expect controllerkit-workshop, node server/index.cjs, installed Stage 0 and a passing verification command. Resolve authentication/model/tool errors before building. Use OpenCode's Build agent for stage prompts. The context file is loaded explicitly by the prompts; its presence alone does not establish that a model read it.

## 4. Build one stage at a time

Open [STAGE-PROMPTS.md](STAGE-PROMPTS.md). Paste only the complete block between COPY THIS PROMPT — STAGE N and END OF STAGE N PROMPT. Start with Stage 1, wait for its checks to pass and continue through Stage 7.

Each block reloads the shared context and checks the actual starting stage. After a new chat/model switch or interruption, use the **Resume** prompt in [PROMPTS.md](PROMPTS.md). Use its **Recovery** prompt for a failed checkpoint. Do not reset the starter or alter the frozen reference to make a check pass.

After Stage 1, run the host in a second terminal:

~~~sh
npm start
~~~

Open http://localhost:3000/host. If the port is occupied, use:

~~~powershell
$env:PORT = "3001"
npm start
~~~

On macOS/Linux Bash or Zsh:

~~~sh
PORT=3001 npm start
~~~

Reload the host after each stage. Stage 2 adds the button lab; Stage 3 activates motion; Stage 5 makes Fruit Ninja playable.

## 5. Install and connect the phone

Scan **Scan to install** beside Player connections, or click **Connect phones** for the larger QR. Keep the phone and laptop on the same Wi-Fi/hotspot during the download. On the phone, tap Download Android APK, install it, open ControllerKit and allow Nearby devices. Start Bluetooth in the app. On the laptop click **Connect phone** for a player and choose that phone. The native app provides sensors and BLE; the browser preview is for the UI.

The QR uses a LAN address, not localhost. Choose the correct laptop address if more than one is listed. Phone/laptop network access downloads the app; gameplay input uses BLE.

For iPhone, install a signed build from the [Xcode setup](IPHONE-SETUP.md) before pairing. Windows checks do not certify that build.

Use the laptop's native Chrome/Edge browser for physical phone pairing. Linux Web Bluetooth remains experimental and requires Chrome's experimental web platform features plus a working system BLE stack; test the actual Linux laptop beforehand. The automated audits use simulated GATT and do not require physical Bluetooth. Safari/Firefox are not the host pairing browsers. See [PLATFORMS.md](PLATFORMS.md).

Hold the phone in your intended grip and center. Press/release A/B, try simultaneous controls, turn your wrist, recenter, switch back to Controller Lab and reconnect. Use a second phone to check player isolation.

## 6. Play and share

After Stage 5 select Fruit Ninja. A starts the first round only; Space plays again, B selects practice, 1 selects Classic, plus pauses, minus/2 restart and Home returns to the lab. Desktop mouse slicing and keyboard input are available for development.
Click **Enlarge game** beside Play/Pause/Restart for a larger play surface. **Restore size** or Escape returns to the dashboard while preserving the round and paired phones.

After Stage 7 the complete export is starter/dist/controllerkit-workshop/. Copy it to another laptop and run npm ci then npm start. OpenCode and OmniRoute are unnecessary for gameplay.

## Recovery

If a hash fails, restore the named source file from .workshop/reference/; for public/stage.mjs set its stage constant to the current checkpoint. Keep the frozen manifest/reference unchanged. Rerun verification before advancing.

If browser launch fails, use installed Chrome/Edge or run npx playwright install chromium. Reports are under test-results/. Provider quota errors are resolved in OmniRoute/model selection before continuing.
