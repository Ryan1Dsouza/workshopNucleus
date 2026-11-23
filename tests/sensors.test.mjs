import test from 'node:test';
import assert from 'node:assert/strict';
import { SensorStream } from '../public/controller/sensors.mjs';
import { PosePointer as Pointer } from '../public/core/pose-pointer.js';

test('null acceleration and partial gyro data still produce finite gyro-only attitude',()=>{
  const s=new SensorStream();
  for(let n=0;n<30;n++)s.motion({acceleration:null,rotationRate:{alpha:45,beta:null,gamma:0},accelerationIncludingGravity:{x:0,y:0,z:9.81}},n*16);
  const sample=s.sample(464);
  assert.equal(sample.source,'gyro-only');assert(sample.quat.every(Number.isFinite));
  assert(Math.abs(Math.hypot(...sample.quat)-1)<1e-8);
  assert(Math.abs(sample.quat[2])>0.1);
});
test('orientation and gyroscope are sent raw without double-integrating or smoothing',()=>{
  const s=new SensorStream();s.orient({alpha:20,beta:30,gamma:-5},100);
  s.motion({rotationRate:{alpha:300,beta:100,gamma:40},acceleration:null},116);
  const sample=s.sample(116);
  assert.equal(sample.alpha,20);assert.equal(sample.beta,30);assert.equal(sample.motion.rz,300);
  assert.equal(sample.t,116);assert.equal(sample.source,'orientation');
});
test('stale samples expire; explicit suspension establishes a new calibration epoch',()=>{
  const s=new SensorStream();s.orient({alpha:0,beta:0,gamma:0},10);
  assert(s.sample(100));assert.equal(s.sample(161),null);
  const epoch=s.epoch;s.suspend();assert.equal(s.epoch,epoch+1);assert.equal(s.sample(162),null);
});
test('motion arriving before orientation after idle does not reset calibration',()=>{
  const s=new SensorStream(),o={type:'deviceorientation',alpha:10,beta:0,gamma:90};
  s.orient(o,0);s.motion({rotationRate:{alpha:0,beta:0,gamma:0}},16);
  const epoch=s.epoch;assert.equal(s.sample(1000),null);
  assert.equal(s.motion({rotationRate:{alpha:60,beta:0,gamma:0}},1000),false);
  assert.equal(s.sample(1000),null);assert.equal(s.epoch,epoch);
  s.orient(o,1001);assert.equal(s.epoch,epoch);assert.equal(s.sample(1001).alpha,10);
});
test('gyro fallback still starts if orientation never returns after an idle gap',()=>{
  const s=new SensorStream();s.orient({alpha:10,beta:0,gamma:0},0);
  s.motion({rotationRate:{alpha:0,beta:0,gamma:0}},16);const epoch=s.epoch;
  for(let now=1000;now<=1208;now+=16)s.motion({rotationRate:{alpha:20,beta:0,gamma:0}},now);
  assert.equal(s.mode,'gyro-only');assert.equal(s.epoch,epoch+1);assert(s.sample(1208).quat.every(Number.isFinite));
});
test('recentering during a fast swipe clears predicted and integrated motion',()=>{
  const p=new Pointer();p.live=true;p.lastSeen=100;p.rateDps={yaw:200,pitch:100};
  p.sampleAt(100);p.recentre();const aim=p.sampleAt(116);
  assert.deepEqual(aim,{x:.5,y:.5});assert.deepEqual(p.rateDps,{yaw:0,pitch:0});
});
test('relative and absolute orientation frames cannot alternate into automatic swipes',()=>{
  const s=new SensorStream();
  assert(s.orient({type:'deviceorientation',alpha:0,beta:0,gamma:0},0));
  assert.equal(s.orient({type:'deviceorientationabsolute',alpha:120,beta:0,gamma:0},16),false);
  assert.equal(s.sample(16).alpha,0);
  const epoch=s.epoch;
  assert(s.orient({type:'deviceorientationabsolute',alpha:120,beta:0,gamma:0},400));
  assert.equal(s.epoch,epoch+1);
});
