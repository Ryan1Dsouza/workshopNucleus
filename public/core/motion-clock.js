// Four echo timestamps estimate remote/local clock offset. This is used only
// to reject obviously old input, not to claim exact physical sensor latency.
export class MotionClock {
  constructor({ maxAgeMs = 150 } = {}) { this.maxAgeMs=maxAgeMs;this.offset=null;this.bestRtt=Infinity; }
  sync(sent, received, remoteReceived, remoteSent) {
    if (![sent,received,remoteReceived,remoteSent].every(Number.isFinite)) return;
    const rtt=received-sent-(remoteSent-remoteReceived);
    if(rtt<0 || remoteSent<remoteReceived || rtt>10000)return;
    if(rtt<=this.bestRtt+2){this.bestRtt=Math.min(this.bestRtt,rtt);this.offset=(remoteReceived+remoteSent-sent-received)/2;}
  }
  age(time, now) { return this.offset===null || !Number.isFinite(time) ? null : now-(time-this.offset); }
  stale(time, now) { const age=this.age(time,now);return age!==null && age>this.maxAgeMs; }
}
