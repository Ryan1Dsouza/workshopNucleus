import test from 'node:test';
import assert from 'node:assert/strict';
import { ButtonStore, BUTTON_BITS, validateProfile, profilePackets, crc32, decodeButtonFrame, encodeButtonFrame } from '../public/core/controller-contract.js';

const profile = { id:'demo', title:'Demo', orientation:'portrait', motion:'none', controls:[{ id:'a', label:'Jump', action:'jump' }], player:1, profileEpoch:12 };
test('multiple fingers, cancellation and all-button release preserve held state', () => {
  const changes = [], store = new ButtonStore(mask => changes.push(mask));
  store.press('a', 1); store.press('a', 2); store.press('b', 3); store.release(1);
  assert.equal(store.mask, BUTTON_BITS.a | BUTTON_BITS.b);
  store.release(2); assert.equal(store.mask, BUTTON_BITS.b);
  store.clear(); assert.equal(store.mask, 0);
  assert.deepEqual(changes, [BUTTON_BITS.a, BUTTON_BITS.a | BUTTON_BITS.b, BUTTON_BITS.b, 0]);
});
test('profiles constrain control ids, duplicates and action mappings', () => {
  assert.equal(validateProfile(profile).controls[0].action, 'jump');
  assert.throws(() => validateProfile({ ...profile, controls:[{id:'script', label:'Run', action:'run'}] }));
  assert.throws(() => validateProfile({ ...profile, controls:[...profile.controls, ...profile.controls] }));
  assert.throws(() => validateProfile({ ...profile, controls:[{id:'a', label:'Run', action:'<script>'}] }));
  assert.throws(() => validateProfile({ ...profile, orientation:'unknown' }));
});
test('profile transfer fits default ATT packets and reconstructs exact UTF-8 with CRC32', () => {
  assert.equal(crc32(new TextEncoder().encode('123456789')), 0xcbf43926);
  const packets = profilePackets({ ...profile, title:'Café controller' }, 65535);
  assert.ok(packets.every(packet => packet.length <= 20));
  const header = new DataView(packets[0].buffer), bytes = new Uint8Array(header.getUint16(3, true));
  let expectedOffset = 0;
  for (const packet of packets.slice(1, -1)) {
    const view = new DataView(packet.buffer);
    assert.equal(view.getUint16(1, true), 65535); assert.equal(view.getUint16(3, true), expectedOffset);
    bytes.set(packet.slice(5), expectedOffset); expectedOffset += packet.length - 5;
  }
  assert.equal(expectedOffset, bytes.length); assert.equal(crc32(bytes), header.getUint32(5, true));
  assert.equal(JSON.parse(new TextDecoder().decode(bytes)).title, 'Café controller');
});
test('button snapshots carry simultaneous state, sequence and profile epoch', () => {
  const bytes = encodeButtonFrame(BUTTON_BITS.a | BUTTON_BITS.left, 65535, 42);
  assert.deepEqual(decodeButtonFrame(new DataView(bytes.buffer)), {mask:BUTTON_BITS.a | BUTTON_BITS.left, sequence:65535, profileEpoch:42});
  const bad = bytes.slice(); new DataView(bad.buffer).setUint16(1, 65535, true);
  assert.equal(decodeButtonFrame(new DataView(bad.buffer)), null);
  assert.equal(decodeButtonFrame(new DataView(new ArrayBuffer(6))), null);
});
