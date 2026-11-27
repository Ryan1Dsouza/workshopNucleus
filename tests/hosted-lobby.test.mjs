import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import hosted from '../server/hosted-lobby.cjs';
import rules from '../server/lobby-room.cjs';

function storage() {
  const rows=new Map();
  return {
    async load(code){return structuredClone(rows.get(code));},
    async save(code,old,row){
      if(rows.get(code)?.rev!==old?.rev)return false;
      if(row){row.rev=(old?.rev||0)+1;rows.set(code,structuredClone(row));}
      else rows.delete(code);
      return true;
    },
    async directory(now){return [...rows.values()].filter(r=>r.seen[r.room.players[0].id]+120000>now).map(rules.listing).filter(Boolean);}
  };
}
const secret=i=>String(i).padStart(64,'0');
const request=(action,data={})=>({action,requestId:randomUUID(),...data});

test('hosted joins reserve the last seat once, retry safely, and keep peer signaling private',async()=>{
  const db=storage(), send=(i,q)=>hosted.handleLobby(db,secret(i),q);
  const create=request('create',{public:false});
  const host=await send(1,create), code=host.room.code;
  assert.equal((await send(1,create)).room.code,code);
  assert.deepEqual((await send(3,{action:'directory'})).directory,[]);
  const joins=await Promise.allSettled([2,3].map(i=>send(i,request('join',{code}))));
  assert.equal(joins.filter(r=>r.status==='fulfilled').length,1);
  const winner=joins[0].status==='fulfilled'?2:3, guest=joins[winner-2].value, outsider=winner===2?3:2;
  const packet={to:guest.id,description:{type:'offer',sdp:'offer'}};
  const signal=request('signals',{code,packets:[packet]});
  await send(1,signal);await send(1,signal);
  const received=await send(winner,{action:'poll',code});
  assert.deepEqual(received.signals.map(p=>[p.from,p.description.sdp]),[[host.id,'offer']]);
  assert.deepEqual((await send(winner,{action:'poll',code,since:received.cursor})).signals,[]);
  assert.equal((await send(outsider,{action:'poll',code})).room,undefined);
  await assert.rejects(send(outsider,request('signals',{code,packets:[packet]})),/Join a lobby/);
  await assert.rejects(hosted.handleLobby(db,host.id,request('leave',{code})),/Invalid player session/);
  await assert.rejects(send(winner,request('start',{code})),/ready/);
});

test('hosted rooms renew active players, expire abandoned guests, and close after host loss',async()=>{
  const db=storage();let now=1_000_000;
  const send=(i,q)=>hosted.handleLobby(db,secret(i),q,now);
  const {room:{code}}=await send(1,request('create',{public:true,game:'kart-racing'}));
  await send(2,request('join',{code}));
  assert.equal((await send(3,{action:'directory'})).directory[0].count,2);
  now+=90000;
  await send(1,{action:'poll',code});
  now+=30001;
  assert.equal((await send(1,{action:'poll',code})).room.players.length,1);
  assert.equal((await send(3,{action:'directory'})).directory[0].count,1);
  now+=120001;
  assert.deepEqual((await send(3,{action:'directory'})).directory,[]);
  assert.equal((await send(1,{action:'poll',code})).closed,true);
});
