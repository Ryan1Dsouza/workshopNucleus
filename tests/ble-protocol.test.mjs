import test from 'node:test';
import assert from 'node:assert/strict';
import { decodeBleFrame, decodeBleCenter, BleTimeline } from '../public/core/ble-protocol.js';

function frame({ sequence = 1, t = 1000, epoch = 1, flags = 3, q = [0, 0, 0, 32767] } = {}) {
  const v = new DataView(new ArrayBuffer(20));
  v.setUint8(0, 1); v.setUint8(1, flags); v.setUint16(2, sequence, true); v.setUint32(4, t, true);
  q.forEach((x, i) => v.setInt16(8 + i * 2, x, true));
  v.setUint16(16, 12345, true); v.setUint16(18, epoch, true); return v;
}
test('BLE frame decodes native XYZW quaternion and deg/sec units within a default ATT payload', () => {
  const v = frame({ q: [0, 0, 23170, 23170], epoch: 65535 });
  const s = decodeBleFrame(v);
  assert.equal(s.motion.rx, 123.45); assert.equal(s.epoch, 65535); assert.equal(s.active, true);
  assert.equal(s.motionAge, 0); assert.ok(Math.abs(Math.hypot(...s.quat) - 1) < 1e-12);
});
test('BLE decoder rejects malformed version, length, type and quaternion', () => {
  for (const bad of [null, new Uint8Array(20), new DataView(new ArrayBuffer(19)), frame({ q: [0, 0, 0, 0] }), frame({ q: [32767, 32767, 0, 0] })]) assert.equal(decodeBleFrame(bad), null);
  const bad = frame(); bad.setUint8(0, 2); assert.equal(decodeBleFrame(bad), null);
  assert.equal(decodeBleFrame(frame({flags:255})),null);
  const backing = new Uint8Array(24); backing.set(new Uint8Array(frame().buffer), 2);
  assert.equal(decodeBleFrame(new DataView(backing.buffer, 2, 20)).sequence, 1);
  assert.equal(decodeBleFrame(frame({ flags: 0 })).motionAge, 1000);
});
test('BLE timeline unwraps sequence and capture time, rejects duplicates and reordering without poisoning state', () => {
  const timeline = new BleTimeline(), accept = options => timeline.accept(decodeBleFrame(frame(options)));
  const first = accept({ sequence: 65535, t: 0xfffffff0 });
  const next = accept({ sequence: 0, t: 0, epoch: 2 });
  assert.equal(next.sequence, 65536); assert.equal(next.t - first.t, 16); assert.equal(next.epoch, 2);
  assert.equal(accept({ sequence: 0, t: 0 }), null);
  assert.equal(accept({ sequence: 65535, t: 0xfffffff0 }), null);
  assert.equal(accept({ sequence: 1, t: 0xffffffff }), null);
  assert.equal(accept({ sequence: 2, t: 32 }).sequence, 65538);
});

test('Bluetooth Center blade carries its epoch and captured quaternion in 15 bytes', () => {
  const bytes = Buffer.from('02fffff0ffffff00000000825a825a', 'hex');
  const command = decodeBleCenter(new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength));
  assert.equal(command.type, 'recentre'); assert.equal(command.epoch, 65535);
  assert.equal(command.pose.poseT, 0xfffffff0);
  assert.ok(Math.abs(command.pose.quat[2] - Math.SQRT1_2) < 1e-8);
  assert.equal(command.pose.motionAge, 1000);
  assert.deepEqual(decodeBleCenter(new DataView(Uint8Array.from([2, 0, 0]).buffer)), { type: 'recentre', epoch: 0 });
  assert.deepEqual(decodeBleCenter(new DataView(Uint8Array.from([2]).buffer)), { type: 'recentre' });
  for (const invalid of [null, new DataView(new ArrayBuffer(0)), new DataView(new ArrayBuffer(15)),
    new DataView(Uint8Array.from([2, 0]).buffer), new DataView(Uint8Array.from([1]).buffer)]) {
    assert.equal(decodeBleCenter(invalid), null);
  }
  bytes.fill(0, 7); assert.equal(decodeBleCenter(new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)), null);
});

test('a late BLE calibration anchor unwraps its clock without consuming the motion sequence', () => {
  const timeline = new BleTimeline();
  timeline.accept(decodeBleFrame(frame({ sequence: 65535, t: 0xfffffff0 })));
  timeline.accept(decodeBleFrame(frame({ sequence: 0, t: 0 })));
  assert.equal(timeline.captureTime(0xfffffff0), 0xfffffff0);
  assert.equal(timeline.captureTime(16), 0x100000010);
  assert.equal(timeline.accept(decodeBleFrame(frame({ sequence: 1, t: 16 }))).sequence, 65537);
});
