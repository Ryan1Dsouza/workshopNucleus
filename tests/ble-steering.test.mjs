import test from 'node:test';
import assert from 'node:assert/strict';
import {ControllerState} from '../public/core/controller-state.js';
import {MotionInput} from '../public/core/motion-input.js';
import {BleTimeline} from '../public/core/ble-protocol.js';
import {Quaternion} from 'three';
import {bodyAxesFromQuat} from '../public/core/orientation.js';
import {Race} from '../public/games/mario-kart/logic.js';
import {FruitNinja,FRUIT_TYPES} from '../public/games/fruit-ninja/logic.js';

const axis=(i,deg)=>{
  const q=[0,0,0,Math.cos(deg*Math.PI/360)];
  q[i]=Math.sin(deg*Math.PI/360);
  return q;
};
function multiply([x,y,z,w],[X,Y,Z,W]){
  return [w*X+x*W+y*Z-z*Y,w*Y-x*Z+y*W+z*X,w*Z+x*Y-y*X+z*W,w*W-x*X-y*Y-z*Z];
}
// Start with the display flat. Lift the top edge, then bank about world Y.
// Changing world yaw changes no horizon component.
function wheel(tilt,turn,rotation,yaw=0){
  return multiply(axis(2,yaw),multiply(axis(1,turn),multiply(axis(0,tilt),axis(2,rotation*90))));
}
function host(mode='steer'){
  const state=new ControllerState({createMotion:()=>new MotionInput()});
  const profileEpoch=state.setProfile({id:mode==='steer'?'kart-racing':'fruit-ninja',title:'Game',motion:mode,orientation:mode==='steer'?'landscape':'portrait',controls:[]});
  state.connect(0,'phone','Phone');state.markReady(0,profileEpoch);
  const hint=rotation=>state.setWheelRotation(0,{rotation,session:'phone',profileEpoch});
  const send=(quat,t,now=t,epoch=1)=>state.motion(0,{quat,poseT:t,t,epoch,session:'phone',source:'bluetooth-native',motion:{rx:90,ry:0,rz:0},motionAge:0},now);
  return {state,send,hint,read:now=>state.sample(0,now)};
}

test('display rotation gives the same wheel sign through both landscapes, flat, pitched, vertical, and landscape-native devices',()=>{
  for(const rotation of [0,1,2,3]) for(const tilt of [0,30,45,60,90]){
    const {send,hint,read}=host();
    assert.ok(hint(rotation));
    let t=0;send(wheel(tilt,0,rotation),t);
    for(const bank of [22,-22,35,0]){
      for(let i=0;i<22;i++){
        t+=[40,17,33,20][i%4];
        // q and -q must have identical wheel direction.
        const q=wheel(tilt,bank,rotation,120+t*.003).map(n=>i%2?-n:n);
        assert.ok(send(q,t,t+(i%2?0:16)));
      }
      const target=Math.sign(bank)*Math.max(0,Math.abs(bank)-2.5)/35.5;
      assert.ok(Math.abs(read(t+40).axes.steer-target)<.002,'rotation '+rotation+' tilt '+tilt+' bank '+bank);
    }
  }
});

test('portrait-to-landscape handoff, 180-degree flip and a deliberate banked re-center preserve direction',()=>{
  const {state,send,hint,read}=host();
  send(axis(0,65),0);state.center(0,{},0);
  hint(1);send(wheel(45,0,1),40);
  assert.equal(read(40).axes.steer,0);
  send(wheel(45,46,1),80);state.center(0,{},80);
  assert.equal(read(81).displayAxes.steer,0);
  send(wheel(45,54,1),120);assert.ok(read(150).axes.steer>.1);
  hint(3);assert.equal(read(155).displayAxes.steer,0);
  send(wheel(0,0,3),160);assert.equal(read(190).axes.steer,0);
  send(wheel(0,22,3),200);assert.ok(read(240).axes.steer>.4);
  assert.equal(state.setWheelRotation(0,{rotation:1,session:'phone',profileEpoch:0}),false);
  assert.equal(state.player(0).rotation,3);
});

test('wheel tremor stays neutral at rest, is damped while cornering, and a held turn retains its gain',()=>{
  const {hint,send,read}=host();hint(1);
  let t=0;
  const trace=bank=>{const turns=[];for(let i=0;i<160;i++){
    t+=17;send(wheel(45,bank+(i%2?1:-1),1),t);turns.push(read(t).axes.steer);
  }return turns.slice(-80);};
  assert.ok(trace(0).every(x=>x===0));
  const turns=trace(23), avg=turns.reduce((a,b)=>a+b)/turns.length;
  assert.ok(avg>.55 && avg<.6);
  assert.ok(Math.max(...turns)-Math.min(...turns)<1/35.5,'less than half the unfiltered peak-to-peak tremor');
  const left=trace(-23);assert.ok(Math.max(...left)<-.53);
});

