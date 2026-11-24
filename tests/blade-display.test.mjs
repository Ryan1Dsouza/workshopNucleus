import test from 'node:test';
import assert from 'node:assert/strict';
import { BladeDisplay } from '../public/core/blade-display.js';
import { PosePointer } from '../public/core/pose-pointer.js';

const near = (a, b) => assert(Math.abs(a - b) < 1e-8, `${a} != ${b}`);
test('60 Hz measured motion is evenly interpolated on a 120 Hz display', () => {
  const blade = new BladeDisplay(), step = 1000 / 60, drawn = [];
  for (let n = 0; n < 20; n++) {
    const time = n * step;
    blade.push({ x: n / 20, y: .5 }, time, time);
    drawn.push(blade.sampleAt(time).x, blade.sampleAt(time + step / 2).x);
  }
  for (let n = 3; n < drawn.length; n++) near(drawn[n] - drawn[n - 1], .025);
});
test('repeated gyro packets do not extend the display delay', () => {
  const blade = new BladeDisplay();
  blade.push({ x: .5, y: .5 }, 0, 0);
  blade.push({ x: .7, y: .5 }, 16, 16);
  blade.push({ x: .7, y: .5 }, 16, 24);
  near(blade.sampleAt(24).x, .6);
  near(blade.sampleAt(32).x, .7);
  assert.equal(blade.delay, 16);
});
test('network silence never extrapolates beyond the last measured endpoint', () => {
  const blade = new BladeDisplay();
  blade.push({ x: .1, y: .9 }, 0, 0);
  blade.push({ x: .9, y: .1 }, 33, 33);
  assert.equal(blade.delay, 33);
  for (let t = 33; t < 66; t++) {
    const p = blade.sampleAt(t);
    assert(p.x >= .1 && p.x <= .9 && p.y >= .1 && p.y <= .9);
  }
  for (let t = 70; t < 10000; t += 100) assert.deepEqual(blade.sampleAt(t), { x: .9, y: .1 });
});
test('recenter, discontinuities and resumed packets snap without an old stroke', () => {
  const blade = new BladeDisplay();
  blade.push({ x: 0, y: 0 }, 0, 0);
  blade.push({ x: 1, y: 1 }, 16, 16);
  blade.reset({ x: .5, y: .5 });
  assert.deepEqual(blade.sampleAt(24), { x: .5, y: .5 });
  blade.push({ x: .2, y: .3 }, 32, 32, true);
  assert.deepEqual(blade.sampleAt(32), { x: .2, y: .3 });
  blade.push({ x: .8, y: .7 }, 500, 500);
  assert.deepEqual(blade.sampleAt(500), { x: .8, y: .7 });
});
test('changing sensor cadence cannot replay already displayed motion backwards', () => {
  const blade = new BladeDisplay();
  blade.push({ x: 0, y: 0 }, 0, 0);
  blade.push({ x: .2, y: 0 }, 8, 8);
  const first = blade.sampleAt(16).x;
  blade.push({ x: .4, y: 0 }, 40, 20);
  assert(blade.sampleAt(20).x >= first);
});
test('display frames do not change immediate proportional input or arm cuts', () => {
  const pointer = new PosePointer(), blade = new BladeDisplay();
  pointer.update({ alpha: 0, beta: 0, gamma: 0 }, .016, 0);
  pointer.consumeMovement(); blade.push(pointer.position, 0, 0);
  pointer.update({ alpha: 6, beta: 0, gamma: 0, motion: { rz: 100 } }, .016, 16);
  blade.push(pointer.position, 16, 16); pointer.consumeMovement();
  near(pointer.position.x, .4);
  for (let t = 16; t < 500; t++) {
    blade.sampleAt(t);
    near(pointer.position.x, .4);
    assert.equal(pointer.consumeMovement().cutting, false);
  }
});

test('jittery 60 Hz packet delivery produces fluid steps on a 144 Hz screen using capture time', () => {
  const blade = new BladeDisplay(), captureStep = 1000 / 60, frameStep = 1000 / 144;
  const packets = Array.from({length:150},(_,n)=>({capture:n*captureStep,arrival:n*captureStep+[0,7,2,10,0,5][n%6]}));
  const steps = [], rawSteps = []; let index=0,raw=.2,previous=null,previousRaw=null;
  for(let now=0;now<2000;now+=frameStep){
    while(index<packets.length&&packets[index].arrival<=now){
      const p=packets[index++];raw=.2+p.capture*.0002;
      blade.push({x:raw,y:.5},p.capture,p.arrival);
    }
    const displayed=blade.sampleAt(now).x;
    if(now>500){steps.push(displayed-previous);rawSteps.push(raw-previousRaw);}
    previous=displayed;previousRaw=raw;
  }
  const deviation=values=>{const mean=values.reduce((a,b)=>a+b,0)/values.length;return Math.sqrt(values.reduce((a,b)=>a+(b-mean)**2,0)/values.length);};
  assert(deviation(steps)<deviation(rawSteps)*.15,'capture-timed display did not remove packet stepping');
  assert(steps.every(step=>step>0),'a regular measured sweep paused or reversed on screen');
  assert(blade.delay>=16&&blade.delay<=32);
});

test('sensor/host clock offsets, duplicate and reordered captures cannot create display travel',()=>{
  const blade=new BladeDisplay();
  blade.push({x:.2,y:.4},1000000,5);
  blade.push({x:.4,y:.6},1000016,21);
  near(blade.sampleAt(29).x,.3);
  const count=blade.points.length,delay=blade.delay;
  blade.push({x:1,y:1},1000016,200);blade.push({x:0,y:0},1000015,201);
  assert.equal(blade.points.length,count);assert.equal(blade.delay,delay);
  assert.deepEqual(blade.sampleAt(1000),{x:.4,y:.6});
});

test('25 Hz uneven BLE delivery stays moving between packets without exceeding measured aim',()=>{
  const blade=new BladeDisplay(),packets=Array.from({length:110},(_,n)=>({t:n*40,a:n*40+[0,12,0,4][n%4]}));
  let index=0,previous=null,holds=0,frames=0;
  for(let now=0;now<3500;now+=1000/144){
    while(index<packets.length&&packets[index].a<=now){const p=packets[index++];blade.push({x:.1+p.t*.00015,y:.5},p.t,p.a);}
    const x=blade.sampleAt(now).x;
    assert.ok(x<=.1+packets[Math.max(0,index-1)].t*.00015+1e-8,'display invented future motion');
    if(now>600){frames++;if(Math.abs(x-previous)<1e-10)holds++;assert.ok(x>=previous,'display replayed a stroke backwards');}
    previous=x;
  }
  assert.ok(holds<frames*.02,`${holds}/${frames} frames froze during a steady sweep`);
  assert.ok(blade.delay<=64);
});
