import test from 'node:test';
import assert from 'node:assert/strict';
import { PosePointer } from '../public/core/pose-pointer.js';
import { FruitNinja, FRUIT_TYPES } from '../public/games/fruit-ninja/logic.js';
import { Trail } from '../public/core/trail.js';
const pose = (alpha=0,beta=0,gamma=0,rate=0) => ({alpha,beta,gamma,motion:{rx:0,ry:0,rz:rate},motionAge:0});
const close = (a,b) => assert(Math.abs(a-b)<1e-8,`${a} != ${b}`);
function centered(beta=0,gamma=0) { const p=new PosePointer({aspect:9/16});p.update(pose(0,beta,gamma),.016,0);p.consumeMovement();return p; }

test('small phone turns map proportionally to small blade movements',()=>{
  const p=centered();p.update(pose(.5,0,0,30),.016,16);close(p.position.x,.5-.5/60);
  p.consumeMovement();p.update(pose(1,0,0,30),.016,32);close(p.position.x,.5-1/60);
  p.update(pose(0),.016,48);close(p.position.x,.5);
});
test('extra display frames never coast, extrapolate, or pull a held aim',()=>{
  const p=centered();p.update(pose(5,0,0,300),.016,16);const expected={...p.position};p.consumeMovement();
  for(let n=1;n<=180;n++){assert.deepEqual(p.sampleAt(n*16),expected);assert.equal(p.consumeMovement().cutting,false);}
});
test('sensor silence retains the visible aim and calibration without a pending cut',()=>{
  const p=centered();p.update(pose(6,0,0,120),.016,16);
  const reference=p.reference, beam=p.beam, aim={...p.position};
  p.suspend();assert.equal(p.live,false);assert.equal(p.reference,reference);assert.equal(p.beam,beam);
  for(let n=0;n<100;n++)assert.deepEqual(p.sampleAt(500+n*16),aim);
  assert.deepEqual(p.consumeMovement(),{cutting:false,reset:true});
  p.suspend();p.update(pose(6),.016,2400);assert.deepEqual(p.position,aim);
  assert.deepEqual(p.consumeMovement(),{cutting:false,reset:true});
});
test('the first resumed reading breaks the old stroke, then real sweeps cut again',()=>{
  const p=centered(),g=game();
  const feed=now=>{const m=p.consumeMovement();g.setCursor((p.position.x-.5)*g.w,0,now,0,m);g.update(now,.016);};
  p.update(pose(8,0,0,120),.016,16);feed(16);p.suspend();g.trail.clear();fruit(g);
  p.update(pose(-8,0,0,-120),.016,1000);feed(1000);
  assert.equal(g.state.score,0);assert.equal(g.fruits.length,1);
  p.update(pose(0,0,0,120),.016,1016);feed(1016);assert.equal(g.state.score,1);
});
test('a gyro spike without measured pose movement cannot move or cut',()=>{
  const p=centered();p.update(pose(0,0,0,900),.016,16);
  assert.deepEqual(p.position,{x:.5,y:.5});assert.equal(p.consumeMovement().cutting,false);
});
test('flat, sideways and upright grips keep horizontal and vertical axes stable',()=>{
  for(const [beta,gamma]of [[0,0],[0,90],[90,0]]){
    const p=centered(beta,gamma);p.update(pose(3,beta,gamma,30),.016,16);close(p.position.x,.45);
    p.update(pose(0,beta+3,gamma,30),.016,32);close(p.position.y,.5-3/(60*9/16));
  }
});
test('phone roll and tiny stationary sensor noise do not sweep the blade',()=>{
  const p=centered();p.update(pose(0,0,30,100),.016,16);assert.deepEqual(p.position,{x:.5,y:.5});
  for(let n=0;n<100;n++)p.update(pose(n%2?.01:-.01,0,30),.016,32+n*16);
  assert.deepEqual(p.position,{x:.5,y:.5});assert.equal(p.consumeMovement().cutting,false);
});
test('compass wrap, quiet orientation corrections and calibration cannot produce cuts',()=>{
  const p=new PosePointer();p.update(pose(359),.016,0);p.consumeMovement();
  p.update(pose(1,0,0,120),.016,16);close(p.position.x,.5-2/60);assert.equal(p.consumeMovement().reset,false);
  p.update(pose(6),.016,32);assert.equal(p.consumeMovement().cutting,false);
  p.update({...pose(7,0,0,100),motionAge:120},.016,48);assert.equal(p.consumeMovement().cutting,false);
  p.recentre();p.update(pose(80),.016,64);assert.deepEqual(p.position,{x:.5,y:.5});assert.deepEqual(p.consumeMovement(),{cutting:false,reset:true});
});
test('a discontinuous pose jump snaps without creating a damaging diagonal',()=>{
  const p=centered();p.update(pose(90,0,0,300),.016,16);assert.deepEqual(p.consumeMovement(),{cutting:false,reset:true});
});
test('orientation-only fallback needs sustained movement, not an isolated heading jump',()=>{
  const p=centered();p.update({alpha:5,beta:0,gamma:0},.016,16);assert.equal(p.consumeMovement().cutting,false);
  p.update({alpha:5,beta:0,gamma:0},.016,32);assert.equal(p.consumeMovement().cutting,false);
  p.recentre();p.update({alpha:0,beta:0,gamma:0},.016,48);p.consumeMovement();
  p.update({alpha:1,beta:0,gamma:0},.016,64);assert.equal(p.consumeMovement().cutting,false);
  p.update({alpha:2,beta:0,gamma:0},.016,80);assert.equal(p.consumeMovement().cutting,true);
});
function game() { const g=new FruitNinja({infiniteLives:true,rng:()=>1});g.start(0);g.state.nextSpawn=Infinity;return g; }
function fruit(g) { g.fruits.push({id:1,x:0,y:0,vx:0,vy:0,r:.62,rot:0,spin:0,spinAxis:{x:1,y:0,z:0},kind:FRUIT_TYPES[3]}); }
test('each actual blade segment is consumed once; stationary fruit is never auto-sliced',()=>{
  const g=game();g.setCursor(-1,0,0);g.setCursor(1,0,16,0,{cutting:true});g.update(16,.016);
  fruit(g);g.update(32,.016);assert.equal(g.state.score,0);assert.equal(g.fruits.length,1);
});
test('a quiet pose correction can aim through fruit without slicing it',()=>{
  const g=game();fruit(g);g.setCursor(-1,0,0);g.setCursor(1,0,16,0,{cutting:false});g.update(16,.016);
  assert.equal(g.state.score,0);assert.equal(g.fruits.length,1);
});
test('a deliberate physical sweep still cuts fruit along its actual path',()=>{
  const g=game();fruit(g);g.setCursor(-1,0,0);g.setCursor(1,0,16,0,{cutting:true});g.update(16,.016);
  assert.equal(g.state.score,1);assert.equal(g.halves.length,2);
});
test('sparse measured movement uses its real elapsed time instead of returning zero speed',()=>{
  const trail=new Trail();trail.push(-1,0,0);trail.push(1,0,100);close(trail.speed(),20);
  const slow=new Trail({lifetimeMs:300});slow.push(0,0,0);slow.push(.1,0,100);close(slow.speed(),1);
});

test('a physical return sweep does not cancel its speed or lose the next fruit',()=>{
  const trail=new Trail();trail.push(0,0,0);trail.push(1,0,16);trail.push(0,0,32);
  close(trail.speed(),62.5);
  const g=game();g.setCursor(-1,0,0);g.setCursor(1,0,16,0,{cutting:true});g.update(16,.016);
  fruit(g);g.setCursor(-1,0,32,0,{cutting:true});g.update(32,.016);
  assert.equal(g.state.score,1);
  fruit(g);g.update(48,.016);assert.equal(g.state.score,1);
});
