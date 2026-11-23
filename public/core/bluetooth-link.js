import { BLE_SERVICE, BLE_MOTION, BLE_CONTROL, decodeBleFrame, decodeBleCenter, BleTimeline } from './ble-protocol.js';
import { PeerMetrics, RateWindow } from './diagnostics.js';

export class BluetoothLink {
  constructor({ onSample, onCommand, onState } = {}) {
    this.handlers = { onSample, onCommand, onState };
    this.devices = new Map(); this.serial = 0; this.destroyed = false;
    this.probeTimer = setInterval(() => { for (const r of this.devices.values()) void this.ping(r); }, 1000);
  }
  has(slot) { return this.devices.has(slot); }
  connected(slot) { return !!this.devices.get(slot)?.connected; }
  state(r, text) {
    r.text = text;
    this.handlers.onState?.({ slot: r.slot, connected: r.connected, name: r.device.name || 'Android phone', text });
  }
  async connect(slot) {
    if (this.destroyed) throw new Error('Bluetooth receiver was closed. Reload the host.');
    if (![0, 1].includes(slot)) throw new Error('Choose Player 1 or Player 2.');
    if (!globalThis.isSecureContext) throw new Error('Open the laptop host on localhost or HTTPS for Bluetooth.');
    if (!globalThis.navigator?.bluetooth?.requestDevice) throw new Error('Use desktop Chrome or Edge with Bluetooth LE support. Linux may require the experimental Web Platform flag.');
    // The picker must run in the user's click task, before any awaited work.
    const device = await navigator.bluetooth.requestDevice({ filters: [{ services: [BLE_SERVICE] }] });
    if (this.destroyed) return;
    if ([...this.devices.values()].some(r => r.device.id === device.id && r.slot !== slot)) throw new Error('That phone is already assigned to the other player.');
    this.disconnect(slot);
    const r = { device, slot, connected: false, attempt: 0, generation: 0, disposed: false, listeners: [] };
    this.devices.set(slot, r);
    r.onDisconnect = () => this.lost(r);
    device.addEventListener('gattserverdisconnected', r.onDisconnect);
    try { await this.open(r); }
    catch (error) {
      if (this.devices.get(slot) === r) this.disconnect(slot);
      throw error;
    }
  }
  open(r) {
    if (r.opening) return r.opening;
    const generation = ++r.generation;
    const valid = () => !r.disposed && r.generation === generation && this.devices.get(r.slot) === r;
    const check = () => {
      if (!valid()) {
        if (r.disposed && ![...this.devices.values()].some(other => other.device.id === r.device.id)) r.device.gatt.disconnect();
        throw new DOMException('Bluetooth connection was cancelled.', 'AbortError');
      }
    };
    r.opening = (async () => {
      r.connected = false; this.state(r, 'Connecting Bluetooth…');
      this.cleanupListeners(r);
      r.lastSequence = -1; r.paused = false; r.captureAt = null;
      r.session = `ble:${r.device.id}:${++this.serial}`;
      r.timeline = new BleTimeline(); r.metrics = new PeerMetrics(); r.captureRate = new RateWindow();
      r.writeBusy = false; r.pendingFeedback = null; r.pingAt = null;
      const server = await r.device.gatt.connect(); check();
      const service = await server.getPrimaryService(BLE_SERVICE); check();
      const control = await service.getCharacteristic(BLE_CONTROL); check();
      const motion = await service.getCharacteristic(BLE_MOTION); check();
      r.control = control; r.motion = motion;
      const onControl = e => {
        if (!valid() || !r.connected) return;
        const v = e.target.value; if (!v?.byteLength) return;
        const code = v.getUint8(0);
        if (code === 0x90 && v.byteLength === 5 && r.pingAt !== null && v.getUint32(1, true) === r.pingToken) {
          r.metrics.rtt.add(performance.now() - r.pingAt); r.pingAt = null;
        } else if (code === 2) {
          const command = decodeBleCenter(v);
          if (command?.pose) command.pose.t = command.pose.poseT = r.timeline.captureTime(command.pose.t);
          if (command) this.handlers.onCommand?.({ ...command, session: r.session }, r.slot);
        } else if (v.byteLength === 1) {
          const type = ({ 1: 'start', 3: 'suspend' })[code];
          if (type) this.handlers.onCommand?.({ type, session: r.session }, r.slot);
        }
      };
      const onMotion = e => {
        if (!valid() || !r.connected) return;
        const sample = r.timeline.accept(decodeBleFrame(e.target.value)); if (!sample) return;
        const now = performance.now();
        r.metrics.observe(sample, now, r.lastSequence); r.lastSequence = sample.sequence;
        if (sample.active && sample.poseT !== r.captureAt) { r.captureRate.add(sample.poseT); r.captureAt = sample.poseT; r.captureReceivedAt = now; }
        if (!sample.active) {
          if (!r.paused) this.handlers.onCommand?.({ type: 'suspend' }, r.slot);
          r.paused = true; return;
        }
        r.paused = false; this.handlers.onSample?.({ ...sample, session: r.session }, r.slot);
      };
      for (const [characteristic, listener] of [[control, onControl], [motion, onMotion]]) {
        characteristic.addEventListener('characteristicvaluechanged', listener);
        r.listeners.push([characteristic, listener]);
        await characteristic.startNotifications(); check();
      }
      r.connected = true; r.attempt = 0;
      this.state(r, 'Bluetooth ready · center the blade');
    })().finally(() => { r.opening = null; });
    return r.opening;
  }
  cleanupListeners(r) {
    for (const [characteristic, listener] of r.listeners) characteristic.removeEventListener('characteristicvaluechanged', listener);
    r.listeners = [];
  }
  lost(r) {
    if (r.disposed || this.devices.get(r.slot) !== r) return;
    ++r.generation; r.connected = false; r.pingAt = null; r.pendingFeedback = null;
    this.cleanupListeners(r); this.handlers.onCommand?.({ type: 'suspend' }, r.slot);
    if (r.retry) return;
    if (r.attempt >= 2) { this.state(r, 'Bluetooth disconnected · connect again'); return; }
    this.state(r, 'Bluetooth reconnecting…');
    r.retry = setTimeout(async () => {
      // A disconnect during service discovery must not start overlapping GATT operations.
      await r.opening?.catch(() => {});
      r.retry = null;
      if (!r.disposed && !r.connected) await this.open(r).catch(() => this.lost(r));
    }, ++r.attempt * 1000);
  }
  disconnect(slot) {
    const r = this.devices.get(slot); if (!r) return;
    r.disposed = true; ++r.generation; clearTimeout(r.retry); this.devices.delete(slot);
    r.device.removeEventListener('gattserverdisconnected', r.onDisconnect);
    this.cleanupListeners(r); r.pendingFeedback = null;
    r.device.gatt?.disconnect(); r.connected = false; this.state(r, 'Bluetooth disconnected');
  }
  async write(r, bytes) {
    if (!r.connected || r.writeBusy) return false;
    const generation = r.generation, control = r.control;
    r.writeBusy = true;
    try { await control.writeValueWithResponse(bytes); return true; }
    catch { if (r.generation === generation && !r.device.gatt.connected) this.lost(r); return false; }
    finally {
      if (r.generation === generation) {
        r.writeBusy = false;
        const pending = r.pendingFeedback; r.pendingFeedback = null;
        if (pending && performance.now() - pending.at < 150) void this.write(r, new Uint8Array([pending.code]));
      }
    }
  }
  async ping(r) {
    if (!r.connected || r.writeBusy || (r.pingAt !== null && performance.now() - r.pingAt < 2000)) return;
    r.pingAt = performance.now(); r.pingToken = (r.pingAt | 0) >>> 0;
    const generation = r.generation;
    const v = new DataView(new ArrayBuffer(5)); v.setUint8(0, 0x10); v.setUint32(1, r.pingToken, true);
    if (!await this.write(r, new Uint8Array(v.buffer)) && r.generation === generation) r.pingAt = null;
  }
  feedback(data) {
    const code = ({ slice: 0x11, bomb: 0x12, miss: 0x13 })[data.type]; if (!code) return;
    for (const r of this.devices.values()) {
      if (!r.connected || (Number.isInteger(data.slot) && data.slot !== r.slot)) continue;
      const now = performance.now(); if (now - (r.lastFeedback ?? -Infinity) < 50) continue;
      r.lastFeedback = now;
      if (r.writeBusy) r.pendingFeedback = { code, at: now };
      else void this.write(r, new Uint8Array([code]));
    }
  }
  resetMetrics() {
    for (const r of this.devices.values()) { r.metrics = new PeerMetrics(); r.captureRate = new RateWindow(); r.captureAt = null; }
  }
  diagnostics(now = performance.now()) {
    return [...this.devices.values()].map(r => ({ slot: r.slot, name: r.device.name || 'Android phone', path: 'bluetooth', connected: r.connected,
      ...r.metrics?.snapshot(now), deliveredCaptureHz: r.connected && !r.paused && now - r.captureReceivedAt < 250 ? r.captureRate.hz(r.timeline.time) : 0 }));
  }
  destroy() { this.destroyed = true; clearInterval(this.probeTimer); for (const slot of [...this.devices.keys()]) this.disconnect(slot); }
}
