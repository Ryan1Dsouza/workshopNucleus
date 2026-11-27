import test from 'node:test';
import assert from 'node:assert/strict';
import {MatchPeer} from '../public/core/transport.js';
import {stunServers,directDescription} from '../public/core/direct-ice.js';

test('late ICE and stale answers cannot modify the replacement connection',async t=>{
  class Peer {
    constructor(config){this.config=config;}
    createDataChannel(){return {label:'match',ordered:false,maxRetransmits:0,close(){}};}
    async createOffer(){return {type:'offer',sdp:'offer'};}
    async setLocalDescription(){this.signalingState='have-local-offer';}
    async setRemoteDescription(sdp){this.remoteDescription=sdp;this.signalingState='stable';}
    async addIceCandidate(c){(this.candidates??=[]).push(c.candidate);}
    close(){}
  }
  const old=globalThis.RTCPeerConnection;globalThis.RTCPeerConnection=Peer;
  t.after(()=>{if(old)globalThis.RTCPeerConnection=old;else delete globalThis.RTCPeerConnection;});
  const iceServers=[{urls:['turn:relay.example:3478','turns:relay.example:443?transport=tcp','stun:direct.example:3478'],username:'a',credential:'b'},
    {urls:'turns:other.example:443',username:'c',credential:'d'}];
  const sent=[],p=new MatchPeer({initiator:true,iceServers,signal:msg=>sent.push(msg),onLink(){}});
  t.after(()=>p.close());
  assert.deepEqual(p.pc.config.iceServers,[{urls:['stun:direct.example:3478']}]);
  await p.describe(true);
  await p.receive({retry:true,generation:1});
  await new Promise(r=>setTimeout(r,0));
  assert.deepEqual(sent.map(p=>p.generation),[1,2]);
  assert.deepEqual(p.pc.config.iceServers,[{urls:['stun:direct.example:3478']}]);
  const candidate={candidate:'candidate:1 1 udp 123 127.0.0.1 12345 typ host'};
  await p.receive({candidate,generation:1});
  await p.receive({description:{type:'answer',sdp:'obsolete'},generation:1});
  assert.equal(p.pc.remoteDescription,undefined);
  await Promise.all([p.receive({candidate,generation:2}),p.receive({description:{type:'answer',sdp:'current'},generation:2})]);
  assert.equal(p.pc.remoteDescription.sdp,'current');
  await p.receive({candidate:{candidate:candidate.candidate.replace('typ host','typ relay')},generation:2});
  assert.deepEqual(p.pc.candidates,[candidate.candidate]);
  await p.receive({retry:true,generation:1});
  assert.equal(p.generation,3);
});

test('mixed configurations drop relay credentials and SDP drops relay and TCP candidates',()=>{
  assert.deepEqual(stunServers([{urls:['turn:relay','stun:direct'],username:'a',credential:'b'}]),[{urls:['stun:direct']}]);
  const line='a=candidate:1 1 udp 20 192.0.2.1 1001 typ ';
  const input=['v=0',line+'relay',line+'srflx',line.replace('udp','tcp')+'host',''].join('\r\n');
  assert.equal(directDescription({type:'offer',sdp:input}).sdp,['v=0',line+'srflx',''].join('\r\n'));
});
