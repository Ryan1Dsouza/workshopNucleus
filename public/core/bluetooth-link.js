import { BLE_SERVICE, BLE_MOTION, BLE_CONTROL, decodeBleFrame, decodeBleCenter, BleTimeline } from './ble-protocol.js';
import { PeerMetrics, RateWindow } from './diagnostics.js';
import { decodeButtonFrame, decodeProfileAck, profilePackets } from './controller-contract.js';

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const transientWriteErrors = new Set(['NetworkError','OperationError','UnknownError','TimeoutError','AbortError']);

export class BluetoothLink {
  constructor({ onSample, onCommand, onState, onButtons } = {}) {
    this.handlers = { onSample, onCommand, onState, onButtons };
    this.devices = new Map(); this.serial = 0; this.destroyed = false;
    this.savedIds=[0,1].map(slot=>{try{return globalThis.localStorage?.getItem('controllerkit.ble.player.'+slot)||'';}catch{return '';}});
    this.grantedDevices=[];this.grantVersion=0;void this.loadGrantedDevices();
    this.probeTimer = setInterval(() => { for (const r of this.devices.values()) void this.ping(r); }, 1000);
  }
  has(slot) { return this.devices.has(slot); }
  connected(slot) { return !!this.devices.get(slot)?.connected; }
  async loadGrantedDevices(){
    const version=this.grantVersion;
    try{const granted=await navigator.bluetooth?.getDevices?.();if(!this.destroyed&&version===this.grantVersion)this.grantedDevices=Array.isArray(granted)?granted:[];}
    catch{if(version===this.grantVersion)this.grantedDevices=[];}
  }
  hasSavedPhone(slot){return !!this.savedIds[slot];}
  remember(slot,device){
    this.grantVersion++;
    this.savedIds[slot]=device.id;
    if(!this.grantedDevices.some(d=>d.id===device.id))this.grantedDevices.push(device);
    try{globalThis.localStorage?.setItem('controllerkit.ble.player.'+slot,device.id);}catch{/* A private session can retain the device in memory. */}
  }
  state(r, text) {
    r.text = text;
    this.handlers.onState?.({ slot: r.slot, session: r.session, connected: r.connected, name: r.device.name || 'Phone controller', text });
  }
  async connect(slot, {chooseNew = false} = {}) {
    if (this.destroyed) throw new Error('Bluetooth receiver was closed. Reload the host.');
    if (![0, 1].includes(slot)) throw new Error('Choose Player 1 or Player 2.');
    if (!globalThis.isSecureContext) throw new Error('Open the laptop host on localhost or HTTPS for Bluetooth.');
    if (!globalThis.navigator?.bluetooth?.requestDevice) throw new Error('Use desktop Chrome or Edge with Bluetooth LE support. Linux may require the experimental Web Platform flag.');
    // Reuse this player's previously verified device only while the browser
    // still grants access. A new choice keeps the picker in the click task.
    const saved=!chooseNew&&this.grantedDevices.find(d=>d.id===this.savedIds[slot]);
    const device = saved || await navigator.bluetooth.requestDevice({ filters: [{ services: [BLE_SERVICE] }] });
    if (this.destroyed) return;
    if ([...this.devices.values()].some(r => r.device.id === device.id && r.slot !== slot)) throw new Error('That phone is already assigned to the other player.');
    this.disconnect(slot);
    const r = { device, slot, connected: false, attempt: 0, generation: 0, disposed: false, initializing: true, listeners: [] };
    this.devices.set(slot, r);
    r.onDisconnect = () => {
      if(r.initializing){
        r.disconnectedDuringOpen=true;++r.generation;r.connected=false;this.cleanupListeners(r);
      }else this.lost(r);
    };
    device.addEventListener('gattserverdisconnected', r.onDisconnect);
    try {
      try { await this.open(r); }
      catch(error){
        const nonRetryable=['SecurityError','NotAllowedError','NotFoundError','NotSupportedError'].includes(error?.name);
        const transient=!nonRetryable&&(error?.name==='NetworkError'||/connection attempt failed|failed to connect|gatt.*disconnected/i.test(error?.message||'')||error?.name==='AbortError'&&r.disconnectedDuringOpen);
        if(!transient||r.disposed||this.destroyed||this.devices.get(slot)!==r)throw error;
        // Windows can reject the first GATT attempt after pairing. Reuse the
        // selected device once, after all discovery/notification work settles.
        this.cleanupListeners(r);
        if(device.gatt.connected)device.gatt.disconnect();
        this.state(r,'Retrying Bluetooth connection…');
        await new Promise((resolve,reject)=>{
          const timer=setTimeout(resolve,500);
          r.cancelInitialRetry=()=>{clearTimeout(timer);reject(new DOMException('Bluetooth connection was cancelled.','AbortError'));};
        });
        r.cancelInitialRetry=null;
        if(r.disposed||this.destroyed||this.devices.get(slot)!==r)throw new DOMException('Bluetooth connection was cancelled.','AbortError');
        r.disconnectedDuringOpen=false;
        await this.open(r);
      }
    }
    catch (error) {
      if (this.devices.get(slot) === r) this.disconnect(slot);
      throw error;
    }
    finally {r.initializing=false;r.cancelInitialRetry=null;}
    this.remember(slot,device);
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
      r.forwardedAt = r.forwardedEpoch = null;
      r.session = `ble:${r.device.id}:${++this.serial}`;
      r.profileTask = null; r.profileSync = false;
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
        if (code === 4) {
          const buttons = decodeButtonFrame(v);
          if (buttons) this.handlers.onButtons?.(buttons, r.slot, r.session);
          return;
        }
        if (code === 0x44 && v.byteLength === 4 && v.getUint8(1) <= 3) {
          this.handlers.onCommand?.({type:'wheel-rotation',rotation:v.getUint8(1),profileEpoch:v.getUint16(2,true),session:r.session},r.slot);
          return;
        }
        if (code === 0x43) {
          const ack = decodeProfileAck(v);
          if (ack?.transferId === r.profileTransferId) r.resolveProfileAck?.(ack);
          return;
        }
        if (code === 0x90 && v.byteLength === 5 && r.pingAt !== null && v.getUint32(1, true) === r.pingToken) {
          r.metrics.rtt.add(performance.now() - r.pingAt); r.pingAt = null;
        } else if (code === 2) {
          const command = decodeBleCenter(v);
          if (command?.pose) command.pose.t = command.pose.poseT = r.timeline.captureTime(command.pose.t);
          if (command) this.handlers.onCommand?.({ ...command, source:'bluetooth-native', session: r.session }, r.slot);
        } else if (v.byteLength === 1) {
          const type = ({ 1: 'start', 3: 'suspend', 5: 'disconnect' })[code];
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
        if (r.forwardedAt===sample.poseT && r.forwardedEpoch===sample.epoch) return;
        r.forwardedAt=sample.poseT; r.forwardedEpoch=sample.epoch;
        r.paused = false; this.handlers.onSample?.({ ...sample, session: r.session }, r.slot);
      };
      for (const [characteristic, listener] of [[control, onControl], [motion, onMotion]]) {
        characteristic.addEventListener('characteristicvaluechanged', listener);
        r.listeners.push([characteristic, listener]);
        await characteristic.startNotifications(); check();
      }
      r.connected = true; r.attempt = 0;
      this.state(r, 'Bluetooth connected');
    })().finally(() => { r.opening = null; });
    return r.opening;
  }
  cleanupListeners(r) {
    for (const [characteristic, listener] of r.listeners) characteristic.removeEventListener('characteristicvaluechanged', listener);
    r.listeners = [];
  }
  lost(r) {
    if (r.disposed || this.devices.get(r.slot) !== r) return;
    ++r.generation; r.connected = false; r.pingAt = null; r.pendingFeedback = null; r.desiredProfile=null;
    r.resolveProfileAck?.({ok:false,profileEpoch:-1});r.resolveProfileAck=null;
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
    r.cancelInitialRetry?.();r.cancelInitialRetry=null;
    r.desiredProfile=null;r.resolveProfileAck?.({ok:false,profileEpoch:-1});r.resolveProfileAck=null;
    r.device.removeEventListener('gattserverdisconnected', r.onDisconnect);
    this.cleanupListeners(r); r.pendingFeedback = null;
    r.device.gatt?.disconnect(); r.connected = false; this.state(r, 'Bluetooth disconnected');
  }
  async write(r, bytes, required = false) {
    if (!r.connected || r.writeBusy) return false;
    const generation = r.generation, control = r.control;
    r.writeBusy = true;
    try { await control.writeValueWithResponse(bytes); return true; }
    catch (error) {
      if (r.generation === generation && !r.device.gatt.connected) this.lost(r);
      if (required) throw error;
      return false;
    }
    finally {
      if (r.generation === generation) {
        r.writeBusy = false;
        const pending = r.pendingFeedback; r.pendingFeedback = null;
        if (pending && !r.profileSync && performance.now() - pending.at < 150) void this.write(r, new Uint8Array([pending.code]));
      }
    }
  }
  async ping(r) {
    // Live sensor packets already prove liveness. Probe quiet links only so
    // echo traffic cannot compete with active motion and control edges.
    if (!r.connected || r.writeBusy || r.profileSync || r.metrics.lastAt!==null&&performance.now()-r.metrics.lastAt<500 || (r.pingAt !== null && performance.now() - r.pingAt < 2000)) return;
    r.pingAt = performance.now(); r.pingToken = (r.pingAt | 0) >>> 0;
    const generation = r.generation;
    const v = new DataView(new ArrayBuffer(5)); v.setUint8(0, 0x10); v.setUint32(1, r.pingToken, true);
    if (!await this.write(r, new Uint8Array(v.buffer)) && r.generation === generation) r.pingAt = null;
  }
  feedback(data) {
    const code = ({ slice: 0x11, bomb: 0x12, miss: 0x13 })[data.type]; if (!code) return;
    for (const r of this.devices.values()) {
      if (!r.connected || r.profileSync || (Number.isInteger(data.slot) && data.slot !== r.slot)) continue;
      const now = performance.now(); if (now - (r.lastFeedback ?? -Infinity) < 50) continue;
      r.lastFeedback = now;
      if (r.writeBusy) r.pendingFeedback = { code, at: now };
      else void this.write(r, new Uint8Array([code]));
    }
  }
  resetMetrics() {
    for (const r of this.devices.values()) { r.metrics = new PeerMetrics(); r.captureRate = new RateWindow(); r.captureAt = null; }
  }
  async transferProfile(r, profile, check) {
    const id = r.profileTransferId = (++this.serial) & 65535;
    const packets = profilePackets(profile, id);
    let resolveAck, timer;
    const acknowledged = new Promise(resolve => { resolveAck = resolve; });
    r.resolveProfileAck = resolveAck;
    try {
      for (const packet of packets) {
        while (r.writeBusy) { await wait(5); check(); }
        check();
        if (r.desiredProfile) return;
        if (!await this.write(r, packet, true)) throw new DOMException('Bluetooth is busy.', 'NetworkError');
      }
      // Start the confirmation window after the final acknowledged write.
      const timeout = new Promise((_, reject) => {
        timer = setTimeout(() => reject(new DOMException('The phone did not confirm its controls.', 'TimeoutError')), 8000);
      });
      const ack = await Promise.race([acknowledged, timeout]);
      check();
      if (r.desiredProfile) return;
      if (!ack?.ok || ack.profileEpoch !== profile.profileEpoch) throw new Error('The phone rejected these controls.');
      return ack;
    } finally {
      clearTimeout(timer);
      if (r.resolveProfileAck === resolveAck) r.resolveProfileAck = null;
    }
  }
  async sendProfile(slot, profile) {
    const r = this.devices.get(slot);
    if (!r?.connected) throw new Error('Connect the controller before assigning a profile.');
    r.desiredProfile = profile;
    if (r.profileTask) {
      r.resolveProfileAck?.(null);
      return r.profileTask;
    }
    const generation = r.generation;
    const check = () => {
      if (!r.connected || r.disposed || r.generation !== generation) throw new DOMException('Controller disconnected during profile sync.', 'AbortError');
    };
    r.profileSync = true;
    r.profileTask = (async () => {
      try {
        let ack, attempts = 0, previous;
        while (r.desiredProfile) {
          check();
          const next = r.desiredProfile; r.desiredProfile = null;
          if (previous !== next) attempts = 0;
          previous = next;
          try {
            ack = await this.transferProfile(r, next, check);
          } catch (error) {
            check();
            if (r.desiredProfile) continue;
            if (!transientWriteErrors.has(error.name) || ++attempts >= 3) throw error;
            // A write can fail AFTER the phone consumed its chunk. A fresh
            // transfer ID rewinds the receiver safely, even at a partial offset.
            r.desiredProfile = next;
            await wait(attempts * 150);
          }
          check();
        }
        return ack;
      } finally {
        if (r.generation === generation) { r.profileSync = false; r.profileTask = null; }
      }
    })();
    return r.profileTask;
  }
  diagnostics(now = performance.now()) {
    return [...this.devices.values()].map(r => ({ slot: r.slot, name: r.device.name || 'Android phone', path: 'bluetooth', connected: r.connected,
      ...r.metrics?.snapshot(now), deliveredCaptureHz: r.connected && !r.paused && now - r.captureReceivedAt < 250 ? r.captureRate.hz(r.timeline.time) : 0 }));
  }
  destroy() { this.destroyed = true; clearInterval(this.probeTimer); for (const slot of [...this.devices.keys()]) this.disconnect(slot); }
}
