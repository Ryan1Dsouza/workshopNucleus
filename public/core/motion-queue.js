// One newest waiting sample, never a FIFO of old blade positions.
export class MotionQueue {
  constructor({ maxWaitMs = 50 } = {}) { this.maxWaitMs = maxWaitMs; this.clear(); }
  clear() { this.pending = null; this.blockedSince = null; }
  offer(data, channel, now) {
    if (channel.bufferedAmount > 0) { this.blockedSince??=now;this.pending = { data, at: now, channel }; return false; }
    this.clear(); channel.send(JSON.stringify(data)); return true;
  }
  drain(channel, now) {
    const p = this.pending;
    if (!p || p.channel !== channel || channel.readyState !== 'open' || channel.bufferedAmount > 0) return false;
    this.clear();
    if (now - p.at > this.maxWaitMs) return false;
    channel.send(JSON.stringify(p.data)); return true;
  }
}
