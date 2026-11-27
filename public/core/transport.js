// Signaling uses Socket.IO; movement uses a direct, unordered WebRTC channel.
// Old movement is dropped instead of queued behind packets from an old swing.
import { PeerMetrics } from './diagnostics.js';
import { MotionQueue } from './motion-queue.js';
import { MotionClock } from './motion-clock.js';
import { features } from '../stage.mjs';
export { roomCode } from './room.js';
const safeParse = text => { try { return JSON.parse(text); } catch { return null; } };

// Laptop-to-laptop gameplay. Signaling handles only SDP and ICE.
export class MatchPeer {
  constructor({initiator,iceServers=[],signal,onLink,onFrame,onLatency}) {
    this.pc=new RTCPeerConnection({iceServers});
    this.signal=signal;this.onLink=onLink;this.onFrame=onFrame;this.onLatency=onLatency;
    this.pending=[];this.sequence=0;this.closed=false;this.lastSequence=-1;
    this.pc.onicecandidate=({candidate})=>{
      if(candidate?.protocol==='udp')signal({candidate:candidate.toJSON()});
    };
    this.pc.onconnectionstatechange=()=>{
      if(['failed','disconnected'].includes(this.pc.connectionState))onLink(false);
      else if(this.pc.connectionState==='connected' && this.channel?.readyState==='open')onLink(true);
    };
    this.pc.ondatachannel=({channel})=>this.attach(channel);
    if(initiator)this.attach(this.pc.createDataChannel('match',{ordered:false,maxRetransmits:0}));
  }
  async describe(offer) {
    const sdp=offer?await this.pc.createOffer():await this.pc.createAnswer();
    if(this.closed)return;
    await this.pc.setLocalDescription(sdp);
    // SDP may already contain gathered candidates in an answer or ICE restart.
    const udpOnly = sdp.sdp.split('\r\n').filter(line=>!/^a=candidate:/i.test(line)||/ udp /i.test(line)).join('\r\n');
    if(!this.closed)this.signal({description:{type:sdp.type,sdp:udpOnly}});
  }
  async receive({description,candidate}) {
    if(this.closed)return;
    if(description){
      await this.pc.setRemoteDescription(description);
      for(const c of this.pending.splice(0))await this.pc.addIceCandidate(c);
      if(description.type==='offer')await this.describe(false);
    }else if(candidate && / udp /i.test(candidate.candidate)){
      if(this.pc.remoteDescription)await this.pc.addIceCandidate(candidate);
      else this.pending.push(candidate);
    }
  }
  attach(channel) {
    if(channel.label!=='match' || channel.ordered || channel.maxRetransmits!==0){channel.close();return;}
    this.channel=channel;
    channel.onopen=()=>{
      this.onLink(true);
      this.ping=setInterval(()=>this.send({ping:performance.now()}),800);
    };
    channel.onclose=()=>{clearInterval(this.ping);if(!this.closed)this.onLink(false);};
    channel.onmessage=({data})=>{
      if(typeof data!=='string' || data.length>64000)return;
      const p=safeParse(data);if(!p)return;
      if(Number.isFinite(p.ping)){this.send({pong:p.ping});return;}
      if(Number.isFinite(p.pong)){this.onLatency(Math.round(Math.max(0,performance.now()-p.pong)));return;}
      if(this.match && p.match===this.match && Number.isSafeInteger(p.seq) && p.seq>this.lastSequence){
        this.lastSequence=p.seq;this.onFrame(p.frame);
      }
    };
  }
  begin(match){this.match=match;this.lastSequence=-1;this.sequence=0;}
  send(data){
    if(this.channel?.readyState==='open' && this.channel.bufferedAmount<64000)this.channel.send(JSON.stringify(data));
  }
  frame(frame){if(this.match)this.send({match:this.match,seq:++this.sequence,frame});}
  close(){this.closed=true;clearInterval(this.ping);this.channel?.close();this.pc.close();}
}

