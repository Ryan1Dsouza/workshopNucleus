// Neutral controller vocabulary shared by the host, profiles and phone UI.
export const BUTTON_IDS = Object.freeze(['up', 'right', 'down', 'left', 'a', 'b', 'one', 'two', 'plus', 'minus', 'home']);
export const BUTTON_BITS = Object.freeze(Object.fromEntries(BUTTON_IDS.map((id, index) => [id, 1 << index])));
export const BUTTON_MASK = (1 << BUTTON_IDS.length) - 1;
export const PROFILE_LIMIT = 4096;

export function validateProfile(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('A controller profile must be an object.');
  if (!/^[a-z][a-z0-9-]{0,31}$/.test(value.id)) throw new Error('Invalid profile id.');
  if (typeof value.title !== 'string' || !value.title.trim() || value.title.length > 48) throw new Error('Invalid profile title.');
  if (!['portrait', 'landscape'].includes(value.orientation)) throw new Error('Invalid controller orientation.');
  if (!['none', 'aim', 'steer'].includes(value.motion)) throw new Error('Invalid motion mapping.');
  if (!Array.isArray(value.controls) || value.controls.length > BUTTON_IDS.length) throw new Error('Invalid profile controls.');
  const seen = new Set();
  const controls = value.controls.map(control => {
    if (!control || !BUTTON_IDS.includes(control.id) || seen.has(control.id)) throw new Error('Unsupported or duplicate control.');
    if (typeof control.label !== 'string' || !control.label.trim() || control.label.length > 20) throw new Error('Invalid control label.');
    if (!/^[a-z][a-z0-9.-]{0,39}$/.test(control.action)) throw new Error('Invalid action mapping.');
    seen.add(control.id);
    return { id: control.id, label: control.label, action: control.action };
  });
  const profile = { id: value.id, title: value.title.trim(), orientation: value.orientation, motion: value.motion,
    controls, instruction: typeof value.instruction === 'string' ? value.instruction.slice(0, 160) : '',
    centerLabel: typeof value.centerLabel === 'string' ? value.centerLabel.slice(0, 24) : 'Center motion' };
  if (value.player !== undefined) {
    if (![1, 2].includes(value.player)) throw new Error('Invalid player assignment.');
    profile.player = value.player;
  }
  if (value.profileEpoch !== undefined) {
    if (!Number.isInteger(value.profileEpoch) || value.profileEpoch < 0 || value.profileEpoch > 65535) throw new Error('Invalid profile epoch.');
    profile.profileEpoch = value.profileEpoch;
  }
  return profile;
}

export function buttonState(mask) {
  return Object.fromEntries(BUTTON_IDS.map(id => [id, !!(mask & BUTTON_BITS[id])]));
}

// Multiple fingers may hold the same button. Releasing one must not release all.
export class ButtonStore {
  constructor(onChange = () => {}) { this.held = new Map(); this.onChange = onChange; }
  get mask() { let mask = 0; for (const [id, pointers] of this.held) if (pointers.size) mask |= BUTTON_BITS[id]; return mask; }
  press(id, pointer) {
    if (!BUTTON_IDS.includes(id)) return;
    const before = this.mask;
    if (!this.held.has(id)) this.held.set(id, new Set());
    this.held.get(id).add(pointer);
    if (before !== this.mask) this.onChange(this.mask);
  }
  release(pointer) {
    const before = this.mask;
    for (const pointers of this.held.values()) pointers.delete(pointer);
    if (before !== this.mask) this.onChange(this.mask);
  }
  clear() { const before = this.mask; this.held.clear(); if (before) this.onChange(0); }
}

export function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

export function profilePackets(value, transferId) {
  const profile = validateProfile(value);
  const bytes = new TextEncoder().encode(JSON.stringify(profile));
  if (bytes.length > PROFILE_LIMIT) throw new Error('Controller profile exceeds the BLE transfer limit.');
  const begin = new DataView(new ArrayBuffer(9));
  begin.setUint8(0, 0x40); begin.setUint16(1, transferId, true);
  begin.setUint16(3, bytes.length, true); begin.setUint32(5, crc32(bytes), true);
  const packets = [new Uint8Array(begin.buffer)];
  for (let offset = 0; offset < bytes.length; offset += 15) {
    const chunk = bytes.slice(offset, offset + 15), packet = new DataView(new ArrayBuffer(5 + chunk.length));
    packet.setUint8(0, 0x41); packet.setUint16(1, transferId, true); packet.setUint16(3, offset, true);
    new Uint8Array(packet.buffer).set(chunk, 5); packets.push(new Uint8Array(packet.buffer));
  }
  const end = new DataView(new ArrayBuffer(3)); end.setUint8(0, 0x42); end.setUint16(1, transferId, true);
  packets.push(new Uint8Array(end.buffer));
  return packets;
}

export function decodeButtonFrame(view) {
  if (!(view instanceof DataView) || view.byteLength !== 7 || view.getUint8(0) !== 4) return null;
  const mask = view.getUint16(1, true);
  if (mask & ~BUTTON_MASK) return null;
  return { mask, sequence: view.getUint16(3, true), profileEpoch: view.getUint16(5, true) };
}

export function encodeButtonFrame(mask, sequence, profileEpoch) {
  const view = new DataView(new ArrayBuffer(7)); view.setUint8(0, 4);
  view.setUint16(1, mask & BUTTON_MASK, true); view.setUint16(3, sequence, true); view.setUint16(5, profileEpoch, true);
  return new Uint8Array(view.buffer);
}

export function decodeProfileAck(view) {
  return view instanceof DataView && view.byteLength === 6 && view.getUint8(0) === 0x43
    ? { transferId: view.getUint16(1, true), ok: view.getUint8(3) === 0, profileEpoch: view.getUint16(4, true) } : null;
}
