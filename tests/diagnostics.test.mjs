import test from 'node:test';
import assert from 'node:assert/strict';
import {Samples,RateWindow,PeerMetrics} from '../public/core/diagnostics.js';
import {SensorStream} from '../public/controller/sensors.mjs';
test('rate windows count sensor streams independently and expire idle readings',()=>{
  const s=new SensorStream();
  for(let n=0;n<120;n++){
    if(n%2===0)s.orient({alpha:0,beta:0,gamma:0},n*1000/120);
    s.motion({rotationRate:{alpha:0,beta:0,gamma:0}},n*1000/120);
  }
  const d=s.diagnostics(1000);assert(Math.abs(d.orientationHz-60)<1e-6);assert(Math.abs(d.gyroHz-120)<1e-6);
  assert.equal(s.diagnostics(1400).gyroHz,0);
  const w=new RateWindow();w.add(0);assert.equal(w.hz(0),0);
});
test('capture time remains unchanged when a packet only brings a new gyro reading',()=>{
  const s=new SensorStream();s.orient({alpha:3,beta:0,gamma:0},100);
  s.motion({rotationRate:{alpha:20,beta:0,gamma:0}},108);const p=s.sample(110);
  assert.equal(p.poseT,100);assert.equal(p.t,110);assert.equal(p.motionAge,2);
});
test('diagnostics distinguish packets from poses without mixing device clocks',()=>{
  const p=new PeerMetrics();
  for(let n=0;n<120;n++)p.observe({sequence:n,t:100000+n*8,poseT:100000+Math.floor(n/2)*16,source:'orientation'},1000+n*8,n-1);
  const d=p.snapshot(2000);assert.equal(d.receivedHz,125);assert.equal(d.poseHz,62.5);
  assert(d.captureToSendMs.max<=8);assert.equal(d.sequenceGaps,0);assert.equal(d.rttMs.median,null);
  p.observe({sequence:124,t:101000,poseT:101000},2010,119);assert.equal(p.snapshot(2010).sequenceGaps,4);
});
test('rolling frame summaries are bounded and do not invent measurements',()=>{
  const s=new Samples(3);assert.equal(s.snapshot().p95,null);
  for(const v of [2,4,6,8,NaN,-1])s.add(v);
  assert.deepEqual(s.snapshot(),{count:3,mean:6,median:6,p95:8,max:8});
});
