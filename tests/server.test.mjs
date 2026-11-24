import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { io } from 'socket.io-client';
import serverModule from '../server/index.cjs';
const delay = ms => new Promise(resolve=>setTimeout(resolve,ms));
test('missing optional audio and favicon are quiet while missing required assets still fail',async t=>{
  const server=serverModule.createWorkshopServer();await new Promise(r=>server.servers[0].listen(0,'127.0.0.1',r));
  t.after(()=>new Promise(r=>server.io.close(r)));
  const base='http://127.0.0.1:'+server.servers[0].address().port;
  for(const file of ['/audio/absent-cue.mp3','/favicon.ico']){const response=await fetch(base+file);assert.equal(response.status,204);assert.equal((await response.arrayBuffer()).byteLength,0);}
  assert.equal((await fetch(base+'/required-missing.js')).status,404);
});
async function fixture(t) {
  const server=serverModule.createWorkshopServer(), sockets=[];
  await new Promise(resolve=>server.servers[0].listen(0,'127.0.0.1',resolve));
  const base=`http://127.0.0.1:${server.servers[0].address().port}`;
  t.after(async()=>{for(const socket of sockets)socket.disconnect();await new Promise(resolve=>server.io.close(resolve));});
  return async(role,room,slot=0)=>{
    const socket=io(base,{transports:['websocket'],autoConnect:false});sockets.push(socket);
    const connected=once(socket,'connect');socket.connect();await connected;
    const registered=once(socket,'registered');socket.emit('register',{role,room,slot});await registered;
    return socket;
  };
}
test('two workshop rooms keep motion, commands and signaling separate',async t=>{
  const join=await fixture(t), a='aaaaaaaaaaaaaaaa',b='bbbbbbbbbbbbbbbb';
  const hostA=await join('game',a),hostB=await join('game',b),phoneA=await join('phone',a);
  let leaks=0;for(const name of ['sample','command','signal'])hostB.on(name,()=>leaks++);
  const sample=once(hostA,'sample');phoneA.emit('sample',{t:10,sequence:1,alpha:0,beta:0,gamma:0});
  const [data]=await sample;assert.equal(data.slot,0);assert.equal(data.session,phoneA.id);
  const command=once(hostA,'command');phoneA.emit('command',{type:'recentre'});assert.equal((await command)[0].type,'recentre');
  const signal=once(hostA,'signal');phoneA.emit('signal',{to:hostB.id,payload:{test:true}});assert.equal((await signal)[0].from,phoneA.id);
  await delay(30);assert.equal(leaks,0);
});
test('a replacement phone takes its slot and the old controller disconnects',async t=>{
  const join=await fixture(t),room='cccccccccccccccc';
  const host=await join('game',room),old=await join('phone',room,1);
  const disconnected=once(old,'disconnect');const phone=await join('phone',room,1);await disconnected;
  assert.equal(old.connected,false);
  const command=once(host,'command');phone.emit('command',{type:'start'});const [data]=await command;
  assert.equal(data.slot,1);assert.equal(data.type,'start');
});
test('only the host sends feedback and targeted hits reach the correct phone',async t=>{
  const join=await fixture(t),room='dddddddddddddddd';
  const host=await join('game',room),p1=await join('phone',room,0),p2=await join('phone',room,1);
  let wrong=0;p2.on('feedback',()=>wrong++);
  p1.emit('feedback',{type:'bomb'});await delay(30);assert.equal(wrong,0);
  const hit=once(p1,'feedback');host.emit('feedback',{type:'slice',slot:0});assert.equal((await hit)[0].type,'slice');
  await delay(30);assert.equal(wrong,0);
});
