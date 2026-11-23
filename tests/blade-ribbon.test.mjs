import test from 'node:test';
import assert from 'node:assert/strict';
import { bladeRibbon } from '../public/core/blade-ribbon.js';
const screen = (x,y) => ({x,y});
const point = (x,y,t) => ({x,y,t});

test('blade curves round their joins and cap the head while remaining attached to measured points',()=>{
  const path=bladeRibbon([point(0,0,0),point(30,20,16),point(60,0,32)],screen,{now:32});
  assert.match(path,/^M0\.00,0\.00 Q/);assert.match(path,/ A7\.00,7\.00/);
  assert.equal((path.match(/ Z/g)||[]).length,1);
  assert.doesNotMatch(path,/NaN|Infinity/);
});
test('return strokes split at the reversal instead of inverting one ribbon polygon',()=>{
  const path=bladeRibbon([point(0,0,0),point(50,0,16),point(0,0,32)],screen,{now:32});
  assert.equal((path.match(/M/g)||[]).length,2);
  assert.doesNotMatch(path,/NaN|Infinity/);
});
test('a held blade trail tapers away with elapsed time and expires without moving the tip',()=>{
  const points=[point(0,0,0),point(50,0,16)];
  const radius=now=>Number(bladeRibbon(points,screen,{now}).match(/ A([\d.]+),/)[1]);
  assert.equal(radius(16),7);assert(radius(80)<radius(40));assert(radius(136)<.4);
  assert.equal(bladeRibbon(points,screen,{now:156}),'');
  assert.deepEqual(points,[point(0,0,0),point(50,0,16)]);
});
test('duplicate, expired and malformed trail points cannot produce broken SVG or unbounded work',()=>{
  assert.equal(bladeRibbon([],screen,{now:0}),'');
  assert.equal(bladeRibbon([point(0,0,0),point(0,0,16)],screen,{now:16}),'');
  assert.equal(bladeRibbon([point(NaN,0,0),point(0,0,16)],screen,{now:16}),'');
  const path=bladeRibbon(Array.from({length:10000},(_,i)=>point(i,0,100)),screen,{now:100});
  assert((path.match(/ Q/g)||[]).length<=126);assert.doesNotMatch(path,/NaN|Infinity/);
});
