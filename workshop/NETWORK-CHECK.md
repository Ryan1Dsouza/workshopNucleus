# Venue and device check

Gameplay uses BLE. Laptop/phone network access downloads the native app and serves the laptop's local pages.

1. Run the host in Chrome/Edge on localhost. Choose a laptop LAN address for the download QR if several appear.
2. Put the Android phone on that network, scan the QR and open the download page. A localhost QR cannot reach the laptop from the phone.
3. Install ControllerKit, allow Nearby devices and start Bluetooth.
4. Click Connect phone on the laptop and choose the app's advertised phone.
5. Check every button, simultaneous presses/releases, centering, slow turns and deliberate sweeps.
6. Choose Fruit Ninja, play, pause/restart and return to Controller Lab. The phone should receive new labels without reconnecting.
7. Disconnect one player and confirm the other remains connected; then reconnect and resynchronize the profile.
8. For iPhone, complete the [Mac/Xcode setup](IPHONE-SETUP.md) and repeat the physical checks.

If app downloads fail, check the selected LAN address, venue network isolation and the laptop's normal private-network/firewall access. A download failure does not diagnose the BLE input path.

If the phone is missing from the picker, confirm Bluetooth is started in the app and that the phone supports BLE peripheral advertising. Use actual desktop Chrome/Edge, not an IDE's embedded preview.

Use observed sensor/packet/round-trip data honestly. Automated GATT fixtures are not measurements of physical radio performance.
