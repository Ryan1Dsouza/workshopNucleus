import test from 'node:test';
import assert from 'node:assert/strict';
import {Race,FIXED_DT} from '../public/games/mario-kart/logic.js';
import {createPose,capturePose,samplePose} from '../public/games/mario-kart/render-pose.js';
import {TRACK_LENGTH} from '../public/games/mario-kart/track.js';

test('constant-speed visual travel follows the display clock through zero, one and multiple physics ticks',()=>{
  const race=new Race(), player=race.player, pose=createPose();
  assert.equal(race.alpha,1);
  race.state='racing';
  race.move=r=>{r.x+=36*FIXED_DT;};
  race.collisions=race.updateObjects=()=>{};
  race.update(FIXED_DT);
  let last=samplePose(player,race.alpha,pose).x;
  for(const dt of [.0138,.0138,.003,.022,.0138,.0138]){
    race.update(dt);
    const current=samplePose(player,race.alpha,pose).x;
    assert.ok(Math.abs(current-last-36*dt)<1e-9);
    last=current;
  }
});

test('render pose handles the finish seam, heading wrap, moving surface normals, teleports and network racers',()=>{
  const r=new Race().player, out=createPose();
  r.s=TRACK_LENGTH-.2;r.heading=Math.PI-.1;r.surfaceNormal={x:1,y:0,z:0};
  r.prevPose=capturePose(r,createPose());
  r.s=.2;r.heading=-Math.PI+.1;r.surfaceNormal.x=0;r.surfaceNormal.y=1;
  samplePose(r,.5,out);
  assert.ok(Math.min(out.s,TRACK_LENGTH-out.s)<1e-9);
  assert.ok(Math.abs(out.heading-Math.PI)<1e-9);
  assert.ok(Math.abs(out.surfaceNormal.x-Math.SQRT1_2)<1e-9);
  assert.equal(r.prevPose.surfaceNormal.x,1);
  r.x+=100;
  assert.equal(samplePose(r,.25,out).x,r.x);
  r.x=r.prevPose.x+1;r.remote=true;
  assert.equal(samplePose(r,0,out).x,r.x);
});
