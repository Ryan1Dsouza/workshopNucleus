import test from 'node:test';
import assert from 'node:assert/strict';
import {MotionInput} from '../public/core/motion-input.js';
import {laneAim} from '../public/games/fruit-ninja/lane-aim.js';
import {FruitNinja} from '../public/games/fruit-ninja/logic.js';
import {fruitMatch} from '../public/games/fruit-ninja/online.js';
import {Race,TRACK_LENGTH,CHARACTERS} from '../public/games/mario-kart/logic.js';
import {KartMatch} from '../public/games/mario-kart/online.js';
import {MARIO_KART_PROFILE,kartRaceProfile} from '../public/core/controller-profiles.js';
import {profilePackets} from '../public/core/controller-contract.js';
import {WheelInput} from '../public/games/mario-kart/input.js';

test('kart steering selection survives BLE transfer and separates right turns from item presses',()=>{
  for(const mode of ['dpad','gyro']){
    const profile=kartRaceProfile(mode), chunks=profilePackets(profile,17).slice(1,-1);
    const decoded=JSON.parse(new TextDecoder().decode(Uint8Array.from(chunks.flatMap(p=>[...p.slice(5)]))));
    assert.deepEqual(decoded.layout,'kart-'+mode);
    const actions=Object.fromEntries(decoded.controls.map(c=>[c.id,c.action]));
    assert.equal(actions.right,mode==='gyro'?'item':'steer-right');
    assert.equal(actions.b,mode==='gyro'?'accelerate':'item');
    assert.equal(actions.a,'drift');assert.equal(actions.two,'accelerate');
    assert.equal(decoded.motion,mode==='gyro'?'steer':'none');
  }
  assert.equal(MARIO_KART_PROFILE.layout,undefined);
  const wheel=new WheelInput();
  wheel.setButtons({right:true,A:true,'2':true},100);
  const pad=wheel.read(105,'dpad'),gyro=wheel.read(105,'gyro');
  assert.ok(pad.gas && pad.drift && pad.live && !pad.item && pad.steer===1);
  assert.ok(gyro.item && !gyro.live && gyro.steer===0);
  wheel.setButtons({B:true,left:true},110);
  const next=wheel.read(115,'dpad');
  assert.ok(next.item && !next.gas && next.steer===-1);
});

test('party grids have one owner per kart, independent projectile streams and common final results',()=>{
  for(const count of [2,3,8]){
    const drivers=CHARACTERS.slice(0,count).map(c=>c.id);
    const matches=drivers.map((_,slot)=>new KartMatch(new Race({drivers,slot}),slot));
    const host=matches[0];
    for(const match of matches){
      assert.equal(match.race.player.character.id,drivers[match.slot]);
      assert.equal(match.race.racers.filter(r=>!r.remote).length,match.slot===0?9-count:1);
      assert.equal(new Set(match.race.racers.map(r=>r.s+','+r.lateral)).size,8);
      for(const r of match.race.racers)
        assert.equal(r.s,host.race.racers.find(h=>h.character.id===r.character.id).s);
    }
    for(const match of matches.slice(1)){
      match.race.player.item='green';match.race.useItem();
      match.record('coin',match.slot,0);
      host.receive(match.snapshot(),50,match.slot);
    }
    assert.equal(host.race.objects.length,count-1);
    assert.equal(new Set(host.race.objects.map(o=>o.id)).size,count-1);
    assert.equal(host.lastEvents.size,count-1);
    const last=matches.at(-1);
    const forged=last.snapshot();forged.racers[0].driver=drivers[0];forged.racers[0].finishTime=1;
    host.receive(forged,60,last.slot);assert.equal(host.race.player.finishTime,null);
    for(const match of matches) match.race.player.finishTime=90-match.slot;
    for(const match of matches.slice(1,-1))host.receive(match.snapshot(),100,match.slot);
    assert.equal(host.resultStandings(),null);
    host.receive(last.snapshot(),100,last.slot);
    const order=host.resultStandings().map(r=>r.character.id);
    assert.deepEqual(order.slice(0,count),drivers.toReversed());
    for(const match of matches.slice(1)){
      for(const sender of matches)if(sender!==match)match.receive(sender.snapshot(),120,sender.slot);
      assert.deepEqual(match.resultStandings().map(r=>r.character.id),order);
    }
  }
});

