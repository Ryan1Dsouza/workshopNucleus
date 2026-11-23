import test from 'node:test';
import assert from 'node:assert/strict';
import { MotionClock } from '../public/core/motion-clock.js';
test('echo timestamps align different phone/host clocks without counting remote handling time as transit', () => {
  const c=new MotionClock();c.sync(1000,1032,5015,5017);
  assert.equal(c.offset,4000);assert.equal(c.bestRtt,30);
  assert.equal(c.age(5030,1060),30);
  assert.equal(c.stale(5030,1060),false);
  assert.equal(c.stale(5030,1300),true);
});
test('slow echoes do not corrupt a previously established low-delay offset', () => {
  const c=new MotionClock();c.sync(0,10,1005,1005);const offset=c.offset;
  c.sync(100,400,1120,1120);assert.equal(c.offset,offset);
  assert.equal(c.stale(1120,130),false);
});
test('legacy echoes and invalid timestamps do not invent input ages', () => {
  const c=new MotionClock();c.sync(0,100,undefined,undefined);
  c.sync(100,90,1000,1000);assert.equal(c.age(0,100000),null);
  assert.equal(c.stale(0,100000),false);
});
