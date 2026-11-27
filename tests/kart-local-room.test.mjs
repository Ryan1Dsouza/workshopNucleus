import test from 'node:test';
import assert from 'node:assert/strict';
import {Race, FIXED_DT} from '../public/games/mario-kart/logic.js';
import drivers from '../public/core/kart-roster.json' with {type:'json'};
import {ControllerState} from '../public/core/controller-state.js';
import {BUTTON_BITS} from '../public/core/controller-contract.js';
import {MARIO_KART_PROFILE, kartRaceProfile} from '../public/core/controller-profiles.js';

test('eight local drivers use independent controls and item edges across substeps',()=>{
  const race=new Race({localParty:true,drivers:drivers.map(d=>d.id),bots:false});
  assert.equal(race.localHumans.length,8);assert.ok(race.racers.every(r=>!r.remote));
  race.start();race.state='racing';
  const inputs=drivers.map((_,i)=>({gas:i%2===0,steer:i%2?-.8:.8}));
  const last=race.racers[7];last.item='mushroom';inputs[7].item=true;
  race.update(FIXED_DT/2,inputs);
  inputs[7].item=false;race.update(FIXED_DT/2,inputs);
  assert.ok(last.boost>0);
  assert.deepEqual(race.racers.map(r=>[r.lastInput.gas,r.lastInput.steer]),inputs.map(i=>[i.gas,i.steer]));
  race.player.finishTime=2;race.update(FIXED_DT,inputs);
  assert.equal(race.state,'racing');
  for(const r of race.racers)r.finishTime=2+r.id;
  race.update(FIXED_DT,inputs);assert.equal(race.state,'results');
});
test('each paired phone maps buttons using its own racing layout and rejects the prior epoch',()=>{
  const state=new ControllerState({slots:8});
  const epoch=state.setProfile(MARIO_KART_PROFILE);
  const layouts=drivers.map((_,i)=>kartRaceProfile(i%2?'gyro':'dpad'));
  const raceEpoch=state.setProfile(layouts[0],layouts);
  for(let i=0;i<8;i++){
    state.connect(i,'phone'+i,'P'+i);state.markReady(i,raceEpoch);
    const push=e=>state.buttons(i,{mask:BUTTON_BITS.b,sequence:1,profileEpoch:e},'phone'+i);
    assert.equal(push(epoch),false);assert.equal(push(raceEpoch),true);
    const {actions}=state.sample(i);assert.equal(i%2?actions.accelerate:actions.item,true);
  }
});
