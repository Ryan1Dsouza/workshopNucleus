# ControllerKit

A reusable Wii-style phone controller and a neutral laptop game dashboard. Native Android/iPhone bridges provide BLE and sensors; both apps host the same offline HTML/CSS interface. Games receive a shared controller state and choose their button labels, motion mode and actions through profiles.

The workshop release includes Controller Lab, the supplied OpenWii Fruit Ninja game and a small extension template. Racing is a future attendee exercise.

## Run the complete application

Use current Node.js 22 LTS or 24 LTS and desktop Chrome/Edge. [Platform setup](workshop/PLATFORMS.md) covers Windows/macOS/Linux browser dependencies, shell syntax and Linux's experimental physical Web Bluetooth support.

~~~sh
npm ci
npm start
~~~

Open http://localhost:3000/host. If another application owns that port:

~~~powershell
$env:PORT = "3001"
npm start
~~~

On macOS/Linux Bash or Zsh, use PORT=3001 npm start.

Scan **Scan to install** beside Player connections, or click **Connect phones** for the larger QR and installation guide. Put the phone and laptop on the same Wi-Fi/hotspot, download the supplied [Android APK](public/downloads/air-slice-ble.apk), install it and open ControllerKit. Allow Nearby devices and start Bluetooth. Connect a player in the laptop's player dock, choose a game and center your grip. The QR is for app downloads; gameplay input uses BLE.

Use **Enlarge game** beside Fruit Ninja's Play/Pause/Restart controls for a larger play surface. **Restore size** or Escape returns to the dashboard while preserving the round and paired phones.

The [iPhone project](native/ios/README.md) needs a Mac, Xcode and signing before installation. Its source and shared UI are supplied; Windows checks do not establish an iOS build or physical Bluetooth readiness.

## Organizer and participant material

- [Workshop guide](workshop/README.md): scope, preparation and teaching order.
- [New-laptop setup](workshop/NEW-LAPTOP.md): transfer, dependencies, model smoke check and gameplay.
- [Platform setup](workshop/PLATFORMS.md): Windows, macOS and Linux prerequisites and validation coverage.
- [OpenCode session prompts](workshop/PROMPTS.md): setup, resume, recovery and stage order.
- [Model context](workshop/CONTEXT.md): architecture, supplied-source reconstruction and completion rules.
- [Stage prompts](workshop/STAGE-PROMPTS.md): copy one complete labelled block per stage.
- [Teaching script](workshop/TEACHING-SCRIPT.md): short explanations and demonstrations.
- [Controller contract](docs/CONTROLLER-CONTRACT.md): message formats, profiles and adapter API.
- [Game extension guide](workshop/EXTENDING-GAMES.md): connect attendee games to the same app.

Create a participant kit and clean complete source export:

~~~sh
npm run workshop:kit
npm run export:workshop
~~~

Outputs are dist/controllerkit-kit/ and dist/controllerkit-workshop/. Share the full starter including .workshop/. The source equality checks use a supplied frozen reference. The current root is the complete Stage 7 application; participants work inside kit/starter/.

## Project layout

| Folder | Responsibility |
|---|---|
| server/ | Local webpages, downloads, LAN address discovery and retained room-isolation contracts |
| public/host/ | Neutral dashboard, game library, BLE pairing and controller preview |
| public/controller/ | Shared Wii-style phone UI and input handling |
| public/core/ | BLE protocol, shared state, calibration, profiles, adapter registry and reusable helpers |
| public/games/ | Catalog, Controller Lab, Fruit Ninja and extension template |
| native/android/ | Android BLE/sensor foreground service and offline UI container |
| native/ios/ | iPhone CoreBluetooth/CoreMotion bridge, Xcode project and same UI |
| tests/ | Unit checks and simulated GATT fixture |
| scripts/ | Audits, native preparation, kit creation and reconstruction tools |
| workshop/, docs/, licenses/ | Teaching material, contracts, visual reference and attribution |

## Local and online play

Run `npm ci` and `npm start`, then open `http://localhost:3000/host/` in Chrome. Local play works without internet once the dependencies and phone app are installed. Pair either one phone for solo play or two phones on the same laptop for Fruit Ninja split-screen.

