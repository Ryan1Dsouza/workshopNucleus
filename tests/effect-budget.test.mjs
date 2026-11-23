import test from 'node:test';
import assert from 'node:assert/strict';
import { FruitNinja, FRUIT_TYPES, MAX_ACTIVE_FRUIT, MAX_JUICE_PARTICLES, MAX_FRUIT_HALVES } from '../public/games/fruit-ninja/logic.js';
const fruit = id => ({ id, x: 0, y: 0, r: .62, vx: 0, vy: 0, rot: 0, spin: 0, spinAxis: {x:1,y:0,z:0}, kind: FRUIT_TYPES[3] });
test('overcrowded waves skip spawning without launch events or a backlog', () => {
  const events = [], g = new FruitNinja({ onEvent: e => events.push(e) });
  for (let n = 0; n < MAX_ACTIVE_FRUIT; n++) assert.equal(g.spawn(false, 0), true);
  const launched = events.length;
  for (let n = 0; n < 100; n++) assert.equal(g.spawn(true, 0), false);
  assert.equal(g.fruits.length, MAX_ACTIVE_FRUIT); assert.equal(events.length, launched);
  g.fruits.pop(); assert.equal(g.spawn(false, 0), true);
  assert.equal(g.fruits.length, MAX_ACTIVE_FRUIT);
});
test('sustained slice and bomb effects have bounded debris and expire normally', () => {
  const g = new FruitNinja();
  for (let n = 0; n < 100; n++) { g.slice(fruit(n), 0, 0); g.explode(fruit(n)); }
  assert.equal(g.particles.length, MAX_JUICE_PARTICLES);
  assert.equal(g.halves.length, MAX_FRUIT_HALVES);
  for (let n = 0; n < 300; n++) g.stepDebris(1/60);
  assert.equal(g.particles.length, 0); assert.equal(g.halves.length, 0);
});
test('effect saturation never drops a valid multi-fruit score', () => {
  const g = new FruitNinja({ infiniteLives: true, rng: () => 1 });
  g.start(0); g.state.nextSpawn = Infinity;
  for (let n = 0; n < 20; n++) g.explode(fruit(n));
  g.fruits = Array.from({length:MAX_ACTIVE_FRUIT}, (_, n) => fruit(2000+n));
  g.setCursor(-2, 0, 0); g.setCursor(2, 0, 16); g.update(16, .016);
  assert.equal(g.fruits.length, 0); assert(g.state.score >= MAX_ACTIVE_FRUIT);
  assert(g.particles.length <= MAX_JUICE_PARTICLES); assert(g.halves.length <= MAX_FRUIT_HALVES);
});
