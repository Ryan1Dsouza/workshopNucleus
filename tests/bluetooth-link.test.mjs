import test from 'node:test';
import assert from 'node:assert/strict';
import { BluetoothLink } from '../public/core/bluetooth-link.js';
import { installFakeBluetooth } from './helpers/fake-bluetooth.mjs';
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const navigatorDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
const secureDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'isSecureContext');
test.after(() => {
  if (navigatorDescriptor) Object.defineProperty(globalThis, 'navigator', navigatorDescriptor); else delete globalThis.navigator;
  if (secureDescriptor) Object.defineProperty(globalThis, 'isSecureContext', secureDescriptor); else delete globalThis.isSecureContext;
});
function fixture(t) {
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: {} });
  Object.defineProperty(globalThis, 'isSecureContext', { configurable: true, writable: true, value: true });
  const fake = installFakeBluetooth(), samples = [], commands = [], states = [];
  const link = new BluetoothLink({ onSample: (s, slot) => samples.push({ s, slot }), onCommand: (c, slot) => commands.push({ c, slot }), onState: s => states.push(s) });
  t.after(() => link.destroy()); return { fake, link, samples, commands, states };
}
test('Bluetooth isolates two players, rejects duplicate phone assignment and malformed or repeated motion', async t => {
  const { fake, link, samples, commands } = fixture(t);
  await link.connect(0); await assert.rejects(link.connect(1), /already assigned/);
  fake.next = 1; await link.connect(1);
  fake.phones[0].pose(0, 0); fake.phones[1].pose(2, 50);
  fake.phones[0].motion.emit(fake.phones[0].motion.value); fake.phones[0].motion.emit([1, 2]);
  assert.deepEqual(samples.map(s => s.slot), [0, 1]);
  fake.phones[1].pose(2, 0, false); fake.phones[1].pose(2, 0, false);
  assert.equal(commands.filter(c => c.c.type === 'suspend').length, 1);
  fake.phones[0].control.emit([2]); assert.equal(commands.at(-1).c.type, 'recentre');
  assert.notEqual(samples[0].s.session, samples[1].s.session);
});
test('GATT writes serialize ping and one newest feedback rather than creating a backlog', async t => {
  const { fake, link } = fixture(t); await link.connect(0);
  const r = link.devices.get(0), pending = link.ping(r);
  link.feedback({ type: 'slice', slot: 0 });
  await pending; await wait(30);
  assert.equal(fake.phones[0].control.maxWrites, 1);
  assert.deepEqual(fake.phones[0].control.writes.map(w => w[0]), [0x10, 0x11]);
  assert.equal(link.diagnostics()[0].rttMs.count, 1);
});
test('reconnect removes old listeners, changes input session and explicit disconnect stops samples', async t => {
  const { fake, link, samples } = fixture(t); await link.connect(0);
  const phone = fake.phones[0]; phone.pose(); const session = samples[0].s.session;
  phone.gatt.disconnect(); phone.dispatchEvent(new Event('gattserverdisconnected'));
  await wait(1100);
  assert.equal(phone.gatt.connects, 2); assert.equal(phone.motion.listeners.size, 1);
  phone.pose(); assert.notEqual(samples.at(-1).s.session, session);
  link.disconnect(0); phone.pose(); assert.equal(samples.length, 2);
  assert.equal(phone.motion.listeners.size, 0); assert.equal(phone.control.listeners.size, 0);
});
test('disconnect during pending GATT connect cannot reactivate a removed player', async t => {
  const { fake, link } = fixture(t); let resolve;
  fake.phones[0].holdConnect = new Promise(r => { resolve = r; });
  const pending = link.connect(0); await wait(0); link.disconnect(0); resolve();
  await assert.rejects(pending, { name: 'AbortError' });
  assert.equal(link.has(0), false); assert.equal(fake.phones[0].gatt.connected, false);
  assert.equal(fake.phones[0].motion.listeners.size, 0);
});
test('unsupported context, picker cancellation and idle metrics are honest and recoverable', async t => {
  const { fake, link } = fixture(t); globalThis.isSecureContext = false;
  await assert.rejects(link.connect(0), /localhost or HTTPS/);
  globalThis.isSecureContext = true; const request = navigator.bluetooth;
  Object.defineProperty(navigator, 'bluetooth', { configurable: true, value: null });
  await assert.rejects(link.connect(0), /Chrome or Edge/);
  Object.defineProperty(navigator, 'bluetooth', { configurable: true, value: request });
  fake.failure = new DOMException('Cancelled', 'NotFoundError');
  await assert.rejects(link.connect(0), { name: 'NotFoundError' }); assert.equal(link.has(0), false);
  fake.failure = null; await link.connect(0); fake.phones[0].pose(); fake.phones[0].pose();
  const now = performance.now();
  assert.ok(link.diagnostics(now)[0].deliveredCaptureHz > 50);
  assert.equal(link.diagnostics(now + 300)[0].deliveredCaptureHz, 0);
  link.resetMetrics(); assert.equal(link.diagnostics()[0].received, 0);
});
