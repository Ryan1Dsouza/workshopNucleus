# Install ControllerKit on iPhone

The iPhone project supplies a native BLE peripheral/CoreMotion bridge and the same offline controller UI. A Mac, Xcode, signing account/team and physical iPhone are required. Windows verification does not establish an iOS build.

## Prepare on the Mac

Copy the complete source export. With Node.js 22+ installed:

~~~sh
npm ci
npm run sync:phone-ui
open native/ios/ControllerKit.xcodeproj
~~~

In Xcode select the ControllerKit target, choose your signing team and a connected iPhone. Enable the phone's developer/trust setup if Xcode requests it, then build/run.

For a source compilation check without signing:

~~~sh
xcodebuild -project native/ios/ControllerKit.xcodeproj -scheme ControllerKit -sdk iphoneos -configuration Debug CODE_SIGNING_ALLOWED=NO build
~~~

## Pair and verify

Open the laptop host in desktop Chrome/Edge. Start Bluetooth in the iPhone app and allow the requested Bluetooth/motion access. Choose ControllerKit iPhone from the laptop's Connect phone picker.

Check buttons, simultaneous press/release, center, wrist motion, game profile changes and reconnect. Keep the iPhone app foreground for the motion demonstration. Background gyro/camera behavior is not certified by the supplied source.

A second phone must preserve its input when the first disconnects. Record the Mac build and physical device results in the organizer's verification checklist.