export class MotionLink {
  constructor({ role, room, slot = 0, onSample, onCommand, onPresence, onFeedback, onStatus, onReset } = {}) {
    this.role = role; this.room = room; this.slot = slot;
    this.handlers = { onSample, onCommand, onPresence, onFeedback, onStatus, onReset };
    this.peers = new Map(); this.slots = []; this.controllers = 0;
    this.rtt = null; this.rate = 0; this.count = 0; this.mark = performance.now();
    this.sent = 0; this.dropped = 0;
    this.motionQueue = new MotionQueue();
    this.reconnects=0;this.lastRecovery=-Infinity;
    this.socket = io({ transports: ['websocket'] });
    this.socket.on('connect', () => this.socket.emit('register', { role, room, slot }));
    this.socket.on('registered', d => { this.slot = d.slot ?? slot; this.status(); });
    this.socket.on('presence', d => this.presence(d));
    this.socket.on('signal', d => { void this.signal(d).catch(() => this.status()); });
    this.socket.on('sample', d => { if (!this.peers.get(d.session)?.motion || this.peers.get(d.session).motion.readyState !== 'open') this.receive(d, d.slot, d.session); });
    this.socket.on('command', d => this.handleCommand(d, d.slot));
    this.socket.on('feedback', d => this.handleFeedback(d));
    this.socket.on('replaced', message => { this.closePeers(); this.socket.disconnect(); onStatus?.({ text: message, mode: 'replaced' }); });
    this.socket.on('disconnect', () => { this.closePeers(); onReset?.(); this.status(); });
    this.probeTimer = setInterval(() => this.probe(), 1000);
  }
  status() {
    const open = [...this.peers.values()].filter(p => p.motion?.readyState === 'open');
    const mode = !this.socket.connected && !open.length ? 'offline' : open.length===this.peers.size && open.length ? 'direct' : open.length ? 'mixed' : 'relay';
    this.rate = [...this.peers.values()].reduce((sum,p)=>sum+p.metrics.snapshot(performance.now()).receivedHz,0);
    this.handlers.onStatus?.({ mode, rtt: this.rtt, rate: this.rate, directPeers: open.length, peers: this.peers.size,
      text: mode === 'direct' ? 'Direct Wi-Fi' : mode === 'mixed' ? 'Mixed direct / relay' : mode === 'relay' ? 'Server relay' : 'Reconnecting' });
  }
  closePeers() { this.clearMotion();for (const peer of this.peers.values()) { clearTimeout(peer.retry); peer.pc?.close(); } this.peers.clear(); }
  presence(data) {
    this.controllers = data.controller; this.slots = data.slots || [];
    const wanted = this.role === 'game' ? this.slots.filter(s => s.occupied).map(s => ({ id: s.id, slot: s.slot })) : data.host ? [{ id: data.host, slot: this.slot }] : [];
    for (const [id, p] of this.peers) if (!wanted.some(w => w.id === id)) { clearTimeout(p.retry); p.pc?.close(); this.peers.delete(id); this.handlers.onReset?.(p.slot); }
    for (const w of wanted) if (!this.peers.has(w.id)) {
      const p = this.makePeer(w.id, w.slot);
      if (this.role === 'game' && p.pc) void this.offer(p);
    }
    this.handlers.onPresence?.(data); this.status();
  }
  makePeer(id, slot) {
    const p = { id, slot, pending: [], motion: null, control: null, lastSequence: -1, metrics:new PeerMetrics(),clock:new MotionClock(),staleDropped:0 };
    this.peers.set(id, p);
    if (!features.direct || !window.RTCPeerConnection) return p;
    // No STUN/TURN dependency for a shared LAN. If the network isolates peers,
    // the explicit relay fallback keeps controls available with a warning.
    p.pc = new RTCPeerConnection({ iceServers: [] });
    p.pc.onicecandidate = e => { if (e.candidate) this.sendSignal(p.id, { candidate: e.candidate.toJSON() }); };
    p.pc.ondatachannel = e => this.attach(p, e.channel);
    p.pc.onconnectionstatechange = () => {
      this.status();
      if (p.pc.connectionState === 'failed' && this.role === 'game') {
        p.retry = setTimeout(() => { if (this.peers.get(id) === p) { p.pc.close(); this.peers.delete(id); const fresh = this.makePeer(id, slot); void this.offer(fresh); } }, 2000);
      }
    };
    return p;
  }
  attach(peer, channel) {
    peer[channel.label] = channel;
    channel.onopen = () => this.status(); channel.onclose = () => this.status();
    if (channel.label === 'motion' && this.role === 'phone') {
      channel.bufferedAmountLowThreshold = 0;
      channel.onbufferedamountlow = () => { if(this.motionQueue.drain(channel,performance.now())) this.sent++; };
    }
    channel.onmessage = e => {
      if(this.peers.get(peer.id)!==peer)return;
      const d = safeParse(e.data); if (!d) return;
      if (channel.label === 'motion' && this.role === 'game') this.receive(d, peer.slot, peer.id);
      if (channel.label !== 'control') return;
      if (d.kind === 'command') this.handleCommand({ ...d.data, session: peer.id }, peer.slot);
      if (d.kind === 'feedback') this.handleFeedback(d.data);
      if (d.kind === 'ping' && channel.readyState === 'open' && channel.bufferedAmount<1024) channel.send(JSON.stringify({ kind: 'pong', t: d.t, receivedAt:performance.now(), sentAt:performance.now() }));
      if (d.kind === 'pong') this.recordRtt(peer,d.t,d.receivedAt,d.sentAt);
    };
  }
  sendSignal(to, payload) { this.socket.emit('signal', { to, payload }); }
  async offer(peer) {
    try {
      this.attach(peer, peer.pc.createDataChannel('motion', { ordered: false, maxRetransmits: 0, priority: 'high' }));
      this.attach(peer, peer.pc.createDataChannel('control'));
      await peer.pc.setLocalDescription(await peer.pc.createOffer());
      this.sendSignal(peer.id, { description: peer.pc.localDescription.toJSON() });
    } catch { this.status(); }
  }
  async signal({ from, payload, slot }) {
    let p = this.peers.get(from);
    if (!p && this.role === 'phone') p = this.makePeer(from, this.slot);
    if (!p?.pc || !payload) return;
    if (payload.description) {
      if (payload.description.type === 'offer' && p.pc.remoteDescription) { clearTimeout(p.retry); p.pc.close(); this.peers.delete(from); p = this.makePeer(from, this.slot); }
      await p.pc.setRemoteDescription(payload.description);
      for (const c of p.pending.splice(0)) await p.pc.addIceCandidate(c);
      if (payload.description.type === 'offer') { await p.pc.setLocalDescription(await p.pc.createAnswer()); this.sendSignal(from, { description: p.pc.localDescription.toJSON() }); }
    }
    if (payload.candidate) { if (p.pc.remoteDescription) await p.pc.addIceCandidate(payload.candidate); else p.pending.push(payload.candidate); }
  }
  receive(sample, slot, session) {
    if (!sample || !Number.isFinite(sample.t) || !Number.isSafeInteger(sample.sequence)) return;
    const quat = Array.isArray(sample.quat) && sample.quat.length === 4 && sample.quat.every(Number.isFinite);
    const euler = [sample.alpha, sample.beta, sample.gamma].every(Number.isFinite);
    if (!quat && !euler) return;
    if (sample.motion && ['rx','ry','rz'].some(k => !Number.isFinite(sample.motion[k]) || Math.abs(sample.motion[k]) > 10000)) return;
    const p = this.peers.get(session); if (!p || sample.sequence <= p.lastSequence) return;
    const now=performance.now();
    p.metrics.observe(sample,now,p.lastSequence);
    p.lastSequence = sample.sequence;
    if(p.clock.stale(Number.isFinite(sample.poseT)?sample.poseT:sample.t,now)){p.staleDropped++;return;}
    this.count++;
    if (now - this.mark > 1000) { this.rate = Math.round(this.count * 1000 / (now - this.mark)); this.count = 0; this.mark = now; this.status(); }
    this.handlers.onSample?.({ ...sample, session }, slot);
  }
  sample(data) {
    const peer = [...this.peers.values()][0];
    if (peer?.motion?.readyState === 'open') {
      const now=performance.now();
      if (!this.motionQueue.offer(data,peer.motion,now)) {
        this.dropped++;
        if(now-this.motionQueue.blockedSince>1500)this.reconnect(false);
        return false;
      }
    } else if (this.socket.connected && this.socket.io.engine?.transport?.writable) this.socket.volatile.emit('sample', data);
    else {this.dropped++;return false;}
    this.sent++;return true;
  }
  clearMotion() { this.motionQueue.clear(); }
  reconnect(manual=true) {
    if(this.role!=='phone' || performance.now()-this.lastRecovery<(manual?1000:15000))return false;
    this.lastRecovery=performance.now();this.reconnects++;this.rtt=null;
    this.closePeers();this.socket.disconnect();this.socket.connect();
    this.handlers.onStatus?.({mode:'reconnecting',text:'Resetting motion connection',rtt:null});
    return true;
  }
  command(data) {
    const peer = [...this.peers.values()][0];
    if (peer?.control?.readyState === 'open') peer.control.send(JSON.stringify({ kind: 'command', data }));
    else this.socket.emit('command', data);
  }
  feedback(data) {
    for (const peer of this.peers.values()) {
      if (Number.isInteger(data.slot) && data.slot !== peer.slot) continue;
      if (peer.control?.readyState === 'open') {
        if(['slice','bomb','miss'].includes(data.type) && peer.control.bufferedAmount>1024)continue;
        peer.control.send(JSON.stringify({ kind: 'feedback', data }));
      }
      else this.socket.emit('feedback', { ...data, slot: peer.slot });
    }
  }
  probe() {
    for (const peer of this.peers.values()) {
      if(peer.pc && !peer.statsPending) {
        peer.statsPending=true;
        void peer.pc.getStats().then(stats=>{
          const transport=[...stats.values()].find(s=>s.type==='transport'&&s.selectedCandidatePairId);
          const pair=transport?stats.get(transport.selectedCandidatePairId):[...stats.values()].find(s=>s.type==='candidate-pair'&&s.state==='succeeded'&&s.nominated);
          const local=pair&&stats.get(pair.localCandidateId),remote=pair&&stats.get(pair.remoteCandidateId);
          peer.ice={rttMs:Number.isFinite(pair?.currentRoundTripTime)?pair.currentRoundTripTime*1000:null,protocol:local?.protocol||null,localType:local?.candidateType||null,remoteType:remote?.candidateType||null};
        }).catch(()=>{}).finally(()=>peer.statsPending=false);
      }
      const t=performance.now();
      if (peer.control?.readyState === 'open') {if(peer.control.bufferedAmount<1024)peer.control.send(JSON.stringify({ kind: 'ping', t }));}
      else if(this.socket.connected) {
        if(this.role==='game')this.feedback({type:'__probe',t,slot:peer.slot});
        else this.command({type:'__probe',t});
      }
    }
    this.status();
  }
  recordRtt(peer,t,remoteReceived,remoteSent) {
    const now=performance.now(),duration=now-t;
    if(!peer || !Number.isFinite(t) || duration<0 || duration>10000)return;
    peer.clock.sync(t,now,remoteReceived,remoteSent);
    peer.metrics.rtt.add(duration);this.rtt=Math.round(duration);this.status();
  }
  handleCommand(data,slot) {
    if(data?.type==='__probe'){this.feedback({type:'__probe_reply',t:data.t,slot,receivedAt:performance.now(),sentAt:performance.now()});return;}
    if(data?.type==='__probe_reply'){this.recordRtt([...this.peers.values()].find(p=>p.slot===slot),data.t,data.receivedAt,data.sentAt);return;}
    this.handlers.onCommand?.(data,slot);
  }
  handleFeedback(data) {
    if(data?.type==='__probe'){this.command({type:'__probe_reply',t:data.t,receivedAt:performance.now(),sentAt:performance.now()});return;}
    if(data?.type==='__probe_reply'){this.recordRtt([...this.peers.values()][0],data.t,data.receivedAt,data.sentAt);return;}
    this.handlers.onFeedback?.(data);
  }
  diagnostics(now=performance.now()) { return { sent:this.sent, locallyDropped:this.dropped, reconnects:this.reconnects,motionPending:!!this.motionQueue.pending, peers:[...this.peers.values()].map(p=>({slot:p.slot,path:p.motion?.readyState==='open'?'direct':'relay',ice:p.ice||null,staleDropped:p.staleDropped,...p.metrics.snapshot(now)})) }; }
  destroy() { clearInterval(this.probeTimer); this.closePeers(); this.socket.disconnect(); }
}
