import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { decodeBleFrame, decodeBleCenter } from '../../public/core/ble-protocol.js';
const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'air-slice-codec-'));
const executable = name => process.env.JAVA_HOME ? path.join(process.env.JAVA_HOME, 'bin', name + (process.platform === 'win32' ? '.exe' : '')) : name;
const run = (name, args) => {
  const r = spawnSync(executable(name), args, { encoding: 'utf8' });
  if (r.error || r.status !== 0) throw new Error(`${name} failed. Install JDK 17+ and set JAVA_HOME.\n${r.error?.message || r.stderr}`);
  return r.stdout.trim();
};
try {
  run('javac', ['-d', dir, 'native/android/app/src/main/java/workshop/airslice/ble/FrameCodec.java', 'native/android/protocol-test/CodecGolden.java']);
  const [hex, centerHex] = run('java', ['-cp', dir, 'CodecGolden']).split(/\r?\n/);
  assert.equal(hex, '0103fffff0ffffff00000000825a825a3930ffff');
  const bytes = Uint8Array.from(Buffer.from(hex, 'hex')), frame = decodeBleFrame(new DataView(bytes.buffer));
  assert.equal(frame.sequence, 65535); assert.equal(frame.t, 0xfffffff0); assert.equal(frame.epoch, 65535);
  assert.equal(frame.motion.rx, 123.45); assert.ok(Math.abs(frame.quat[2] - Math.SQRT1_2) < 1e-8);
  assert.equal(centerHex, '02fffff0ffffff00000000825a825a');
  const centerBytes = Uint8Array.from(Buffer.from(centerHex, 'hex'));
  const center = decodeBleCenter(new DataView(centerBytes.buffer));
  assert.equal(center.epoch, 65535); assert.equal(center.pose.poseT, 0xfffffff0);
  assert.ok(Math.abs(center.pose.quat[2] - Math.SQRT1_2) < 1e-8);
  console.log('PASS Java Android encoder → JavaScript decoder, units, normalized quaternion and malformed native data');
} finally { await fs.rm(dir, { recursive: true, force: true }); }
