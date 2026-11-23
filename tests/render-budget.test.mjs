import test from 'node:test';
import assert from 'node:assert/strict';
import { RenderBudget } from '../public/core/render-budget.js';
test('resolution decreases only after sustained missed frame budgets, with a floor', () => {
  const b = new RenderBudget();
  for (let n=0;n<59;n++) b.observe(1000/30);
  assert.equal(b.scale,1);
  for (let n=0;n<5;n++) b.observe(1000/30);
  assert.equal(b.scale,2/3);
  for (let n=0;n<180;n++) b.observe(1000/30);
  assert.equal(b.scale,.5);
});
test('stable display, hidden tabs and isolated hitches do not lower resolution', () => {
  const b = new RenderBudget();
  for (let n=0;n<1000;n++) b.observe(1000/60);
  b.observe(400);
  for (let n=0;n<60;n++) b.observe(40,false);
  assert.equal(b.scale,1);
});
