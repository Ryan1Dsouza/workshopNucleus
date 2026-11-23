# Android Bluetooth blade

This native phone app advertises a Bluetooth LE peripheral service. Chrome/Edge on the laptop subscribes directly through Web Bluetooth. It replaces the phone's browser sensor and Wi-Fi motion path; the existing browser game, calibrated angle mapping and collision rules stay in use. No Node Bluetooth receiver is needed. The app has no Internet permission.

## Install and play

1. On Android, open the game's `/controller` page using your normal QR/Cloudflare link and tap **Download Bluetooth app**. Install `air-slice-ble.apk`, allowing this browser to install the downloaded app if prompted. The provided APK is a debug-signed workshop test build, not a Play Store release.
2. Open **Air Slice Bluetooth** → **Start Bluetooth** → allow Nearby devices and enable Bluetooth when asked.
3. On the laptop, open `/host` in Chrome or Edge using `http://localhost:<port>` or HTTPS. Enable laptop Bluetooth. Click **Connect Bluetooth · Player 1**, and select the phone shown by the app. Pair from the game's button rather than the Windows Bluetooth settings screen. Use a different phone for Player 2.
4. Hold your phone in the grip you want to use, tap **Center blade**, then choose **Blade-only check** or **Play practice** on the laptop. Turn your wrist left/right and up/down. Use **Start / restart game** from the app or notification for another round.
5. Open **Motion check** for received poses, delivered capture rate and measured echo RTT. The native app separately shows its actual sensor event rates and successful notification submissions. These rates can differ. Compare Bluetooth and Wi-Fi on the same hardware; neither path guarantees a particular physical latency.

The last point stays visible when you stop moving. Switching to another app preserves the sensor stream and centered grip. Small gyro noise, recentering and an actual sensor interruption cannot trigger a slice. A disconnect clears only that player's blade. The host attempts two reconnects; use its disconnect/connect button if recovery fails.

## Record video while playing (v1.2)

Install the latest APK **as an update** to the existing app, then Start Bluetooth, pair and center as usual. Allow notifications for the background controls. Tap **Record video · keep controller running**, then start recording in your normal camera app. This turns off vibration feedback so hits do not shake the footage. Alternatively, switch to your camera manually; toggle vibration off in Air Slice if desired.

Sensor capture and Bluetooth run in `MotionService`, a user-started Android foreground service of type `connectedDevice`. Its ongoing notification offers **Center blade**, **Start game** and **Stop**. `MainActivity` only binds to display status and controls; leaving/recreating it does not stop sensors or reset calibration. The app never opens the camera itself or requests camera/microphone permission: video is recorded by your camera app. Nothing automatically records or uploads footage.

Stop from the notification or app when finished. The service unregisters sensors, closes Bluetooth and releases its CPU wake lock. A timed wake lock is renewed only while a laptop is connected. The service does not auto-restart after being killed. Android 13+ can run the service even if notifications are denied, but drawer controls may be unavailable; allow notifications for convenient centering/stopping.

Some manufacturers restrict background apps aggressively. If motion stops while recording, set this app's battery usage to **Unrestricted** and compare camera recording on/off using host diagnostics. Camera load can reduce sensor/transport performance; simultaneous recording and motion has not been verified on a physical phone here.

The laptop automatically enables **Smooth dot motion** when Bluetooth connects. It draws intermediate positions between captured poses using an adaptive 8–32 ms display buffer, while slicing uses the immediate measured position. It settles exactly at the last received endpoint without prediction or automatic cuts. **Motion check** shows the added display buffer and lets you disable it. Browser display changes require reloading/reconnecting the host, not reinstalling this app.

## Requirements and limitations

- Android 8.0+ (API 26), gyroscope, game rotation-vector sensor and BLE peripheral advertising support. Some phones cannot advertise; the app explains this instead of failing silently.
- Laptop with Bluetooth LE and a WebGL 2 capable Chrome/Edge browser on Windows or macOS. Linux Chrome may require enabling Experimental Web Platform features and a working Bluetooth stack. Safari/Firefox cannot receive this Web Bluetooth implementation. The laptop must use a secure origin (localhost counts).
- Motion goes directly over BLE, bypassing the router and Cloudflare. Loading the game/APK still uses HTTP/HTTPS. The phone can turn Wi-Fi off after installing to verify the motion path.
- This app is Android only. Keep the browser Wi-Fi QR controller for iPhone and unsupported BLE devices. Phone rotation is measured; absolute hand translation requires additional tracking hardware. Rotation-vector heading can drift over time; recenter when needed.
- Packet/connection interval is negotiated by the OS/radio. Web Bluetooth cannot force a particular connection interval. Native capture asks for 100 Hz; actual delivered motion is limited to roughly 60 Hz and the hardware's throughput.

