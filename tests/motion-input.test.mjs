import test from 'node:test';
import assert from 'node:assert/strict';
import { MotionInput } from '../public/core/motion-input.js';
import { SensorStream } from '../public/controller/sensors.mjs';

const pose = (alpha, t, epoch = 1, source = 'orientation') => ({ alpha, beta: 0, gamma: 0,
  t, poseT: t, epoch, session: 'phone-one', source, motion: { rx: 0, ry: 0, rz: 90 }, motionAge: 0 });
const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} != ${expected}`);

test('Center blade captures the current grip and rejects packets from before the button press', () => {
  const input = new MotionInput();
  input.receive(pose(0, 0), 0); input.receive(pose(12, 100), 100);
  const anchor = pose(12, 100, 2);
  input.center({ epoch: 2, pose: anchor }, 101);
  close(input.pointer.position.x, 0.5);
  assert.equal(input.receive(pose(0, 110, 1), 102), null);
  input.receive(pose(13, 116, 2), 116);
  close(input.pointer.position.x, 0.5 - 1 / 60);
  assert.deepEqual(input.pointer.consumeMovement(), { cutting: false, reset: true });
});

test('a calibration command arriving after its motion packet keeps the button-time grip', () => {
  const input = new MotionInput();
  input.receive(pose(0, 0), 0);
  input.receive(pose(13, 116, 2), 116);
  const command = { epoch: 2, pose: pose(12, 100, 2) };
  input.center(command, 120);
  close(input.pointer.position.x, 0.5 - 1 / 60);
  assert.deepEqual(input.pointer.consumeMovement(), { cutting: false, reset: true });
  input.receive(pose(14, 132, 2), 132);
  close(input.pointer.position.x, 0.5 - 2 / 60);
  assert.equal(input.center(command, 134), false);
  close(input.pointer.position.x, 0.5 - 2 / 60);
});

test('repeated presses cannot be undone by an older reliable calibration command', () => {
  const input = new MotionInput(); input.receive(pose(0, 0), 0);
  input.center({ epoch: 3, pose: pose(25, 40, 3) }, 40);
  assert.equal(input.center({ epoch: 2, pose: pose(10, 20, 2) }, 45), false);
  input.receive(pose(26, 56, 3), 56);
  close(input.pointer.position.x, 0.5 - 1 / 60);
});

test('centering before sensors are ready waits for a fresh pose in that epoch', () => {
  const input = new MotionInput();
  input.center({ epoch: 2 }, 0);
  input.receive(pose(30, 16, 2), 16);
  close(input.pointer.position.x, 0.5);
  input.receive(pose(31, 32, 2), 32);
  close(input.pointer.position.x, 0.5 - 1 / 60);
});

test('host keyboard centering uses the last held measured pose', () => {
  const input = new MotionInput(); input.receive(pose(0, 0), 0); input.receive(pose(12, 100), 100);
  input.center({}, 500);
  input.receive(pose(12, 600), 600);
  close(input.pointer.position.x, 0.5);
  assert.equal(input.pointer.consumeMovement().cutting, false);
});

test('Bluetooth epoch wrap accepts a new center and rejects the previous epoch', () => {
  const input = new MotionInput(); input.receive(pose(0, 0, 65535, 'bluetooth-native'), 0);
  input.center({ epoch: 0, pose: pose(12, 16, 0, 'bluetooth-native') }, 16);
  assert.equal(input.receive(pose(30, 32, 65535, 'bluetooth-native'), 32), null);
  input.receive(pose(13, 32, 0, 'bluetooth-native'), 32);
  close(input.pointer.position.x, 0.5 - 1 / 60);
});

test('the phone captures a fresh anchor without mutating it on subsequent events', () => {
  const sensors = new SensorStream(); sensors.orient({ alpha: 12, beta: 0, gamma: 0 }, 100);
  const center = sensors.recenter(101);
  sensors.orient({ alpha: 15, beta: 0, gamma: 0 }, 116);
  assert.equal(center.epoch, 1); assert.equal(center.pose.alpha, 12); assert.equal(center.pose.poseT, 100);
  assert.equal(sensors.sample(116).alpha, 15);
  assert.equal(sensors.recenter(1000).pose, null);
});