test('holding a moving wheel near level stays straight and rolls gently into either turn',()=>{
  const {hint,send,read}=host();hint(1);
  let t=0;
  for(let i=0;i<240;i++){
    t+=20;
    const bank=4.4*Math.sin(i*.11), tilt=45+20*Math.cos(i*.13), yaw=i*2;
    send(wheel(tilt,bank,1,yaw),t);
    const s=read(t);assert.equal(s.axes.steer,0);assert.equal(s.displayAxes.steer,0);
  }
  const settle=angle=>{
    for(let i=0;i<24;i++){t+=20;send(wheel(40,angle,1,t*.1),t);}
    return read(t).axes.steer;
  };
  for(const sign of [1,-1]){
    const turns=[4.4,4.6,6,8,10,20,38].map(a=>Math.abs(settle(sign*a)));
    assert.equal(turns[0],0);assert.ok(turns[1]<.001);
    assert.ok(turns.slice(1).every((v,i)=>v>turns[i]));
    assert.ok(turns.at(-1)>.999);
    assert.equal(settle(0),0);
  }
});

test('stale or repeated captures cannot revive the wheel; a 230 ms gap does not recenter it',()=>{
  const {hint,send,read}=host();hint(1);
  const q=wheel(45,25,1);
  send(q,1000,200);assert.ok(read(399).motionLive);
  send(q,1230,430);
  const resumed=read(430);assert.equal(resumed.reset,false);assert.ok(resumed.axes.steer>.6);
  assert.equal(send(q,1230,800),false);
  assert.equal(read(881).motionLive,false);
  assert.equal(send(q,1230,882),false);assert.equal(send(q,1240,910),false);
  assert.ok(send(q,1720,920));const live=read(920);assert.ok(live.motionLive && live.reset && live.axes.steer>.6);
});

test('an inactive dispatch, early center at u32 rollover, and ambiguous u16 intervals cannot poison capture time',()=>{
  const t=new BleTimeline(), frame=(sequence,time,active=true)=>t.accept({sequence,t:time,active});
  assert.equal(t.captureTime(0xfffffff0),0xfffffff0);
  assert.equal(frame(65535,5).t,0x100000005);
  assert.equal(frame(0,150,false).sequence,65536);
  assert.equal(frame(1,149).t,0x100000095);
  assert.equal(frame(32769,155),null);assert.equal(frame(2,148),null);
  assert.equal(frame(3,152).sequence,65539);
  const {state,send}=host();send(wheel(30,0,1),0,0,65535);
  assert.ok(send(wheel(30,4,1),17,17,0));
  assert.equal(send(wheel(30,4,1),34,34,32768),false);
  state.buttons(0,{sequence:0,profileEpoch:state.profileEpoch,mask:0},'phone',0);
  assert.equal(state.buttons(0,{sequence:32768,profileEpoch:state.profileEpoch,mask:0},'phone',34),false);
});

test('early and late epoch-only centers share the first fresh wheel anchor; stale poses cannot undo a newer captured center',()=>{
  const q=bank=>wheel(45,bank,1);
  for(const early of [true,false]){
    const {send,state,read,hint}=host();hint(1);
    send(q(22),0);
    const center=()=>state.center(0,{epoch:2,session:'phone'},100);
    if(early)center();
    send(q(-20),110,110,2);send(q(-10),140,140,2);
    if(!early)center();
    assert.ok(read(145).axes.steer>.1);
    const pose={quat:q(32),epoch:2,poseT:200,t:200,source:'bluetooth-native'};
    state.center(0,{epoch:2,pose,session:'phone'},205);
    assert.equal(read(206).axes.steer,0);assert.equal(send(q(-5),180,207,2),false);
  }
});

test('an old captured center can establish a reference without making stale motion live',()=>{
  const {state,send,read}=host('aim');
  send(axis(2,0),1000,100);read(100);
  const command={epoch:2,session:'phone',pose:{source:'bluetooth-native',poseT:1020,t:1020,quat:axis(2,4),epoch:2}};
  state.center(0,command,500);
  assert.equal(read(501).motionLive,false);
  assert.equal(send(axis(2,4),1020,502,2),false);
  assert.ok(send(axis(2,10),1410,510,2));
  const next=read(510);assert.ok(next.reset&&!next.cutting);
  assert.ok(Math.abs(next.axes.x-.4)<1e-8);
});

