import { PeerMetrics } from './diagnostics.js';
import { hasPose } from './motion-input.js';

// Stage 3 teaches the server relay before direct WebRTC in Stage 4.
export class RelayMotionLink {
  constructor({ role, room, slot = 0, onSample, onCommand, onPresence, onFeedback, onStatus, onReset } = {}) {
    this.role = role; this.room = room; this.slot = slot;
    this.handlers = { onSample, onCommand, onPresence, onFeedback, onStatus, onReset };
    this.peers = new Map(); this.slots = []; this.controllers = 0;
    this.sent = this.dropped = this.reconnects = 0; this.rtt = null;
    this.socket = io({ transports: ['websocket'] });
    this.socket.on('connect', () => this.socket.emit('register', { role, room, slot }));
    this.socket.on('registered', data => { this.slot = data.slot ?? slot; this.status(); });
    this.socket.on('presence', data => this.presence(data));
    this.socket.on('sample', sample => {
      const peer = this.peers.get(sample?.session);
      if (!peer || !hasPose(sample) || !Number.isFinite(sample.t) || !Number.isSafeInteger(sample.sequence)
        || sample.sequence <= peer.lastSequence) return;
      if (sample.motion && ['rx', 'ry', 'rz'].some(key => !Number.isFinite(sample.motion[key]) || Math.abs(sample.motion[key]) > 10000)) return;
      peer.metrics.observe(sample, performance.now(), peer.lastSequence);
      peer.lastSequence = sample.sequence;
      onSample?.(sample, peer.slot);
    });
    this.socket.on('command', data => onCommand?.(data, data.slot));
    this.socket.on('feedback', data => onFeedback?.(data));
    this.socket.on('disconnect', () => { this.peers.clear(); onReset?.(); this.status(); });
    this.socket.on('replaced', text => { this.socket.disconnect(); onStatus?.({ mode: 'replaced', text }); });
  }
  presence(data) {
    this.slots = data.slots || []; this.controllers = data.controller;
    const wanted = this.role === 'game' ? this.slots.filter(slot => slot.occupied)
      : data.host ? [{ id: data.host, slot: this.slot }] : [];
    for (const [id, peer] of this.peers) if (!wanted.some(slot => slot.id === id)) {
      this.peers.delete(id); this.handlers.onReset?.(peer.slot);
    }
    for (const slot of wanted) if (!this.peers.has(slot.id)) this.peers.set(slot.id, { ...slot, lastSequence: -1, metrics: new PeerMetrics() });
    this.handlers.onPresence?.(data); this.status();
  }
  status() {
    this.handlers.onStatus?.({ mode: this.socket.connected ? 'relay' : 'offline',
      text: this.socket.connected ? 'Server relay' : 'Reconnecting', rtt: null, rate: 0, directPeers: 0, peers: this.peers.size });
  }
  sample(sample) {
    if (!this.socket.connected || !this.socket.io.engine?.transport?.writable) { this.dropped++; return false; }
    this.socket.volatile.emit('sample', sample); this.sent++; return true;
  }
  command(command) { this.socket.emit('command', command); }
  feedback(feedback) { this.socket.emit('feedback', feedback); }
  clearMotion() {}
  reconnect() { this.reconnects++; this.socket.disconnect(); this.socket.connect(); return true; }
  diagnostics(now = performance.now()) {
    return { sent: this.sent, locallyDropped: this.dropped, reconnects: this.reconnects,
      peers: [...this.peers.values()].map(peer => ({ slot: peer.slot, path: 'relay', ...peer.metrics.snapshot(now) })) };
  }
  destroy() { this.socket.disconnect(); this.peers.clear(); }
}