for(const slot of [0,1])test('split blade '+(slot+1)+' spans its full lane and releases both vertical edges',()=>{
  for(const [width,height] of [[1032,448],[820,460],[400,400]]){
    const m=new MotionInput();m.pointer.setViewport(width/2,height);
    let time=1000;
    const pose=(yaw,pitch,speed=100)=>{
      time+=16;
      m.receive({session:'ble'+slot,epoch:1,alpha:yaw,beta:pitch,gamma:0,poseT:time,
        motion:{rx:speed,ry:0,rz:0},source:'bluetooth-native'},time);
      const point=laneAim(true,slot,m.pointer.position);m.pointer.consumeMovement();return point;
    };
    pose(12,-18);pose(12,-11);m.center({freshGrip:true},time);
    const center=pose(12,-11);assert.deepEqual(center,{x:slot/2+.25,y:.5});
    const span=60*Math.min(1.25,Math.max(.55,2*height/width));
    const ys=Array.from({length:41},(_,i)=>pose(12,-11+span*(.5-i/40)).y);
    assert.ok(ys[0]<1e-8 && ys.at(-1)>1-1e-8);
    for(let i=1;i<ys.length;i++)assert.ok(ys[i]>ys[i-1]+.02 && ys[i]<ys[i-1]+.03);
    assert.ok(pose(12,-11-span*.45).y<.97);
    // A nonlevel grip changes angular yaw slightly. Sweep far enough to reach each lane edge.
    const xs=Array.from({length:85},(_,i)=>pose(54-i,-11).x);
    assert.equal(xs[0],slot/2);assert.equal(xs.at(-1),(slot+1)/2);
    assert.ok(xs.every((v,i)=>i===0||v>=xs[i-1]));
    m.center({freshGrip:true},time+500);
    assert.deepEqual(pose(-17,25),center);
  }
});

test('fast BLE rates supplement attitude within half a degree and cannot coast at rest',()=>{
  const m=new MotionInput();let time=0;
  function pose(beta,rx){time+=16;m.receive({beta,alpha:0,gamma:0,t:time,source:'bluetooth-native',motion:{rx,ry:0,rz:0}},time);return m.pointer.consumeMovement();}
  pose(0,0);assert.equal(pose(5,500).cutting,true);
  const y=m.pointer.position.y;
  assert.ok(y<.5-5/36 && y>=.5-5.500001/36);
  assert.equal(pose(5,0).cutting,false);
  for(let i=0;i<60;i++){pose(5,600);assert.ok(Math.abs(m.pointer.position.y-(.5-5/36))<1e-10);}
});

test('seeded waves survive independent cuts, lost updates and repeated snapshots',()=>{
  const games=[0,1].map(slot=>{
    const g=new FruitNinja({rng:()=>1});g.setSplitScreen(true);g.network=fruitMatch(g,slot,51);g.start(0);return g;
  });
  const [a,b]=games;
  for(let t=1;t<=100;t++)for(const g of games)g.update(t*1000/120,1/120);
  assert.deepEqual(a.fruits,b.fruits);
  const f=a.fruits.find(f=>!f.bomb && f.lane===0);
  a.setCursor(f.x-1,f.y,840,0,{reset:true});a.setCursor(f.x+1,f.y,856,0,{cutting:true});a.update(856,1/120);
  assert.ok(a.getPlayer(0).score>0);
  const packet=a.network.snapshot();b.network.receive(packet,856);b.network.receive(packet,860);
  assert.equal(b.getPlayer(0).score,a.getPlayer(0).score);assert.equal(b.fruits.some(other=>other.id===f.id),false);
  assert.equal(b.halves.length,a.halves.length);
  for(const g of games)g.update(1800,1/120);
  assert.deepEqual(a.fruits.map(f=>[f.id,f.kind,f.vx]),b.fruits.map(f=>[f.id,f.kind,f.vx]));
});

test('kart replication preserves local authority, wraps the finish line and replays item hits once',()=>{
  const opts={drivers:['peach','toad'],laps:1,seed:3},host=new Race({...opts,slot:0}),guest=new Race({...opts,slot:1});
  const a=new KartMatch(host,0),b=new KartMatch(guest,1),local=guest.player;
  assert.equal(local.character.id,'toad');assert.equal(local.s,host.racers[1].s);
  assert.equal(host.racers.filter(r=>!r.remote).length,7);assert.equal(guest.racers.filter(r=>!r.remote).length,1);
  host.player.s=TRACK_LENGTH-2;b.receive(a.snapshot(),100,0);host.player.s=2;b.receive(a.snapshot(),150,0);b.interpolate(175);
  assert.ok(guest.racers[1].s<1e-6 || guest.racers[1].s>TRACK_LENGTH-1e-6);assert.equal(local.s,host.racers[1].s);
  host.player.item='green';host.useItem();b.receive(a.snapshot(),200,0);
  assert.equal(guest.objects[0].owner,1);assert.equal(guest.objects[0].type,'green');
  host.hit(host.racers[1],'green',0);b.receive(a.snapshot(),230,0);assert.ok(local.spin>0);
  local.spin=local.invulnerable=0;b.receive(a.snapshot(),250,0);assert.equal(local.spin,0);
});