For LAN invites from localhost, the Node host uses its local HTTPS address. Trust the development certificate on the second laptop. For internet play, use the deployed HTTPS frontend below.

For online play each person opens the host on their own laptop and pairs their phone under Player 1. Choose **Online**, enter a name, and create a public or private lobby. Guests can select a public listing, enter the room code, or open the invite link. Mario Kart supports 2–8 people. The host assigns a different driver to each player and CPUs fill the grid. Fruit Ninja supports two players. Everyone chooses **Ready**, then the host starts. Online play continues when someone presses Pause. For straight driving, center the phone in your usual landscape grip. Mario Kart ignores up to 4.5° of hand tilt to either side and eases into a turn as you tilt farther. Ready up again after the results for a rematch. Leaving or losing the host closes the match.

### Deploy the frontend and signaling service

The published Vercel site uses the same-origin `/api/lobby/` function and a dedicated Upstash Redis database. To reproduce it, connect **Upstash for Redis** to the Vercel project in Production, choose **Free**, turn off automatic upgrades, and redeploy. The integration supplies `KV_REST_API_URL` and `KV_REST_API_TOKEN` to the function. Leave `SIGNAL_URL` unset for this setup. Room state expires when the host leaves or its two-minute presence lease lapses. Browsers check the directory or room periodically and send setup changes immediately. During a match, game frames use WebRTC between the playing laptops.

For a static frontend with an external Socket.IO signaling service, configure both services as follows. [Render deployment preset](https://render.com/deploy?repo=https://github.com/Ryan1Dsouza/workshopNucleus)

1. Deploy this repository to a persistent Node 22 web service on Render, Fly.io or Railway. Install with `npm ci --omit=dev`, start with `node server/index.cjs`, and set `LOCAL_HTTPS=0` behind the provider's HTTPS proxy. Enable WebSocket upgrades and use one service instance. Rooms live in memory and expire on host disconnect or server restart.
2. Import the repository into Vercel. The supplied configuration builds with `npm run build` and publishes `dist/web`. Set `SIGNAL_URL` to the HTTPS origin of the Node service. On the service, set `LOBBY_ORIGINS` to the comma-separated frontend origins. Redeploy after changing these values.
3. Set Vercel's `ICE_SERVERS` build variable to a JSON array such as `[{"urls":"stun:stun.example.org:3478"},{"urls":["turn:turn.example.org:3478?transport=udp","turns:turn.example.org:443?transport=tcp"],"username":"player","credential":"temporary-password"}]`. The default supplies public STUN. Configure an active UDP relay and a TLS relay that listens on port 443 to support more networks. Build-time credentials are visible to browsers. Use client-scoped credentials and rotate them before expiry.

Both lobby transports carry discovery, setup, SDP and ICE. Each pair of laptops tries direct UDP and UDP TURN first. An automatic or manual retry also enables configured TURN over TLS on TCP port 443. The unordered WebRTC data channel uses zero SCTP retransmits on either path. A TLS relay can add delay when packets are lost. Hosts can remove a guest from the player list. Removing someone during a match ends it and returns the remaining players to the lobby.

For laptops on separate internet connections, the Vercel lobby can fetch TURN credentials when a player creates or joins a room. Set the sensitive Production variable `METERED_ICE_URL` to your Metered project's full HTTPS `/api/v1/turn/credentials?apiKey=…` URL and redeploy. Only the eligible relay addresses and client credentials go to the room member. A phone can already show **BLE paired** while its laptop is still establishing this connection. Either player can select **Retry laptop connection** from the room. [Metered Open Relay setup](https://www.metered.ca/tools/openrelay/)

## Checks

~~~sh
npm test
npm run audit:stage -- 7
npm run audit:controller
node scripts/audit/multiplayer.mjs
npm run audit:filter
npm run test:native-protocol
~~~

The native byte check needs JDK 17+. Browser checks use simulated GATT/sensors. Check real phones separately; see [verification](docs/VERIFICATION.md).

Fruit Ninja uses Patrick Sun's MIT OpenWii source. Exact attribution and the original source revision remain in [licenses/](licenses/OpenWii-source.json).
