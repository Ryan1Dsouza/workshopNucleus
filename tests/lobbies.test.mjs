import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {io} from 'socket.io-client';
import workshop from '../server/index.cjs';

test('lobby directory, host permissions, readiness and match identities survive rematch and departure',async t=>{
  const server=workshop.createWorkshopServer(), sockets=[];
  await new Promise(r=>server.servers[0].listen(0,'127.0.0.1',r));
  t.after(async()=>{for(const s of sockets)s.disconnect();await new Promise(r=>server.io.close(r));});
  async function client(){
    const base='http://127.0.0.1:'+server.servers[0].address().port;
    const s=io(base+'/lobbies',{transports:['websocket'],autoConnect:false});
    sockets.push(s);const connected=once(s,'directory');s.connect();await connected;return s;
  }
  const host=await client(),guest=await client(),observer=await client();
  const send=(s,action,data={})=>s.timeout(1500).emitWithAck('lobby',{action,...data});
  let state,list;
  host.on('room',room=>{state=room;});
  observer.on('directory',entries=>{list=entries;});
  async function afterDirectory(action){
    const published=once(observer,'directory');await action();await published;
  }
  assert.ok((await send(host,'create',{public:false,name:'   '})).error);
  await afterDirectory(()=>send(host,'create',{public:false,name:'A'}));
  const privateCode=state.code;
  assert.equal(list.length,0);
  assert.ok((await send(guest,'join',{code:privateCode.toLowerCase()})).error);
  assert.ok((await send(guest,'join',{code:privateCode.toLowerCase(),name:'a'})).error);
  await afterDirectory(async()=>assert.ok((await send(guest,'join',{code:privateCode.toLowerCase(),name:'B'})).ok));
  assert.ok((await send(observer,'join',{code:privateCode,name:'Obs'})).error);
  assert.ok((await send(guest,'options',{options:state.options})).error);
  assert.ok((await send(host,'start')).error);
  const packet=once(host,'signal');guest.emit('signal',{to:host.id,candidate:{candidate:'candidate UDP'}});assert.equal((await packet)[0].from,guest.id);
  await send(host,'linked',{value:true});await send(guest,'linked',{value:true});
  let lastId;
  for(let i=0;i<2;i++){
    await send(host,'ready',{value:true});await send(guest,'ready',{value:true});
    assert.ok((await send(guest,'start')).error);
    await send(host,'start');assert.ok(state.match.at>Date.now());assert.notEqual(state.match.id,lastId);
    lastId=state.match.id;assert.ok((await send(host,'finish',{match:'previous'})).error);
    await send(guest,'finish',{match:lastId});assert.equal(state.match.id,lastId);
    await send(host,'finish',{match:lastId});assert.equal(state.match,null);
  }
  const closed=once(guest,'closed');await afterDirectory(()=>send(host,'leave'));await closed;
  await afterDirectory(()=>send(host,'create',{public:true,name:'Alex',game:'kart-racing'}));
  assert.deepEqual(list,[{name:'Alex',code:state.code,game:'kart-racing',count:1,capacity:8}]);
  await afterDirectory(()=>send(guest,'join',{code:state.code,name:'Guest'}));
  assert.equal(list[0].count,2);
  await afterDirectory(()=>guest.disconnect());assert.equal(list[0].count,1);assert.equal(state.players[0].ready,false);
  const party=[host];
  for(let i=1;i<8;i++){
    const peer=await client();party.push(peer);
    await afterDirectory(()=>send(peer,'join',{code:state.code,name:'Player '+(i+1)}));
    assert.equal(state.players.length,i+1);assert.equal(list.length,i===7?0:1);
  }
  assert.equal(new Set(state.options.drivers).size,8);
  assert.ok((await send(observer,'join',{code:state.code,name:'Obs'})).error);
  assert.ok((await send(host,'options',{options:{...state.options,game:'fruit-ninja'}})).error);
  const assigned=new Map(state.players.map((p,i)=>[p.id,state.options.drivers[i]]));
  const departed=party.splice(3,1)[0];
  assert.ok((await send(departed,'remove',{player:host.id})).error);
  assert.ok((await send(host,'remove',{player:host.id})).error);
  const removed=once(departed,'closed');
  await afterDirectory(()=>send(host,'remove',{player:departed.id}));
  assert.match((await removed)[0],/host removed/);
  assert.ok((await send(departed,'ready',{value:true})).error);
  assert.equal(list[0].count,7);
  assert.deepEqual(state.options.drivers,state.players.map(p=>assigned.get(p.id)));
  for(const p of party){
    for(const other of party)if(other!==p)await send(p,'linked',{peer:other.id,value:true});
    await send(p,'ready',{value:true});
  }
  await afterDirectory(()=>send(host,'start'));
  assert.ok(state.match);assert.equal(list.length,0);
  assert.ok((await send(observer,'join',{code:state.code,name:'Obs'})).error);
  for(const p of party.slice(1))await send(p,'finish',{match:state.match.id});
  assert.ok(state.match);
  await afterDirectory(()=>send(host,'finish',{match:state.match.id}));
  assert.equal(list[0].count,7);
  await afterDirectory(()=>send(host,'leave'));
  await afterDirectory(()=>send(host,'create',{public:true,name:'BotHost',game:'kart-racing',capacity:3}));
  assert.equal(state.capacity,3);
  assert.equal(list[0].capacity,3);
  const second=await client(), third=await client();
  await afterDirectory(()=>send(second,'join',{code:state.code,name:'Second'}));
  await afterDirectory(()=>send(third,'join',{code:state.code,name:'Third'}));
  assert.ok((await send(observer,'join',{code:state.code,name:'Obs'})).error);
  await afterDirectory(()=>send(host,'options',{options:{...state.options,capacity:4}}));
  assert.equal(state.capacity,4);
  assert.equal(list[0].capacity,4);
  assert.ok((await send(host,'options',{options:{...state.options,capacity:2}})).error);
  await afterDirectory(()=>send(host,'options',{options:{...state.options,bots:false}}));
  assert.equal(state.options.bots,false);
  assert.equal(list[0].bots,false);
  await afterDirectory(()=>send(host,'options',{options:{...state.options,bots:true}}));
  assert.equal(state.options.bots,true);
  assert.equal(list[0].bots,undefined);
  await afterDirectory(()=>send(host,'leave'));
  await afterDirectory(()=>send(host,'create',{public:true,name:'NoBotHost',game:'kart-racing',capacity:2,bots:false}));
  assert.equal(state.options.bots,false);
  assert.deepEqual(list,[{name:'NoBotHost',code:state.code,game:'kart-racing',count:1,capacity:2,bots:false}]);
});

