import {TRACK_LENGTH, angle, clamp, wrap, surfaceAt} from './track.js';
import {ITEMS} from './logic.js';

const continuous = ['progress','lateral','speed','steer','y','flight','boost','star','spin','hop','roulette','charge'];
const counters = ['lap','coins','drift','tier'];
const flags = ['anti','gliding'];
const projectile = new Set(['banana','green','red','blue']);

function encode(r) {
  const state={driver:r.character.id,s:r.s,heading:r.heading,item:r.item,finishTime:r.finishTime,itemUse:r.itemUse};
  for(const key of [...continuous,...counters,...flags])state[key]=r[key];
  return state;
}

// The player and their projectiles run at the local physics rate. The host also
// owns the CPU racers. Driver identity is stable even though each camera follows racer 0.
export class KartMatch {
  constructor(race,slot) {
    this.race=race;
    this.slot=slot;
    this.samples=new Map();
    this.events=[];
    this.eventId=0;
    this.lastEvents=new Map();
    this.results=null;
    race.network=this;
  }
  record(type,subject,value) {
    this.events.push({id:++this.eventId,type,subject,value});
    if(this.events.length>64)this.events.shift();
  }
  snapshot() {
    const race=this.race, driver=id=>race.racers[id]?.character.id;
    return {racers:race.racers.filter(r=>!r.remote).map(encode),
      objects:race.objects.filter(o=>!o.remote).map(o=>({...o,owner:driver(o.owner),target:driver(o.target)})),
      events:this.events,results:this.slot===0?this.results:null,done:!!this.results && race.state==='results'};
  }
  receive(frame,now,senderSlot) {
    if(!Number.isInteger(senderSlot) || senderSlot===this.slot || !this.race.humanDrivers[senderSlot])return;
    if(!Array.isArray(frame?.racers) || !Array.isArray(frame.objects) || !Array.isArray(frame.events))return;
    const race=this.race, byDriver=id=>race.racers.find(r=>r.character.id===id);
    const ownedBySender=r=>r && r.ownerSlot===senderSlot;
    this.interpolate(now);
    for(const state of frame.racers.slice(0,7)){
      const r=byDriver(state?.driver);
      if(!ownedBySender(r) || !['s','heading',...continuous,...counters].every(k=>Number.isFinite(state[k])))continue;
      const previous=this.samples.get(r.id);
      this.samples.set(r.id,{from:previous?encode(r):state,to:state,at:now,span:clamp(now-(previous?.at??now),20,150)});
      r.item=ITEMS.includes(state.item)?state.item:null;
      r.itemUse=ITEMS.includes(state.itemUse?.type) && Number.isFinite(state.itemUse.age)?{type:state.itemUse.type,age:state.itemUse.age}:null;
      for(const key of flags)r[key]=state[key]===true;
      for(const key of counters)r[key]=state[key];
      if(Number.isFinite(state.finishTime))r.finishTime=state.finishTime;
    }
    race.objects=race.objects.filter(o=>o.senderSlot!==senderSlot);
    for(const o of frame.objects.slice(0,96)){
      const owner=byDriver(o?.owner);
      if(!ownedBySender(owner) || !projectile.has(o.type) || !['s','lateral','age','speed','id'].every(k=>Number.isFinite(o[k])))continue;
      race.objects.push({remote:true,senderSlot,id:'peer-'+senderSlot+'-'+o.id,type:o.type,owner:owner.id,target:byDriver(o.target)?.id,
        s:o.s,lateral:o.lateral,age:o.age,life:1,speed:o.speed,attack:Number.isFinite(o.attack)?o.attack:null});
    }
    for(const e of frame.events.slice(-64)){
      if(!Number.isSafeInteger(e?.id)||e.id<=(this.lastEvents.get(senderSlot)??0))continue;
      this.lastEvents.set(senderSlot,e.id);
      if(e.type==='hit'){
        const target=byDriver(e.subject);
        if(target && !target.remote && projectile.has(e.value))race.hit(target,e.value);
      }else if(e.type==='coin'||e.type==='box'){
        if(!Number.isInteger(e.subject))continue;
        const p=(e.type==='coin'?race.coins:race.boxes)[e.subject];
        if(p)p.respawn=Math.max(p.respawn,e.type==='coin'?5:1);
      }
    }
    if(senderSlot===0 && !this.results && Array.isArray(frame.results) && frame.results.length===race.racers.length){
      const rows=frame.results;
      if(rows.every(row=>byDriver(row?.driver) && (row.time===null || Number.isFinite(row.time))) && new Set(rows.map(row=>row.driver)).size===race.racers.length)
        this.results=rows;
    }
    this.interpolate(now);
  }
  resultStandings() {
    if(this.race.racers.some(r=>this.race.humanDrivers.includes(r.character.id) && r.finishTime===null))return null;
    if(this.slot===0 && !this.results)this.results=this.race.standings.map(r=>({driver:r.character.id,time:r.finishTime}));
    return this.results?.map(row=>({...this.race.racers.find(r=>r.character.id===row.driver),finishTime:row.time}));
  }
  interpolate(now) {
    for(const [id,{from,to,at,span}] of this.samples){
      const r=this.race.racers[id], alpha=clamp((now-at)/span,0,1);
      for(const key of continuous)r[key]=from[key]+(to[key]-from[key])*alpha;
      const delta=wrap(to.s-from.s+TRACK_LENGTH/2,TRACK_LENGTH)-TRACK_LENGTH/2;
      r.s=wrap(from.s+delta*alpha,TRACK_LENGTH);
      r.heading=from.heading+angle(to.heading-from.heading)*alpha;
      const road=surfaceAt(r.s,r.lateral);r.x=road.x;r.z=road.z;
    }
  }
}
