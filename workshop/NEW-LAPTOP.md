# Air Slice reference: new-laptop setup

Scope: setup for the previous Air Slice reference kit. Its old generated ZIP/folders are archived. The reusable controller workshop target is in [FINAL-SYSTEM.md](FINAL-SYSTEM.md); a matching new starter and stage prompts will follow its tested implementation.

Start here when Pollinations, Groq, Gemini, OpenRouter and NVIDIA NIM are already connected in OmniRoute and OpenCode is installed.

OmniRoute supplies model access; OpenCode runs the project tools. The workshop starter supplies the files, frozen reference and seven construction stages. This guide assembles the existing tested game from that reference. The current stage prompts reconstruct its source exactly.

## 1. Get the workshop starter onto the new laptop

The instructor gives you **air-slice-kit.zip**, or the whole **air-slice-kit/** folder. The ready zip is generated in the instructor project's `dist/` folder.

Extract/copy it into a folder such as:

~~~text
Documents/
  air-slice-kit/
    START-HERE.md
    starter/
      .workshop/
        manifest.json
        state.json
        reference/
      workshop/
      package.json
      package-lock.json
      AGENTS.md
      ...
~~~

Keep `.workshop/` when transferring the folder. It contains the reference used by the prompts. The participant's working directory is **starter/**. Its initial state is Stage 0, with no server or game yet.

## 2. Prepare the terminal

Use Node.js 22+ and a current Chrome/Edge browser. If Node is missing, install [Node.js LTS](https://nodejs.org/en/download), then open a new terminal.

Open PowerShell in the extracted starter folder. For the example location above:

~~~powershell
cd "$env:USERPROFILE\Documents\air-slice-kit\starter"
node --version
npm ci
npm run workshop:verify -- 0
~~~

The last command should say **PASS Stage 0**. It checks the transferred starter before you spend any model requests on it.

## 3. Keep OmniRoute running on this laptop

Open the OmniRoute dashboard and keep its local server running at `http://localhost:20128`. Your OpenCode configuration points to `http://localhost:20128/v1`.

Here, `localhost` refers to the new laptop. If you intentionally run OmniRoute on a different computer, change the configuration's baseURL to that gateway's reachable address.

### Choose an actual model route

Your provided configuration is included as [opencode.workshop.example.json](opencode.workshop.example.json).

It lists the routes you supplied: `auto`, `auto/coding`, `auto/fast`, `workshop-free`, the Gemini routes and the Pollinations routes.

For a shared workshop route, create/save a combo named **workshop-free** in OmniRoute and add currently available models that support coding tool calls. Select its members from the gateway's current model catalog. The name in OpenCode's JSON does not create the combo in OmniRoute.

Alternatively, choose an already working route such as `auto/coding`, or a concrete tool-capable model. Confirm that the selected route exists in your gateway. Model IDs, free availability and quotas depend on the provider/account; importing free models does not make every auto route free.

## 4. Put the OpenCode config in the starter root

If your provided configuration is already saved as `starter/opencode.json`, keep it.

Otherwise, copy the included version:

~~~powershell
Copy-Item -LiteralPath .\workshop\opencode.workshop.example.json -Destination .\opencode.json
~~~

The file belongs beside `package.json`. It uses the same provider/model entries you supplied and keeps the gateway credential in `{env:OMNIROUTE_API_KEY}`.

### Set the gateway key in this terminal

Use the **OmniRoute gateway API key** from OmniRoute's API-key page; enable the key there. The Pollinations/Groq/Gemini/OpenRouter/NVIDIA connection keys stay in OmniRoute.

This command asks for the gateway key without displaying it or putting it in the command history:

~~~powershell
$workshopGatewayKey = Read-Host "OmniRoute gateway API key" -AsSecureString
$env:OMNIROUTE_API_KEY = [System.Net.NetworkCredential]::new("", $workshopGatewayKey).Password
~~~

Launch OpenCode from this same terminal so it inherits the variable. Set it again if you open a new OpenCode terminal later. The game itself does not need this key.

## 5. Check the model and tools before starting Stage 1

~~~powershell
opencode models omniroute
opencode
~~~

In OpenCode, open `/models` and select **omniroute/workshop-free** if you created that combo. Otherwise select your verified existing route, for example **omniroute/auto/coding**.

The command lists OpenCode's configured catalog; a listed name alone does not prove that OmniRoute can serve it. Use this small read-only prompt to check the actual route and tool calls:

~~~text
Use file-reading tools to read package.json and .workshop/state.json.
Tell me the project name, the start script and the current stage.
Do not change files or apply any workshop stage.
~~~

You should see tool use and these results:

- Project: air-slice-workshop.
- Start script: node server/index.cjs.
- Current stage: 0.

If the request fails, resolve the gateway/model error before applying a stage. For construction prompts, use OpenCode's **Build** agent.

## 6. Paste Stage 1, then continue one stage at a time

Open [STAGE-PROMPTS.md](STAGE-PROMPTS.md). Copy the complete **Stage 1** text block and paste it into OpenCode.

OpenCode reads the reference, restores the stage files and runs:

~~~sh
npm run workshop:stage -- 1
npm run workshop:verify -- 1
npm test
npm run audit:stage -- 1
~~~

Wait for the source, unit and browser checks to pass. Then paste Stage 2, followed by 3, 4, 5, 6 and 7. Each prompt contains its own commands. Keep the same starter folder throughout.

| Stage | What you can demonstrate |
|---|---|
| 1 | Running server and projector shell |
| 2 | Fruit Ninja scene and mouse slicing |
| 3 | One phone, QR pairing and Center blade over the relay |
| 4 | Direct WebRTC and two independent players |
| 5 | Diagnostics, smoothing and blade-only comparison |
| 6 | Android Bluetooth source/APK and simulated BLE checks |
| 7 | Complete verification and clean source export |

Stage 6 can be reconstructed without an Android SDK by using the supplied APK. Demonstrating it on a physical Android phone is optional; a native rebuild requires the separate Android toolchain.

## 7. Run and view the game

After Stage 1, open a **second terminal** in the same starter folder:

~~~powershell
npm start
~~~

Keep that terminal running and open [http://localhost:3000/host](http://localhost:3000/host).

The game becomes playable after Stage 2. Reload the host after each later stage so it loads the new feature configuration. Reload paired controller pages after stage changes too.

After Stage 3, use the host QR code, enable motion and tap **Center blade**. Phone browser sensors require HTTPS and permission. Keep the phone and laptop on the same private network. For HTTPS/certificates/tunnels, follow [NETWORK-CHECK.md](NETWORK-CHECK.md).

After Stage 6, install/update the supplied Bluetooth v1.2 APK and pair from Chrome/Edge. Android participants can install it without building native source.

## 8. Find the finished build

After Stage 7, OpenCode exports the complete source to:

~~~text
starter/dist/air-slice-workshop/
~~~

You can copy this finished source folder to another computer and run `npm ci`, then `npm start`. OpenCode and OmniRoute are unnecessary for playing it.

## Quick recovery

| Symptom | Next check |
|---|---|
| Gateway connection refused | OmniRoute is running on the laptop and the configured port/address matches |
| Authentication error | OMNIROUTE_API_KEY contains an enabled gateway key and was set in the terminal that launched OpenCode |
| Unknown model/combo | The exact route exists in OmniRoute; create workshop-free or select a working route |
| Rate/quota error | Choose another available combo member/model or wait for that provider's quota |
| No file/tool actions | Select a tool-capable model and use the Build agent for stage construction |
| Missing manifest or wrong checkpoint | Open the supplied starter folder and keep its .workshop directory |
| npm start missing at Stage 0 | Apply Stage 1 before starting the server |
| Browser audit cannot launch | Install Chrome/Edge or run npx playwright install chromium |
| Hash check fails | Restore the named file from the reference using the workshop recovery instructions |

The starter's source equality is checked with hashes. Browser sensors/GATT are simulated in automated audits; check the actual workshop phones and network before presenting.
