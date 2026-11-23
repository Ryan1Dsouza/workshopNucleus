import test from 'node:test';
import assert from 'node:assert/strict';
import {OneEuroFilter} from '../public/core/one-euro.js';
import {PosePointer} from '../public/core/pose-pointer.js';
import {FruitNinja,FRUIT_TYPES} from '../public/games/fruit-ninja/logic.js';
import {benchmark} from '../scripts/audit/filter.mjs';
test('adaptive filtering reduces simulated jitter with a bounded fast-swing delay',()=>{
  for(const r of benchmark()){assert(r.jitterReductionPercent>20,JSON.stringify(r));assert(r.estimatedFilterLagMs<=25,JSON.stringify(r));}
});
test('filter does not overshoot or advance on invalid/repeated timestamps',()=>{
  const f=new OneEuroFilter();assert.equal(f.filter(0,0),0);
  let prev=0;for(let n=1;n<100;n++){const next=f.filter(5,n/120);assert(next>=prev&&next<=5);prev=next;}
  assert.equal(f.filter(90,.1),prev);assert.equal(f.filter(NaN,1),prev);
  assert.equal(f.filter(-8,10),-8);
});
test('switching back to direct tracking restores the measured aim and breaks the stroke',()=>{
  const p=new PosePointer({smoothing:true});
  const pose=(alpha,t)=>({alpha,beta:0,gamma:0,motion:{rx:0,ry:0,rz:60},poseT:t,motionAge:0});
  p.update(pose(0,0),.016,0);p.consumeMovement();p.update(pose(6,16),.016,16);
  assert.notDeepEqual(p.position,p.rawPosition);p.setSmoothing(false);
  assert.deepEqual(p.position,p.rawPosition);assert.deepEqual(p.consumeMovement(),{cutting:false,reset:true});
});
test('smoothed aiming cannot harvest fruit while settling or after sensor silence',()=>{
  const p=new PosePointer({smoothing:true}),g=new FruitNinja({infiniteLives:true,rng:()=>1});g.start(0);g.state.nextSpawn=Infinity;
  const sample=(alpha,t)=>({alpha,beta:0,gamma:0,poseT:t,motion:{rx:0,ry:0,rz:0},motionAge:0});
  const feed=t=>{const movement=p.consumeMovement();g.setCursor((p.position.x-.5)*g.w,0,t,0,movement);g.update(t,.016);};
  p.update(sample(0,0),.016,0);feed(0);p.update(sample(8,16),.016,16);feed(16);
  g.fruits=[{id:500,x:0,y:0,vx:0,vy:0,r:.62,rot:0,spin:0,spinAxis:{x:1,y:0,z:0},kind:FRUIT_TYPES[3]}];
  for(let n=2;n<=30;n++){p.update(sample(-8,n*16),.016,n*16);feed(n*16);}
  assert.equal(g.state.score,0);
  const held={...p.position};p.suspend();for(let n=0;n<100;n++){assert.deepEqual(p.sampleAt(2000+n*16),held);assert.equal(p.consumeMovement().cutting,false);}
});