The user has reported successful physical Bluetooth pairing. No phone was attached to the development laptop for automated native lifecycle/camera testing. Java compilation, Android lint, cross-language protocol tests and simulated browser Bluetooth tests cannot establish physical recording performance or real-phone smoothness.

## Build through OpenCode + OmniRoute

The source uses ordinary Java and Gradle, with no AndroidX app dependency. OpenCode can edit/build it using the provider configured in OmniRoute. Neither tool is needed to run the APK or game.

Install JDK 17+ (21 works), Android SDK platform 35 and Build Tools 35.0.0. Android Studio's SDK Manager is the easiest setup. Set `JAVA_HOME` and `ANDROID_HOME`, or create a **local-only** `local.properties` with your SDK path. Do not distribute that file. Internet is needed for first-time Gradle/plugin downloads.

```powershell
cd native/android
.\gradlew.bat assembleDebug lintDebug
cd ../..
npm run test:native-protocol
npm run package:android
npm test
npm run audit:bluetooth
```

On macOS/Linux, use `sh ./gradlew assembleDebug lintDebug`. `npm run test:native-protocol` needs the JDK, not the Android SDK. Browser audit needs `npx playwright install chromium` or `BROWSER_EXECUTABLE` pointing to installed Chrome. Versions: Gradle 8.9, Android Gradle Plugin 8.7.2, compile/target SDK 35, Java source 17.

Build output: `app/build/outputs/apk/debug/app-debug.apk`. The packaging script copies it to `public/downloads/air-slice-ble.apk`. A rebuild on another laptop uses its own debug signing key; uninstall an older build first if Android reports a signature mismatch. The source export includes the wrapper, native source and packaged test APK, excluding build caches, local SDK paths and signing keys.

## Wire protocol

Service: `4d1a0001-9cf1-4ee3-a71b-9438ef5d3400`.
Motion notification: `4d1a0002-9cf1-4ee3-a71b-9438ef5d3400`.
Control write/notification: `4d1a0003-9cf1-4ee3-a71b-9438ef5d3400`.

The 20-byte little-endian v1 frame fits a default ATT notification:

| Offset | Field |
|---|---|
| 0 | Version = 1 |
| 1 | Flags: active = bit 0, fresh gyro = bit 1 |
| 2–3 | Sequence, uint16 |
| 4–7 | Sensor capture milliseconds, uint32 |
| 8–15 | Device-to-world XYZW quaternion, four signed int16 / 32767 |
| 16–17 | Angular-speed magnitude in 0.01 degrees/sec, uint16 |
| 18–19 | Calibration epoch, uint16 |

Android converts the native gyro's radians/sec to degrees/sec. The receiver normalizes quantized quaternions, unwraps clocks/sequences and rejects duplicate/out-of-order packets. Calibration or a new connection resets the stroke. One notification is in flight, with a bounded priority control queue and only the latest captured pose, preventing an app-side motion backlog.

Commands from phone: start `1`, Center `2`, suspend `3`, ping echo `0x90` followed by a uint32 token. In app v1.2, Center carries a 15-byte payload: command `2`, epoch uint16, capture milliseconds uint32 and XYZW quaternion int16[4]. Before a fresh pose exists, it sends command + epoch in 3 bytes. This preserves the button-time grip even when new-epoch motion arrives first. Center becomes available after the laptop connects. The browser accepts older one-byte Center commands, but install v1.2 for captured-pose calibration. See [the calibration contract](../../docs/CENTER-BLADE.md).

Laptop writes: ping `0x10` + token, slice vibration `0x11`, bomb `0x12`, miss `0x13`. Browser GATT writes are serialized, with one short-lived pending feedback cue. RTT is measured on the laptop by echoed tokens, not by subtracting unsynchronized device clocks.
