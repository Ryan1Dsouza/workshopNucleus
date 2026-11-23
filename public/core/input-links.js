import { features } from '../stage.mjs';

export async function createGameLink(options) {
  if (features.phone) {
    const { GameLink } = await import('./net.js');
    return new GameLink(options);
  }
  // Desktop stages run without importing phone or Bluetooth modules.
  return { slots: [], peers: new Map(), controllers: 0, rtt: null,
    handlers: { ...options, onSample: options.onOrientation },
    feedback() {}, destroy() {}, diagnostics: () => ({ sent: 0, locallyDropped: 0, peers: [] }) };
}

export async function createBluetoothLink(options) {
  if (features.bluetooth) {
    const { BluetoothLink } = await import('./bluetooth-link.js');
    return new BluetoothLink(options);
  }
  return { devices: new Map(), has: () => false, connected: () => false,
    feedback() {}, resetMetrics() {}, destroy() {}, diagnostics: () => [] };
}
