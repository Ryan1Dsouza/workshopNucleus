# Participant setup: start here

Your instructor prepares Node.js 22+, OpenCode, OmniRoute and Chrome, and provides a gateway key and model name.

## 1. Open the project

Extract the ZIP. In your IDE, open the folder named starter. Open its terminal and run:

~~~sh
npm ci
~~~

If you already ran npm ci, continue to Step 2.

## 2. Install the test browser once

**Windows/macOS:**

~~~sh
npx playwright install chromium
~~~

**Linux:**

~~~sh
npx playwright install --with-deps chromium
~~~

Wait for installation to finish. Ask your instructor for help if Linux requests administrator access.

## 3. Enter your OmniRoute gateway key

Start OmniRoute. The starter already contains opencode.json with the workshop connection settings. Your instructor gives you the gateway key.

**Windows PowerShell: copy this command, press Enter, then type the key when asked.**

~~~powershell
$env:OMNIROUTE_API_KEY = [System.Net.NetworkCredential]::new("", (Read-Host "OmniRoute gateway key" -AsSecureString)).Password
~~~

**macOS/Linux: type bash and press Enter first. Then run this command and enter the key when asked.**

~~~bash
read -r -s -p "OmniRoute gateway key: " OMNIROUTE_API_KEY
~~~

After entering the key, run:

~~~bash
export OMNIROUTE_API_KEY
printf '\n'
~~~

## 4. Open OpenCode

In that same terminal, run:

~~~sh
opencode
~~~

In OpenCode, choose the Build agent. Type /models and select the exact model your instructor names.

## 5. Check the setup

Open [PROMPTS.md](PROMPTS.md). Find **1. Setup and model/tool smoke prompt**. Copy only the text inside that code block and paste it into OpenCode.

Continue when OpenCode reports that the setup check passed. Show your instructor any error.

## 6. Build the project

Open [STAGE-PROMPTS.md](STAGE-PROMPTS.md). Paste the **Stage 1** block. Wait for its checks to pass, then do Stage 2 through Stage 7 one at a time.

Use STAGE-PROMPTS.md for the rest of the build. OpenCode reads CONTEXT.md itself.

Your instructor will demonstrate starting the host and connecting the phone after Stage 1. [LAPTOP-DETAILS.md](LAPTOP-DETAILS.md) contains the longer reference for phone setup and troubleshooting.
