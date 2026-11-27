import test from 'node:test';
import assert from 'node:assert/strict';
import { BluetoothLink } from '../public/core/bluetooth-link.js';
import { kartRaceProfile } from '../public/core/controller-profiles.js';
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
test('display hints stay tied to the BLE slot and an inactive dispatch permits only a fresh recovered capture',async t=>{
  const {fake,link,samples,commands}=fixture(t);
  fake.next=1;await link.connect(1);
  const d=fake.phones[1];d.pose();
  d.control.emit([0x44,3,0x34,0x12]);d.control.emit([0x44,7,0x34,0x12]);d.control.emit([0x44,0]);
  assert.deepEqual(commands,[{slot:1,c:{type:'wheel-rotation',rotation:3,profileEpoch:0x1234,session:samples[0].s.session}}]);
  d.pose(0,0,false);
  d.time-=32;d.pose(); // a new sequence number repeats the pre-suspend pose
  assert.equal(samples.length,1);
  d.time-=8;d.pose(); // a fresh capture between the previous pose and inactive dispatch
  assert.equal(samples.length,2);assert.equal(samples[1].s.poseT-samples[0].s.poseT,8);
  assert.equal(link.diagnostics()[0].captureToSendMs.count,0);
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
test('a lobby mode change replaces an unfinished BLE profile and acknowledges only the final selection', async t => {
  const {fake, link} = fixture(t);
  await link.connect(0);
  const phone = fake.phones[0];
  phone.writeDelay = 1;
  const first = link.sendProfile(0, {...kartRaceProfile('dpad'), profileEpoch:5});
  const last = link.sendProfile(0, {...kartRaceProfile('gyro'), profileEpoch:6});
  const acks = await Promise.all([first, last]);
  assert.deepEqual(acks.map(ack => ack.profileEpoch), [6, 6]);
  assert.equal(phone.profile.layout, 'kart-gyro');
  assert.equal(phone.control.maxWrites, 1);
  assert.deepEqual(phone.control.writes.filter(packet => packet[0] !== 0x41).map(packet => packet[0]), [0x40, 0x40, 0x42]);
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

test('live gyro traffic avoids unnecessary ping writes and continues during a slow control write',async t=>{
  const {fake,link,samples}=fixture(t);await link.connect(0);
  const phone=fake.phones[0],r=link.devices.get(0);phone.pose(0,0);
  await link.ping(r);assert.equal(phone.control.writes.length,0);
  const write=phone.control.writeValueWithResponse.bind(phone.control);
  phone.control.writeValueWithResponse=async bytes=>{await wait(60);return write(bytes);};
  const pending=link.write(r,new Uint8Array([0x11]));
  for(let i=0;i<4;i++){await wait(10);phone.pose(i+1,60);}
  assert.equal(samples.length,5,'a control write blocked incoming motion');
  await pending;assert.equal(r.connected,true);assert.equal(phone.control.maxWrites,1);
});

test('first pairing failure retries the selected phone once without reopening the picker',async t=>{
  const {fake,link,samples,states}=fixture(t),phone=fake.phones[0];
  phone.connectFailures=[new DOMException('Connection attempt failed.','NetworkError')];
  await link.connect(0);phone.pose(2,60);
  assert.equal(fake.requests.length,1);assert.equal(phone.gatt.connects,2);assert.equal(phone.gatt.maxConnects,1);
  assert.equal(link.connected(0),true);assert.equal(samples.length,1);
  assert.ok(states.some(s=>s.text==='Retrying Bluetooth connection…'));
  assert.equal(phone.motion.listeners.size,1);assert.equal(phone.control.listeners.size,1);
});

test('a second failed initial attempt stops with the real error and no background retry',async t=>{
  const {fake,link}=fixture(t),phone=fake.phones[0];
  phone.connectFailures=[new DOMException('Connection attempt failed.','NetworkError'),new DOMException('Still unavailable.','NetworkError')];
  await assert.rejects(link.connect(0),/Still unavailable/);await wait(1100);
  assert.equal(phone.gatt.connects,2);assert.equal(link.has(0),false);assert.equal(phone.motion.listeners.size,0);
});

test('cancelling during the initial retry delay cannot reconnect a removed player',async t=>{
  const {fake,link}=fixture(t),phone=fake.phones[0];phone.connectFailures=[new DOMException('Connection attempt failed.','NetworkError')];
  const pending=link.connect(0);await wait(20);link.disconnect(0);
  await assert.rejects(pending,{name:'AbortError'});await wait(550);
  assert.equal(phone.gatt.connects,1);assert.equal(link.has(0),false);assert.equal(phone.gatt.connected,false);
});

test('permission failures do not trigger an automatic GATT retry',async t=>{
  const {fake,link}=fixture(t),phone=fake.phones[0];phone.connectFailures=[new DOMException('Bluetooth permission denied.','SecurityError')];
  await assert.rejects(link.connect(0),{name:'SecurityError'});assert.equal(phone.gatt.connects,1);assert.equal(link.has(0),false);
});

test('a disconnect during initial notification setup has one serialized retry and clean listeners',async t=>{
  const {fake,link,samples}=fixture(t),phone=fake.phones[0];
  const subscribe=phone.motion.startNotifications.bind(phone.motion);let failed=false;
  phone.motion.startNotifications=async()=>{if(!failed){failed=true;phone.gatt.disconnect();throw new DOMException('GATT Server is disconnected.','NetworkError');}return subscribe();};
  await link.connect(0);phone.pose(3,60);await wait(1100);
  assert.equal(phone.gatt.connects,2);assert.equal(phone.gatt.maxConnects,1);assert.equal(samples.length,1);
  assert.equal(phone.motion.listeners.size,1);assert.equal(phone.control.listeners.size,1);
});

test('reconnecting a verified phone reuses its grant instead of opening the picker again',async t=>{
  const {fake,link}=fixture(t);await link.connect(0);link.disconnect(0);await link.connect(0);
  assert.equal(fake.requests.length,1);assert.equal(fake.phones[0].gatt.connects,2);assert.equal(link.connected(0),true);
});

test('saved slot assignment survives a reload only when the browser still grants that device',async t=>{
  const previous=Object.getOwnPropertyDescriptor(globalThis,'localStorage'),values=new Map();
  Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:k=>values.get(k),setItem:(k,v)=>values.set(k,v)}});
  t.after(()=>{if(previous)Object.defineProperty(globalThis,'localStorage',previous);else delete globalThis.localStorage;});
  const first=fixture(t);await first.link.connect(0);first.link.disconnect(0);
  const next=fixture(t);next.fake.granted=[next.fake.phones[0]];await next.link.loadGrantedDevices();await next.link.connect(0);
  assert.equal(next.fake.requests.length,0);assert.equal(next.link.connected(0),true);
  next.link.disconnect(0);next.fake.granted=[];await next.link.loadGrantedDevices();await next.link.connect(0);
  assert.equal(next.fake.requests.length,1,'a revoked grant must require selecting the phone again');
});

test('choosing another phone bypasses a remembered device and keeps the other slot isolated',async t=>{
  const {fake,link}=fixture(t);await link.connect(0);link.disconnect(0);
  fake.next=1;await link.connect(0,{chooseNew:true});
  assert.equal(fake.requests.length,2);assert.equal(fake.phones[1].gatt.connected,true);assert.equal(fake.phones[0].gatt.connected,false);
  assert.equal(link.has(1),false);
});

test('a late permission preload cannot forget a phone paired while it was pending',async t=>{
  const {fake,link}=fixture(t);await link.loadGrantedDevices();let resolve;
  fake.getDevices=()=>new Promise(r=>{resolve=r;});const preload=link.loadGrantedDevices();
  await link.connect(0);resolve([]);await preload;link.disconnect(0);await link.connect(0);
  assert.equal(fake.requests.length,1);assert.equal(link.connected(0),true);
});
