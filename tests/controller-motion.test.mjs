import test from 'node:test';
import assert from 'node:assert/strict';
import { ControllerState } from '../public/core/controller-state.js';
import { MotionInput } from '../public/core/motion-input.js';
const quat=angle=>[0,0,Math.sin(angle*Math.PI/360),Math.cos(angle*Math.PI/360)];
const frame=(angle,t,epoch=1)=>({session:'phone',source:'bluetooth-native',quat:quat(angle),t,poseT:t,epoch,motion:{rx:60,ry:0,rz:0},motionAge:0});
function fixture(){const state=new ControllerState({createMotion:()=>new MotionInput({smoothing:false})});const epoch=state.setProfile({id:'demo',title:'Demo',orientation:'portrait',motion:'aim',controls:[]});state.connect(0,'phone','Phone');state.markReady(0,epoch);return state;}
test('the common state exposes measured motion while calibration creates no cut',()=>{
  const state=fixture();state.motion(0,frame(0,1000),100);state.sample(0,100);
  state.motion(0,frame(4,1016),116);const moved=state.sample(0,116);
  assert.equal(moved.motionLive,true);assert.ok(Math.abs(moved.axes.x-.5)>.02);
  state.center(0,{type:'recentre',session:'phone',epoch:2,pose:frame(4,1016,2)},120);
  const centered=state.sample(0,120);assert.equal(centered.cutting,false);assert.equal(centered.reset,true);assert.ok(Math.abs(centered.axes.x-.5)<1e-6);
});
test('a late captured anchor preserves the current offset and rejects old calibration epochs',()=>{
  const state=fixture();state.motion(0,frame(0,1000),100);state.sample(0,100);
  state.motion(0,frame(8,1032,2),132);state.sample(0,132);
  assert.equal(state.center(0,{type:'recentre',session:'phone',epoch:2,pose:frame(4,1016,2)},140),true);
  const snapshot=state.sample(0,140);assert.equal(snapshot.cutting,false);assert.ok(Math.abs(snapshot.axes.x-(.5-4/60))<1e-4);
  assert.equal(state.center(0,{type:'recentre',session:'phone',epoch:1,pose:frame(0,1000)},141),false);
  assert.equal(state.motion(0,frame(0,1010,1),142),false);
});

test('adapter snapshots interpolate visible aim between packets without delaying measured input or repeating cuts',()=>{
  const state=fixture();state.motion(0,frame(0,1000),100);state.sample(0,100);
  state.motion(0,frame(4,1016),116);
  const arrived=state.sample(0,116),between=state.sample(0,124),settled=state.sample(0,132);
  const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-6,`${a} != ${b}`);
  near(arrived.axes.x,.5-4/60);near(arrived.displayAxes.x,.5);
  near(between.axes.x,arrived.axes.x);near(between.displayAxes.x,.5-2/60);
  near(settled.displayAxes.x,arrived.axes.x);
  assert.equal(arrived.cutting,true);assert.equal(between.cutting,false);assert.equal(settled.cutting,false);
});

test('centering, sensor silence and reconnection cannot animate a previous display stroke',()=>{
  const state=fixture();state.motion(0,frame(0,1000),100);state.sample(0,100);
  state.motion(0,frame(4,1016),116);state.sample(0,124);
  state.center(0,{session:'phone',epoch:2,pose:frame(4,1016,2)},125);
  const centered=state.sample(0,125);
  assert.deepEqual(centered.displayAxes,{x:.5,y:.5});assert.equal(centered.cutting,false);
  state.motion(0,frame(8,1032,2),132);state.sample(0,132);
  const silent=state.sample(0,500);
  assert.deepEqual(silent.displayAxes,{x:silent.axes.x,y:silent.axes.y});assert.equal(silent.motionLive,false);assert.equal(silent.cutting,false);
  state.disconnect(0);assert.deepEqual(state.sample(0,501).displayAxes,{x:.5,y:.5});
  state.connect(0,'new-phone','Phone');state.markReady(0,state.profileEpoch);
  state.motion(0,{...frame(20,2000),session:'new-phone'},510);
  assert.deepEqual(state.sample(0,510).displayAxes,{x:.5,y:.5});
});

test('common display snapshots remove stepping from jittery phone packets on a 144 Hz screen',()=>{
  const state=fixture(),captureStep=1000/60,frameStep=1000/144;
  const packets=Array.from({length:150},(_,n)=>({n,capture:1000000+n*captureStep,arrival:n*captureStep+[0,7,2,10,0,5][n%6]}));
  let index=0,previous=null,previousRaw=null;const steps=[],rawSteps=[];
  for(let now=0;now<2000;now+=frameStep){
    while(index<packets.length&&packets[index].arrival<=now){const p=packets[index++];state.motion(0,frame(-p.n*.12,p.capture),p.arrival);}
    const snapshot=state.sample(0,now),displayed=snapshot.displayAxes.x,raw=snapshot.axes.x;
    if(now>500){steps.push(displayed-previous);rawSteps.push(raw-previousRaw);}
    previous=displayed;previousRaw=raw;
  }
  const deviation=values=>{const mean=values.reduce((a,b)=>a+b,0)/values.length;return Math.sqrt(values.reduce((a,b)=>a+(b-mean)**2,0)/values.length);};
  assert.ok(deviation(steps)<deviation(rawSteps)*.15,'adapter display still follows packet-sized steps');
  assert.ok(steps.every(step=>step>0),'a steady sweep paused or reversed');
});

test('lost button heartbeats release the button without suspending fresh gyro motion',()=>{
  const state=new ControllerState({createMotion:()=>new MotionInput({smoothing:false})});
  const epoch=state.setProfile({id:'demo',title:'Demo',orientation:'portrait',motion:'aim',controls:[{id:'a',label:'A',action:'go'}]});
  state.connect(0,'phone','Phone');state.markReady(0,epoch);
  state.motion(0,frame(0,1000),100);state.sample(0,100);
  state.buttons(0,{mask:16,sequence:1,profileEpoch:epoch},'phone',100);
  state.motion(0,frame(4,2300),1400);state.sample(0,1400);
  state.motion(0,frame(5,2316),1416);const snapshot=state.sample(0,1416);
  assert.equal(snapshot.buttons.a,false);assert.equal(snapshot.motionLive,true);
  assert.equal(snapshot.cutting,true);assert.equal(snapshot.reset,false);
});

test('a captured center after a pause stays fresh and the first real motion can cut',()=>{
  const state=fixture();state.motion(0,frame(0,1000),100);state.sample(0,100);
  state.sample(0,500);
  state.center(0,{session:'phone',epoch:2,pose:frame(0,2000,2)},1000);
  const centered=state.sample(0,1001);assert.equal(centered.motionLive,true);assert.equal(centered.cutting,false);
  state.motion(0,frame(2,2016,2),1016);const moved=state.sample(0,1016);
  assert.equal(moved.motionLive,true);assert.equal(moved.reset,false);assert.equal(moved.cutting,true);
  assert.ok(Math.abs(moved.axes.x-.5)>0.02);
  assert.ok(moved.displayAxes.x>moved.axes.x,'the first real pose snapped instead of interpolating from its captured anchor');
});
