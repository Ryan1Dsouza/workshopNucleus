# ControllerKit Android app

ControllerKit 2.0.7 (versionCode 11) keeps application id workshop.airslice.ble. The APK bundles the standard game profiles so Mario Kart can switch controls when you choose D-pad or Gyro. Install the APK from Controller options, reload the laptop host and reconnect.

MainActivity hosts an offline WebView. MotionService owns Bluetooth, fused orientation and a user-started foreground service. The existing camera/notification workflow is retained; buttons release when the activity hides. Phones without the required motion sensors can use buttons.

## Build

Use JDK 17+, Android SDK 35 and Node.js 22+.

Windows PowerShell:

~~~powershell
cd native/android
.\gradlew.bat assembleDebug lintDebug
~~~

macOS/Linux Bash or Zsh, from the project root:

~~~sh
cd native/android
chmod +x gradlew
./gradlew assembleDebug lintDebug
~~~

The Gradle preBuild task synchronizes the shared phone UI. The APK is app/build/outputs/apk/debug/app-debug.apk. From the project root:

~~~sh
npm run package:android
~~~

This writes public/downloads/air-slice-ble.apk, the URL used by the host download page.

## Native contract

See [CONTROLLER-CONTRACT.md](../../docs/CONTROLLER-CONTRACT.md). FrameCodec handles motion/center/buttons; ProfileTransfer checks bounded ordered UTF-8 chunks and CRC32. Control prefers notifications and accepts cached indications; laptop writes use responses. BleControlQueue preserves press/release ordering and prevents a control backlog from starving fresh motion. Idle buttons do not send heartbeat traffic. Motion uses only the latest fresh pose. A stalled send is allowed five seconds before connection recovery rather than causing rapid reconnect cycles.

Nearby devices permissions cover BLE advertise/connect. Notification permission is optional for the foreground shortcuts. The app must advertise a BLE peripheral; test that capability on the actual phone.

## Check

~~~sh
npm run test:native-protocol
~~~

Run that from the root with a JDK. It checks Java/JavaScript byte agreement and malformed transfers. Actual radio pairing, gyro and camera behavior require the physical app/phone.
