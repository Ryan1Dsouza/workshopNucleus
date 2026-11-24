# ControllerKit interface reference

The laptop is a game console; the phone is its reusable Wii-style remote. Profiles supply each game's controls, labels and motion mode. UI changes must preserve the existing input and calibration contracts.

## Laptop

Keep a short game library beside one large play surface. Put the two player connections in a shared dock below it. Each player retains an independent Connect phone action, device name and connection state. On narrow screens the library, play surface and player dock stack in that order.

Fruit Ninja adds compact Players, Mode and Timer selectors beside the existing play controls, using the same Nunito Sans/Source Sans 3 typography and porcelain, silver, ink, slate and blue tokens. Each selector has a visible label, keyboard focus and a 44-pixel target. Two-player mode adds one center divider, score labels in their respective lanes and a shared timer. Keep the supplied dojo artwork and existing enlargement/QR flows.

The split-screen references are screenshots/fruit-split-desktop.png and screenshots/fruit-split-mobile.png. Shader and texture preparation finishes during loading before the round becomes available.

Keep a visible Scan to install QR beside the player connections. Clicking it, App QR & setup or Connect phones opens the larger QR, reachable LAN-address selector, installation steps and iPhone setup link. Both QRs use the same selected laptop address. Escape closes the dialog without switching games. Scanning opens the download page; Android users download the APK, install it and open ControllerKit. Gameplay input stays on Bluetooth.

Only playable games show Play, Pause, Restart and Enlarge game. Enlarge game fills the window with the selected game and requests browser fullscreen when available. Restore size or Escape returns to the dashboard, including when keyboard focus is inside the game. Enlarging preserves the round and paired controllers; viewport remapping clears old blade strokes without recalibrating the grip. Controller Lab shows live buttons and wrist aim. Both player input rows must remain visible at compact laptop sizes.

## Phone

Use a white tactile remote with a dark D-pad, large circular A/B buttons, plus/minus/Home and 1/2. The header names the current game, assigned player and actual connection state. A prominent Center action and motion toggle sit below the controls.

Render only the profile's supported controls. Remove empty control groups and redundant A/B/1/2 captions; keep game-specific labels such as Play, Practice and Add one. Portrait uses vertical groups. Landscape spreads groups across the remote and reflows when a profile omits the D-pad.

Gameplay buttons and Center have touch areas of at least 48 pixels. Preserve simultaneous press/release, pointer cancellation, lost capture, keyboard release and clearing on disconnect or profile changes. Buttons remain usable when motion sensors are unavailable.

Before pairing, Start Bluetooth is visible. Once paired, Stop Bluetooth sits inside Controller options alongside vibration and camera controls. The desktop preview clearly identifies itself and omits native-only options.

## Shared tokens

| Role | Color |
|---|---|
| Porcelain surfaces | #FAFBFC |
| Console silver | #E9EEF3 |
| Primary ink | #233044 |
| Secondary slate | #5B6B7C |
| Controls and Player 1 | #2463C8 |
| Connected state | #18785D |

Player 2 has a purple identity accent. Use Nunito Sans for headings and button letters, Source Sans 3 for instructions and status, and restrained spacing based on multiples of four. Reserve depth for physical buttons and the play surface. Keep surrounding panels quiet, with sentence-case labels, visible focus and reduced-motion support.

The local fonts and tokens live in public/ui/. scripts/native/sync-ui.mjs embeds the fonts and shared styles in the Android/iPhone HTML. The native interface must render without a web server or external font requests. Font notices accompany the project in licenses/.

## Visual references and verification

- screenshots/host-dashboard.png and screenshots/host-laptop.png
- screenshots/connection-guide.png
- screenshots/fruit-ninja-enlarged.png
- screenshots/phone-portrait.png and screenshots/phone-connected.png
- screenshots/phone-fruit-profile.png and screenshots/phone-landscape-profile.png

Run npm run audit:controller for browser layout, dialog, profile, touch cancellation and connection checks. Native-resource and browser fixtures establish covered software behavior; they do not establish physical sensor or radio performance.
