# Check Wi-Fi before changing the sensor engine

Cloudflare HTTPS unlocks browser sensors and delivers pages/signaling. It does not improve local Wi-Fi. When **Motion check** shows `direct`, movement takes the local WebRTC path; `relay` may include an Internet round trip through the tunnel. One direct phone does not prove both phones are direct.

## A repeatable comparison

1. Use the same private LAN for laptop and phones. Keep the controller page visible. If supported, use a nearby 5 GHz access point; older phones may need 2.4 GHz. An Ethernet-connected laptop on the same LAN can reduce contention.
2. Reload, pair, center, choose Direct and reset measurements. Move for 20 seconds and save the report. Capture idle separately so intentional pauses do not dominate maximum arrival gaps.
3. Compare with a laptop hotspot or a private portable router, where the OS/network adapter supports it. Reopen `/host` and regenerate the QR for that network. Keep the development certificate/HTTPS requirement in mind. Do not blindly reuse an old LAN QR address.
4. Compare per-phone path, RTT median/p95, received/pose Hz, arrival gap p95, and frame CPU. A constant low RTT with sparse pose readings points toward sensors. Healthy sensor readings with uneven RTT/gaps point toward transport or endpoint scheduling. High frame CPU points toward the laptop/render workload. Several can contribute together.

Guest/student Wi-Fi often isolates clients. A Cloudflare page loading successfully does not prove local peer connectivity. Ask the venue for a private LAN or provide a hotspot fallback for the workshop. Keep background downloads, VPNs and competing traffic out of the comparison; changing several variables at once makes the cause harder to assess.

The RTT probe travels on a control/echo path and includes browser scheduling. Frame CPU excludes GPU completion. None of these is a physical sensor-to-screen measurement. A high-frame-rate recording of hand and display, or a dedicated hardware reference, is needed for that claim.

Native sensor apps also depend on the connection. If browser orientation remains sparse after the network comparison, [SensorServer](https://github.com/UmerCodez/SensorServer) can stream Android sensors and [ZIG SIM](https://1-10.github.io/ZIGSIM_docs/tutorial.html) can send UDP/JSON gyro/quaternion readings to a local adapter. Keep this optional: installing apps and handling extra firewall/protocol settings is unsuitable as the default entry path for an unknown workshop audience.
