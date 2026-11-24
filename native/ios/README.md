# ControllerKit iPhone app

Open ControllerKit.xcodeproj on a Mac with Xcode. The project uses UIKit, WKWebView, CoreBluetooth and CoreMotion; it has no external Swift package dependencies.

The shared offline UI is generated from public/controller/ by scripts/native/sync-ui.mjs. Run npm run sync:phone-ui before rebuilding after UI changes.

Choose a signing team and physical iPhone in Xcode. See [IPHONE-SETUP.md](../../workshop/IPHONE-SETUP.md) for the build and pairing checklist.

FrameCodec matches the documented 20-byte motion, 15-byte captured center, 7-byte buttons and bounded profile transfer. ControllerPeripheral publishes the same BLE UUIDs as Android. The phone is the peripheral; the laptop browser is the central.

Source/project resources are supplied. Mac compilation, signing and actual BLE/sensor behavior require separate verification; they have not been established by Windows/Java/browser checks. Keep the app foreground during the motion demonstration.
