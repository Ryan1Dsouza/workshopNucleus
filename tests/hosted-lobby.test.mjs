import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import hosted from '../server/hosted-lobby.cjs';
import rules from '../server/lobby-room.cjs';
import endpoint from '../api/lobby.js';

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
    async directory(now){return [...rows.values()].filter(r=>r.room && r.seen[r.room.players[0].id]+120000>now && rules.idleDeadline(r)>now).map(rules.listing).filter(Boolean);}
  };
}
const secret=i=>String(i).padStart(64,'0');
const request=(action,data={})=>({action,requestId:randomUUID(),...data});

for(const isPublic of [true,false])test((isPublic?'public':'private')+' hosted room expires despite continuous presence and signaling',async()=>{
  const db=storage();let now=1_000_000;
  const send=(i,q)=>hosted.handleLobby(db,secret(i),q,now);
  const {room:{code}}=await send(1,request('create',{public:isPublic,name:'Host',game:'kart-racing'}));
  const guest=await send(2,request('join',{code,name:'Guest'}));
  const browse=async()=>(await send(3,{action:'directory'})).directory;
  for(let minute=1;minute<=5;minute++){
    now+=60000;
    await send(1,{action:'poll',code});
    await send(2,request('links',{code,peers:[]}));
    if(minute===1)await send(2,request('activity',{code}));
    await send(1,request('signals',{code,packets:[{to:guest.id,retry:true}]}));
  }
  now+=59999;
  assert.equal((await browse()).length,isPublic?1:0);
  assert.equal((await send(2,{action:'poll',code})).room.code,code);
  ++now;
  assert.equal((await browse()).length,0);
  await assert.rejects(send(3,request('join',{code,name:'Late'})),/5 minutes/);
  const result=await send(1,request('activity',{code}));
  assert.ok(result.closed);assert.match(result.message,/5 minutes/);
  assert.equal((await send(2,{action:'poll',code})).message,result.message);
  assert.equal((await db.load(code)).room,undefined);
});

test('hosted matches outlast the setup timer and finishing starts a fresh idle window',async()=>{
  const db=storage();let now=1_000_000;
  const send=(i,q)=>hosted.handleLobby(db,secret(i),q,now);
  const {room:{code},id:host}=await send(1,request('create',{name:'Host'}));
  const {id:guest}=await send(2,request('join',{code,name:'Guest'}));
  for(const [i,peer] of [[1,guest],[2,host]])await send(i,request('links',{code,peers:[peer]}));
  for(const i of [1,2])await send(i,request('ready',{code,value:true}));
  const {room:{match}}=await send(1,request('start',{code}));
  const poll=i=>send(i,{action:'poll',code});
  for(let minute=0;minute<6;minute++){
    now+=60000;
    for(const i of [1,2])assert.equal((await poll(i)).room.match.id,match.id);
  }
  for(const i of [1,2])await send(i,request('finish',{code,match:match.id}));
  for(let minute=0;minute<4;minute++){
    now+=60000;
    for(const i of [1,2])assert.equal((await poll(i)).room.match,null);
  }
  now+=60000;
  assert.equal((await poll(1)).closed,true);
});

test('the production API distinguishes an exhausted allowance from a temporary storage outage',async t=>{
  const variable='KV_REST_API_URL', credential='KV_REST_API_TOKEN';
  for(const key of [variable,credential]){
    const old=process.env[key];
    t.after(()=>{if(old===undefined)delete process.env[key];else process.env[key]=old;});
  }
  process.env[variable]='https://lobbies.example';
  process.env[credential]='fixture';
  let upstream;
  t.mock.method(globalThis,'fetch',async()=>upstream);
  const req={method:'POST',headers:{'content-type':'application/json',authorization:'Bearer '+secret(1)},body:{action:'directory'}};
  for(const [response,expected] of [
    [new Response('Limit reached',{status:429}),429],
    [Response.json({error:'ERR max requests limit exceeded'}),429],
    [new Response('Temporarily unavailable',{status:503}),503]
  ]){
    upstream=response;
    const res={setHeader(){},status(value){this.code=value;return this;},json(value){this.body=value;}};
    await endpoint(req,res);
    assert.equal(res.code,expected);
    assert.equal(res.body.error,'Lobby service is temporarily unavailable.');
  }
});

test('hosted joins reserve the last seat once, retry safely, and keep peer signaling private',async()=>{
  const db=storage(), send=(i,q)=>hosted.handleLobby(db,secret(i),q);
  const create=request('create',{public:false,name:'Host'});
  const host=await send(1,create), code=host.room.code;
  assert.equal((await send(1,create)).room.code,code);
  assert.deepEqual((await send(3,{action:'directory'})).directory,[]);
  const joins=await Promise.allSettled([2,3].map(i=>send(i,request('join',{code,name:'Guest '+i}))));
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
  const {room:{code}}=await send(1,request('create',{public:true,game:'kart-racing',name:'Host'}));
  await send(2,request('join',{code,name:'Guest'}));
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

test('only the host can remove a guest and release their seat and signaling state',async()=>{
  const db=storage(), send=(i,q)=>hosted.handleLobby(db,secret(i),q);
  const {room:{code},id:host}=await send(1,request('create',{public:true,game:'kart-racing',name:'Host'}));
  const {id:guest}=await send(2,request('join',{code,name:'Guest'}));
  await assert.rejects(send(2,request('remove',{code,player:host})),/Only the host/);
  await assert.rejects(send(1,request('remove',{code,player:host})),/Choose a guest/);
  await send(1,request('signals',{code,packets:[{to:guest,retry:true}]}));
  for(const [i,peer] of [[1,guest],[2,host]])await send(i,request('links',{code,peers:[peer]}));
  for(const i of [1,2])await send(i,request('ready',{code,value:true}));
  await send(1,request('start',{code}));
  const kick=request('remove',{code,player:guest});
  for(let i=0;i<2;i++){
    const {room}=await send(1,kick);
    assert.deepEqual(room.players.map(p=>p.id),[host]);
    assert.equal(room.match,null);assert.equal(room.players[0].linked,false);
  }
  const result=await send(2,{action:'poll',code});
  assert.ok(result.closed && result.removed);
  assert.equal(result.room,undefined);
  assert.equal((await send(3,{action:'directory'})).directory[0].count,1);
  await assert.rejects(send(2,request('signals',{code,packets:[{to:host,retry:true}]})),/Join a lobby/);
  assert.deepEqual((await send(2,request('join',{code,name:'Guest'}))).signals,[]);
});
