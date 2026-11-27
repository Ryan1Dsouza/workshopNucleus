import {crc32, validateProfile} from './controller-contract.js';

// Hash the canonical profile without its per-connection assignment. A changed
// label, control, or workshop feature then falls back to the full JSON transfer.
export function profileKey(value) {
  const profile = validateProfile(value);
  delete profile.player;
  delete profile.profileEpoch;
  return crc32(new TextEncoder().encode(JSON.stringify(profile)));
}

export function presetPacket(profile, id) {
  const packet = new DataView(new ArrayBuffer(10));
  packet.setUint8(0, 0x46);
  packet.setUint16(1, id, true);
  packet.setUint32(3, profileKey(profile), true);
  packet.setUint8(7, profile.player);
  packet.setUint16(8, profile.profileEpoch, true);
  return new Uint8Array(packet.buffer);
}