test('Socket.IO closes an idle room for every member and lets them create again',async t=>{
  const server=workshop.createWorkshopServer();
  await new Promise(resolve=>server.servers[0].listen(0,'127.0.0.1',resolve));
  const url='http://127.0.0.1:'+server.servers[0].address().port+'/lobbies';
  const clients=[0,1,2].map(()=>io(url,{autoConnect:false,transports:['websocket']}));
  t.after(async()=>{for(const client of clients)client.disconnect();await new Promise(resolve=>server.io.close(resolve));});
  await Promise.all(clients.map(s=>{const ready=once(s,'directory');s.connect();return ready;}));
  const [host,guest,observer]=clients;
  const send=(s,action,data={})=>s.emitWithAck('lobby',{action,...data});
  // Advance the lobby clock while Socket.IO retains real transport timers.
  t.mock.timers.enable({apis:['Date'],now:1_000_000});
  const created=once(host,'room');
  await send(host,'create',{public:true,name:'Host',game:'kart-racing'});
  const [{code}]=await created;
  await send(guest,'join',{code,name:'Guest'});
  t.mock.timers.tick(240000);
  await send(guest,'activity');
  t.mock.timers.tick(299999);
  assert.ok((await send(host,'links',{peers:[]})).ok);
  const closures=[once(host,'closed'),once(guest,'closed')], directory=once(observer,'directory');
  t.mock.timers.tick(1);
  for(const [message] of await Promise.all(closures))assert.match(message,/5 minutes/);
  assert.deepEqual((await directory)[0],[]);
  assert.ok((await send(observer,'join',{code,name:'Late'})).error);
  assert.ok((await send(guest,'create',{name:'New host'})).ok);
});
