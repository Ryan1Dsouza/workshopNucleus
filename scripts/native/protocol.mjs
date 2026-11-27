import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { decodeBleFrame, decodeBleCenter } from '../../public/core/ble-protocol.js';
import { decodeButtonFrame, profilePackets, validateProfile } from '../../public/core/controller-contract.js';
const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'controllerkit-codec-'));
const executable = name => process.env.JAVA_HOME ? path.join(process.env.JAVA_HOME, 'bin', name + (process.platform === 'win32' ? '.exe' : '')) : name;
const run = (name, args) => {
  const r = spawnSync(executable(name), args, { encoding: 'utf8' });
  if (r.error || r.status !== 0) throw new Error(`${name} failed. Install JDK 17+ and set JAVA_HOME.\n${r.error?.message || r.stderr}`);
  return r.stdout.trim();
};
try {
  run('javac', ['-d', dir, 'native/android/app/src/main/java/workshop/airslice/ble/SensorClock.java', 'native/android/app/src/main/java/workshop/airslice/ble/FrameCodec.java','native/android/app/src/main/java/workshop/airslice/ble/ProfileTransfer.java','native/android/app/src/main/java/workshop/airslice/ble/BleControlQueue.java', 'native/android/protocol-test/CodecGolden.java']);
  const profile=validateProfile({id:'demo',title:'Café controller',orientation:'portrait',motion:'none',controls:[{id:'a',label:'Jump',action:'jump'}],player:1,profileEpoch:42});
  const packets=profilePackets(profile,65535).map(packet=>Buffer.from(packet).toString('hex'));
  const [hex, centerHex, buttonHex, profileHex] = run('java', ['-cp', dir, 'CodecGolden',...packets]).split(/\r?\n/);
  assert.equal(hex, '0103fffff0ffffff00000000825a825a3930ffff');
  const bytes = Uint8Array.from(Buffer.from(hex, 'hex')), frame = decodeBleFrame(new DataView(bytes.buffer));
  assert.equal(frame.sequence, 65535); assert.equal(frame.t, 0xfffffff0); assert.equal(frame.epoch, 65535);
  assert.equal(frame.motion.rx, 123.45); assert.ok(Math.abs(frame.quat[2] - Math.SQRT1_2) < 1e-8);
  assert.equal(centerHex, '02fffff0ffffff00000000825a825a');
  const centerBytes = Uint8Array.from(Buffer.from(centerHex, 'hex'));
  const center = decodeBleCenter(new DataView(centerBytes.buffer));
  assert.equal(center.epoch, 65535); assert.equal(center.pose.poseT, 0xfffffff0);
  assert.ok(Math.abs(center.pose.quat[2] - Math.SQRT1_2) < 1e-8);
  assert.equal(buttonHex,'041800ffff2a00');const buttonBytes=Uint8Array.from(Buffer.from(buttonHex,'hex'));
  assert.deepEqual(decodeButtonFrame(new DataView(buttonBytes.buffer)),{mask:24,sequence:65535,profileEpoch:42});
  assert.deepEqual(JSON.parse(Buffer.from(profileHex,'hex').toString('utf8')),profile);
  console.log('PASS Java/JavaScript motion, center, buttons, profiles, malformed data and fair bounded native motion/control scheduling');
} finally {
  const resolved=await fs.realpath(dir), temporaryRoot=await fs.realpath(os.tmpdir());
  assert.equal(path.dirname(resolved).toLowerCase(),temporaryRoot.toLowerCase());assert.ok(path.basename(resolved).startsWith('controllerkit-codec-'));
  await fs.rm(resolved, { recursive: true, force: true });
}
