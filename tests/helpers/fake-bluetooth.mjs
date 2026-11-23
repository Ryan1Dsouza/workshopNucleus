// Deterministic GATT fixture. It tests app logic, not radio performance.
export function installFakeBluetooth(target = globalThis) {
  const SERVICE = '4d1a0001-9cf1-4ee3-a71b-9438ef5d3400';
  const MOTION = '4d1a0002-9cf1-4ee3-a71b-9438ef5d3400';
  const CONTROL = '4d1a0003-9cf1-4ee3-a71b-9438ef5d3400';
  class Emitter extends EventTarget {
    constructor() { super(); this.listeners = new Set(); }
    addEventListener(type, fn) { super.addEventListener(type, fn); this.listeners.add(fn); }
    removeEventListener(type, fn) { super.removeEventListener(type, fn); this.listeners.delete(fn); }
  }
  class Characteristic extends Emitter {
    constructor(uuid) { super(); this.uuid = uuid; this.writes = []; this.activeWrites = 0; this.maxWrites = 0; }
    async startNotifications() { this.subscribed = true; return this; }
    emit(bytes) { this.value = bytes instanceof DataView ? bytes : new DataView(Uint8Array.from(bytes).buffer); this.dispatchEvent(new Event('characteristicvaluechanged')); }
    async writeValueWithResponse(bytes) {
      this.activeWrites++; this.maxWrites = Math.max(this.maxWrites, this.activeWrites); this.writes.push([...bytes]);
      await new Promise(resolve => setTimeout(resolve, 8));
      if (bytes[0] === 0x10) this.emit([0x90, ...bytes.slice(1)]);
      this.activeWrites--;
    }
  }
  function phone(id) {
    const device = new Emitter(); device.id = id; device.name = 'Test Android ' + id;
    device.motion = new Characteristic(MOTION); device.control = new Characteristic(CONTROL);
    device.sequence = 0; device.time = 1000; device.epoch = 1;
    device.gatt = {
      connected: false, connects: 0,
      async connect() { this.connects++; if (device.holdConnect) await device.holdConnect; this.connected = true; return this; },
      async getPrimaryService(uuid) { if (uuid !== SERVICE) throw Error('Wrong service'); return this; },
      async getCharacteristic(uuid) { return uuid === MOTION ? device.motion : device.control; },
      disconnect() { const was = this.connected; this.connected = false; if (was) device.dispatchEvent(new Event('gattserverdisconnected')); },
    };
    device.pose = (angle = 0, speed = 0, active = true) => {
      const v = new DataView(new ArrayBuffer(20));
      v.setUint8(0, 1); v.setUint8(1, active ? 3 : 0); v.setUint16(2, device.sequence++, true);
      v.setUint32(4, device.time += 16, true);
      const q = [0, 0, Math.sin(angle * Math.PI / 360), Math.cos(angle * Math.PI / 360)];
      q.forEach((x, i) => v.setInt16(8 + i * 2, Math.round(x * 32767), true));
      v.setUint16(16, speed * 100, true); v.setUint16(18, device.epoch, true); device.motion.emit(v);
    };
    device.center = (angle = 0, motionFirst = false) => {
      device.epoch = (device.epoch + 1) & 65535;
      const v = new DataView(new ArrayBuffer(15));
      v.setUint8(0, 2); v.setUint16(1, device.epoch, true); v.setUint32(3, device.time, true);
      const q = [0, 0, Math.sin(angle * Math.PI / 360), Math.cos(angle * Math.PI / 360)];
      q.forEach((x, i) => v.setInt16(7 + i * 2, Math.round(x * 32767), true));
      if (motionFirst) device.pose(angle + 1, 60);
      device.control.emit(v);
      if (!motionFirst) device.pose(angle + 1, 60);
    };
    return device;
  }
  const phones = [phone('one'), phone('two')];
  const state = { phones, next: 0, failure: null, requests: [],
    async requestDevice(options) { this.requests.push(options); if (this.failure) throw this.failure; return this.phones[this.next]; },
  };
  Object.defineProperty(target.navigator, 'bluetooth', { configurable: true, value: state });
  target.__fakeBle = state;
  return state;
}
