import test from 'node:test';
import assert from 'node:assert/strict';
import {MatchPeer} from '../public/core/transport.js';
import turn from '../server/turn-config.cjs';

test('late ICE and stale answers cannot modify the replacement connection',async t=>{
  class Peer {
    createDataChannel(){return {label:'match',ordered:false,maxRetransmits:0,close(){}};}
    async createOffer(){return {type:'offer',sdp:'offer'};}
    async setLocalDescription(){this.signalingState='have-local-offer';}
    async setRemoteDescription(sdp){this.remoteDescription=sdp;this.signalingState='stable';}
    async addIceCandidate(c){(this.candidates??=[]).push(c.candidate);}
    close(){}
  }
  const old=globalThis.RTCPeerConnection;globalThis.RTCPeerConnection=Peer;
  t.after(()=>{if(old)globalThis.RTCPeerConnection=old;else delete globalThis.RTCPeerConnection;});
  const sent=[],p=new MatchPeer({initiator:true,signal:msg=>sent.push(msg),onLink(){}});
  t.after(()=>p.close());
  await p.describe(true);
  await p.receive({retry:true,generation:1});
  await new Promise(r=>setTimeout(r,0));
  assert.deepEqual(sent.map(p=>p.generation),[1,2]);
  const candidate={candidate:'candidate:1 1 udp 123 127.0.0.1 12345 typ host'};
  await p.receive({candidate,generation:1});
  await p.receive({description:{type:'answer',sdp:'obsolete'},generation:1});
  assert.equal(p.pc.remoteDescription,undefined);
  await Promise.all([p.receive({candidate,generation:2}),p.receive({description:{type:'answer',sdp:'current'},generation:2})]);
  assert.equal(p.pc.remoteDescription.sdp,'current');
  assert.deepEqual(p.pc.candidates,[candidate.candidate]);
  await p.receive({retry:true,generation:1});
  assert.equal(p.generation,3);
});

test('room members receive UDP relay credentials without the provider API key',async t=>{
  const get=t.mock.method(globalThis,'fetch',async()=>Response.json([
    {urls:['turn:relay.example:3478','turn:relay.example:443?transport=tcp','turns:relay.example:443'],username:'guest',credential:'temporary'},
    {urls:'stun:stun.example'}
  ]));
  assert.deepEqual(await turn.roomIceServers('https://wrong.example/api/v1/turn/credentials'),[]);
  assert.equal(get.mock.callCount(),0);
  const servers=await turn.roomIceServers('https://workshop.metered.live/api/v1/turn/credentials?apiKey=fixture');
  assert.deepEqual(servers,[{urls:['turn:relay.example:3478'],username:'guest',credential:'temporary'}]);
});
