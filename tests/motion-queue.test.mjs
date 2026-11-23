
import assert from 'node:assert/strict';
import { MotionQueue } from '../public/core/motion-queue.js';
const channel = () => ({ readyState: 'open', bufferedAmount: 0, sent: [], send(data) { this.sent.push(JSON.parse(data)); } });
test('congested transport sends only the newest pose instead of a buffered stroke', () => {
  const q = new MotionQueue(), c = channel();
  assert(q.offer({ sequence: 1 }, c, 0)); c.bufferedAmount = 1;
  for (let n = 2; n <= 20; n++) assert.equal(q.offer({ sequence: n }, c, n), false);
  assert.deepEqual(c.sent, [{ sequence: 1 }]); c.bufferedAmount = 0;
  assert(q.drain(c, 21)); assert.deepEqual(c.sent, [{ sequence: 1 }, { sequence: 20 }]);
});
test('fresh packets supersede pending poses when a channel has already drained', () => {
  const q = new MotionQueue(), c = channel(); c.bufferedAmount = 10;
  q.offer({ sequence: 1 }, c, 0); c.bufferedAmount = 0; q.offer({ sequence: 2 }, c, 10);
  assert.equal(q.drain(c, 11), false); assert.deepEqual(c.sent, [{ sequence: 2 }]);
});
test('stale or paused motion is never replayed after a Wi-Fi stall', () => {
  const q = new MotionQueue(), c = channel(); c.bufferedAmount = 1; q.offer({ sequence: 1 }, c, 0);
  c.bufferedAmount = 0; assert.equal(q.drain(c, 200), false); assert.equal(c.sent.length, 0);
  c.bufferedAmount = 1; q.offer({ sequence: 2 }, c, 201); q.clear(); c.bufferedAmount = 0;
  assert.equal(q.drain(c, 210), false);
});