test('capture-timed wheel presentation smooths packet steps on a monotone ramp without predicting past the measured bank',t=>{
  const {send,hint,read}=host();hint(1);
  const packets=[];
  for(let i=0;i<90;i++){
    const cap=i*25, due=cap+(i%4===2?29:i%4===3?4:2);
    packets.push({cap,due,bank:10+cap*.01});
  }
  let index=0,prev=null,held=0,rawHeld=0,frames=0;
  let rawResidual=0,bufferedResidual=0,maxLag=0;
  for(let now=0;now<2150;now+=1000/144){
    while(index<packets.length&&packets[index].due<=now){
      const {bank,cap,due}=packets[index++];send(wheel(45,bank,1),cap,due);
    }
    const s=read(now), raw=s.axes.steer, shown=s.displayAxes.steer;
    if(now>400){
      const expected=.01*(1000/144)/35.5;
      const dr=raw-prev.raw, ds=shown-prev.shown;
      rawHeld+=Math.abs(dr)<1e-8;held+=Math.abs(ds)<1e-8;
      rawResidual+=(dr-expected)**2; bufferedResidual+=(ds-expected)**2;frames++;
      assert.ok(shown<=raw+1e-9 && ds>=-1e-9);
      maxLag=Math.max(maxLag,(raw-shown)*35.5/.01);
    }
    prev={raw,shown};
  }
  assert.ok(held<rawHeld*.5 && bufferedResidual<rawResidual*.55);
  assert.ok(maxLag<=45);
  t.diagnostic(JSON.stringify({frames,heldFramesRaw:rawHeld,heldFramesShown:held,maxMeasuredSeparationMs:maxLag,
    rawStepRMSE:Math.sqrt(rawResidual/frames),displayStepRMSE:Math.sqrt(bufferedResidual/frames)}));
});

test('rapid counter-steering reaches opposite lock through production kart physics',()=>{
  const {send,read,hint}=host();hint(1);
  const race=new Race(), started=500;
  const bank=t=>30-60*Math.max(0,Math.min(1,(t-started)/110));
  const packets=[];
  for(let i=0,cap=0;cap<1000;i++,cap+=[17,40,25,17][i%4]){
    // Deliver two samples together at the end of every third interval.
    const delay=i%3===1?[17,40,25,17][(i+1)%4]+3:3;
    packets.push({cap,due:cap+delay});
  }
  let i=0,cross=null,lock=null;
  for(let now=0;now<1000;now+=1000/144){
    while(i<packets.length && packets[i].due<=now){
      const p=packets[i++];send(wheel(45,bank(p.cap),1),p.cap,p.due);
    }
    race.move(race.player,{steer:read(now).displayAxes.steer,measuredWheel:true},1/144);
    if(now>started && cross===null && race.player.steer<0)cross=now;
    if(now>started && lock===null && race.player.steer<-.72)lock=now;
  }
  assert.ok(cross!==null && cross-(started+55)<100);
  assert.ok(lock!==null && lock-started<245);
});

test('wheel bank interpolation and shortest-arc quaternion SLERP track the same compound grip sweep',t=>{
  const errors={scalar:[],slerp:[]};
  for(const rotation of [1,3]){
    const angles=ms=>({tilt:45+40*Math.sin(ms/430),bank:33*Math.sin(ms/100),yaw:45*Math.cos(ms/380)});
    const quat=ms=>{const {tilt,bank,yaw}=angles(ms);return new Quaternion(...wheel(tilt,bank,rotation,yaw));};
    for(let i=0,a=0;a<2500;i++){
      const b=a+[17,25,33,40][i%4],q=quat(a),r=quat(b);
      for(const f of [.25,.5,.75]){
        const truth=angles(a+(b-a)*f).bank;
        const z=bodyAxesFromQuat(q.clone().slerp(r,f).toArray()).y.z;
        errors.slerp.push(Math.abs((rotation===1?1:-1)*Math.asin(z)*180/Math.PI-truth));
        errors.scalar.push(Math.abs(angles(a).bank*(1-f)+angles(b).bank*f-truth));
      }
      a=b;
    }
  }
  const p95=arr=>arr.sort((a,b)=>a-b)[Math.ceil(.95*arr.length)-1];
  const scalar=p95(errors.scalar), slerp=p95(errors.slerp);
  assert.ok(scalar<.7 && slerp<.7 && Math.abs(slerp-scalar)<.1);
  t.diagnostic(JSON.stringify({bankErrorP95Degrees:{scalar,slerp}}));
});

test('a burst returning to its origin retains each real Fruit segment and cannot cut a second time',()=>{
  const {send,read}=host('aim'), game=new FruitNinja({rng:()=>1,infiniteLives:true});
  game.start(0);game.state.nextSpawn=Infinity;
  const fruit=()=>game.fruits.push({id:1,x:-1.9,y:0,r:.2,vx:0,vy:0,rot:0,spin:0,spinAxis:{x:1,y:0,z:0},kind:FRUIT_TYPES[3]});
  const feed=s=>{for(const p of s.motionPath)game.setCursor((p.x-.5)*game.w,(.5-p.y)*game.h,100-p.age,0,{...p,captureAt:p.poseTime});};
  send(axis(2,0),0,0);feed(read(0));fruit();
  send(axis(2,8),20,85);send(axis(2,0),40,85);send(axis(2,0),60,85);
  const burst=read(85);assert.equal(burst.motionPath.length,3);assert.equal(burst.axes.x,.5);feed(burst);
  game.update(100,0);assert.equal(game.state.score,1);
  fruit();assert.deepEqual(read(101).motionPath,[]);game.update(101,0);assert.equal(game.fruits.length,1);
});
