# Windows, macOS and Linux workshop setup

The seven stage prompts use the same Node/npm commands on all three platforms. Directory paths in the commands use forward slashes, the workshop tools use Node filesystem APIs, the Java protocol check chooses the platform's executable name, and browser audits use Playwright's platform-specific Chromium download or a local browser fallback.

## What has actually been checked

| Platform | Software validation | Physical phone pairing |
|---|---|---|
| Windows | Seven-stage baseline rehearsal passed; Node 22 unit execution also checked | Requires the actual laptop/phone demonstration |
| macOS | Commands, filesystem paths, browser discovery and Java launcher reviewed; live rehearsal pending | Use native desktop Chrome/Edge and check the actual devices |
| Linux | Commands, filesystem paths, browser discovery and Java launcher reviewed; live rehearsal pending | Web Bluetooth is experimental; prepare and check the Linux host separately |

Command portability does not establish successful execution on an untested computer. Preserve this distinction in OpenCode's reports. A Windows browser fixture does not certify macOS/Linux browser behavior or physical radio support.

## Prerequisites

- Use current Node.js 22 LTS or 24 LTS, npm and an OpenCode installation accessible from your terminal. npm ci installs the supplied lockfile; keep it unchanged.
- Playwright is pinned to 1.58.2. Its [versioned requirements](https://github.com/microsoft/playwright/blob/v1.58.2/docs/src/intro-js.md#system-requirements) list Windows 11+/Server 2019+, macOS 14+, and Debian 12/13 or Ubuntu 22.04/24.04 on x86-64/arm64. Other OS versions need their own validation.
- JDK 17+ with both java and javac on PATH, or a valid JAVA_HOME, is needed for npm run test:native-protocol. This check does not need an Android SDK or a Mac.
- The supplied Android APK avoids a participant Android build. Rebuilding it requires JDK/Android SDK/Gradle on the chosen desktop OS; see [native/android/README.md](../native/android/README.md).
- iOS project/resource verification runs through Node on all three platforms. Actual Xcode compilation, signing and iPhone installation require a Mac; see [IPHONE-SETUP.md](IPHONE-SETUP.md).

## Common commands

Open a terminal inside the extracted kit's starter/ directory. The following commands work in Windows PowerShell/cmd and macOS/Linux Bash/Zsh:

~~~sh
node --version
npm ci
npm run workshop:verify -- 0
~~~

Install the audit browser before Stage 1. On Windows/macOS:

~~~sh
npx playwright install chromium
~~~

On the supported Debian/Ubuntu Linux distributions:

~~~sh
npx playwright install --with-deps chromium
~~~

The Linux installer includes OS libraries and may request sudo. Prepare those dependencies before the live session. Use the pinned local Playwright installation; do not upgrade it for the workshop.

Follow the exact numbered [STAGE-PROMPTS.md](STAGE-PROMPTS.md) blocks. For example, the Stage 1 commands are identical across platforms:

~~~sh
npm run workshop:verify -- 0
npm run workshop:stage -- 1
npm run workshop:verify -- 1
npm test
npm run audit:stage -- 1
~~~

Stop on a failed command and diagnose it before proceeding. Stages must remain sequential. The browser audit starts its own local test server; it does not depend on a manually running npm start session or an attached Bluetooth phone.

The same portability applies to npm run audit:controller, npm run audit:filter, npm run test:native-protocol, node scripts/native/check-ios-package.mjs and npm run export:workshop. Exports require a new or empty directory.

## Shell-specific commands

Configuration file copying, gateway-key entry and environment variables depend on the shell. [NEW-LAPTOP.md](NEW-LAPTOP.md) supplies a Windows PowerShell block and a macOS/Linux Bash block. On macOS's default Zsh terminal, run bash before pasting the Bash credential-entry block. Start OpenCode from that same terminal so it receives OMNIROUTE_API_KEY.

For an occupied server port, Windows PowerShell uses:

~~~powershell
$env:PORT = "3001"
npm start
~~~

macOS/Linux Bash or Zsh uses:

~~~sh
PORT=3001 npm start
~~~

If browser auto-discovery fails, prefer the pinned Chromium install above. BROWSER_EXECUTABLE can point to an existing executable using your shell's environment syntax. It must be the executable file, not a macOS .app directory. Linux browser locations vary by distribution; a discovered desktop browser alone does not establish that its headless/WebGL dependencies are ready.

## Archive and filesystem handling

Extract or copy the complete kit, including starter/.workshop/ and its reference tree. Hidden files must be included when sharing. ZIP transfer preserves the source bytes; do not normalize line endings in the frozen reference or edit manifest hashes.

The source inventory ignores macOS .DS_Store and AppleDouble ._* metadata created by Finder/archive extraction. It still rejects unexpected application source, so accidental future-stage code cannot silently pass verification. This exclusion has a unit regression check. Keep filename capitalization unchanged for case-sensitive filesystems.

## Real Bluetooth on Linux

Automated stage/controller audits inject simulated GATT and sensors. They can test controller/game behavior without a working physical BLE stack, and do not need Linux's Web Bluetooth flag.

For real phone pairing, [Chrome's Bluetooth documentation](https://developer.chrome.com/docs/capabilities/bluetooth#before_we_start) requires enabling experimental web platform features on Linux. The [implementation status](https://github.com/whatwg/bluetooth/blob/main/implementation-status.md) describes Linux support as partial and unsupported. A working BlueZ/system BLE stack and compatible adapter are also required. Prepare this on the actual laptop before the workshop; use keyboard/mouse input for the build demonstration if phone pairing is unavailable.

Use native desktop Chrome/Edge for the host on Windows/macOS. Safari/Firefox are not pairing targets. WSL or a Linux container can run software checks but does not establish physical laptop Bluetooth access. Phone iOS BLE comes from the supplied native CoreBluetooth bridge, not a mobile browser.
