import test from 'node:test';
import assert from 'node:assert/strict';
import { ControllerState } from '../public/core/controller-state.js';
import { BUTTON_BITS } from '../public/core/controller-contract.js';

const profile = {id:'demo', title:'Demo', orientation:'portrait', motion:'none', controls:[{id:'a', label:'Go', action:'go'}]};
function connected() {
  const state = new ControllerState(); const epoch = state.setProfile(profile);
  for (const slot of [0,1]) { state.connect(slot, 'session'+slot, 'Phone '+slot); state.markReady(slot, epoch); }
  return state;
}
test('button edges survive a quick press/release and are consumed once', () => {
  const state = connected();
  state.buttons(0, {mask:BUTTON_BITS.a, sequence:1, profileEpoch:state.profileEpoch}, 'session0', 100);
  state.buttons(0, {mask:0, sequence:2, profileEpoch:state.profileEpoch}, 'session0', 110);
  const frame = state.sample(0, 115);
  assert.equal(frame.buttons.a, false); assert.equal(frame.pressed.a, true); assert.equal(frame.released.a, true);
  assert.equal(state.sample(0, 120).pressed.a, false);
});
test('stale sessions, sequences and profile epochs cannot restore held input', () => {
  const state = connected(); const old = state.profileEpoch;
  assert.equal(state.buttons(0, {mask:BUTTON_BITS.a, sequence:2, profileEpoch:old}, 'session0', 100), true);
  assert.equal(state.buttons(0, {mask:0, sequence:1, profileEpoch:old}, 'session0', 101), false);
  state.setProfile(profile); state.markReady(0, state.profileEpoch);
  assert.equal(state.buttons(0, {mask:BUTTON_BITS.a, sequence:3, profileEpoch:old}, 'session0', 102), false);
  assert.equal(state.sample(0, 103).buttons.a, false);
  assert.equal(state.buttons(0, {mask:BUTTON_BITS.a, sequence:4, profileEpoch:state.profileEpoch}, 'old-session', 104), false);
});
test('disconnect and held-input watchdog release only the affected player', () => {
  const state = connected();
  for (const slot of [0,1]) state.buttons(slot, {mask:BUTTON_BITS.a, sequence:1, profileEpoch:state.profileEpoch}, 'session'+slot, 100);
  state.disconnect(0);
  assert.equal(state.sample(0, 110).buttons.a, false); assert.equal(state.sample(1, 110).buttons.a, true);
  assert.equal(state.sample(1, 1400).buttons.a, false);
});
test('button sequence rollover remains monotonic', () => {
  const state = connected(); const epoch = state.profileEpoch;
  assert.equal(state.buttons(0, {mask:BUTTON_BITS.a, sequence:65535, profileEpoch:epoch}, 'session0', 100), true);
  assert.equal(state.buttons(0, {mask:0, sequence:0, profileEpoch:epoch}, 'session0', 110), true);
  assert.equal(state.buttons(0, {mask:BUTTON_BITS.a, sequence:65535, profileEpoch:epoch}, 'session0', 120), false);
});
test('landscape wheel steers by horizon tilt across flat, 45deg, upright, reverse, and portrait-start grips', () => {
  const mul = (a, b) => {
    const [x, y, z, w] = a, [X, Y, Z, W] = b;
    return [w*X+x*W+y*Z-z*Y, w*Y-x*Z+y*W+z*X, w*Z+x*Y-y*X+z*W, w*W-x*X-y*Y-z*Z];
  };
  const axisAngle = (ax, ay, az, deg) => {
    const h = (deg * Math.PI / 180) / 2, s = Math.sin(h);
    return [ax * s, ay * s, az * s, Math.cos(h)];
  };
  const state = new ControllerState();
  state.setProfile({...profile, motion:'steer', orientation:'landscape'});
  const player = state.player(0);
  const expected = (22.5 - 2.5) / (38 - 2.5);
  // Test flat (0deg), natural angled (45deg), and upright Wii Wheel (90deg)
  for (const tilt of [0, 45, 90]) {
    player.landscapeSign = 1;
    const ref = mul(axisAngle(1, 0, 0, tilt), axisAngle(0, 0, 1, 90));
    player.reference = ref;
    player.latestQuat = mul(axisAngle(0, 1, 0, 22.5), ref);
    state.steering(player);
    assert.ok(Math.abs(player.steer - expected) < 1e-6, `CW right turn at ${tilt}deg: ${player.steer}`);
    player.latestQuat = mul(axisAngle(0, 1, 0, -22.5), ref);
    state.steering(player);
    assert.ok(Math.abs(player.steer + expected) < 1e-6, `CCW left turn at ${tilt}deg: ${player.steer}`);
  }
  // Rotating from portrait (0deg or 30deg) into level landscape stays centered (0 steer)
  for (const pTilt of [0, 30]) {
    player.landscapeSign = 1;
    player.reference = axisAngle(1, 0, 0, pTilt);
    player.latestQuat = mul(axisAngle(1, 0, 0, 45), axisAngle(0, 0, 1, 90));
    state.steering(player);
    assert.equal(player.steer, 0);
  }
  // Reverse landscape (rotated 180deg)
  const revRef = mul(axisAngle(1, 0, 0, 45), axisAngle(0, 0, 1, -90));
  player.reference = revRef;
  player.latestQuat = mul(axisAngle(0, 1, 0, 22.5), revRef);
  state.steering(player);
  assert.ok(Math.abs(player.steer - expected) < 1e-6);
  player.reference = player.latestQuat.slice();
  state.steering(player);
  assert.equal(player.steer, 0);
});
test('profile actions combine held buttons and emit a release only after every mapped button releases',()=>{
  const state=connected();state.setProfile({...profile,controls:[{id:'a',label:'Go',action:'go'},{id:'b',label:'Go too',action:'go'}]});state.markReady(0,state.profileEpoch);
  const send=(mask,sequence)=>state.buttons(0,{mask,sequence,profileEpoch:state.profileEpoch},'session0',100+sequence);
  send(BUTTON_BITS.a,1);assert.equal(state.sample(0,102).pressedActions.go,true);
  send(BUTTON_BITS.a|BUTTON_BITS.b,2);assert.equal(state.sample(0,103).pressedActions.go,undefined);
  send(BUTTON_BITS.b,3);const held=state.sample(0,104);assert.equal(held.actions.go,true);assert.equal(held.releasedActions.go,undefined);
  send(0,4);const released=state.sample(0,105);assert.equal(released.actions.go,false);assert.equal(released.releasedActions.go,true);
});
