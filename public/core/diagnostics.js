// Measurements are local to this session. Sender and receiver clocks are never
// subtracted: RTT is measured by echoes, not presented as one-way input latency.
export class Samples {
  constructor(limit = 300) { this.limit = limit; this.values = []; }
  add(value) { if (Number.isFinite(value) && value >= 0) { this.values.push(value); if (this.values.length > this.limit) this.values.shift(); } }
  clear() { this.values.length = 0; }
  snapshot() {
    if (!this.values.length) return { count: 0, mean: null, median: null, p95: null, max: null };
    const sorted = [...this.values].sort((a,b)=>a-b), n=sorted.length;
    return { count:n, mean:sorted.reduce((a,b)=>a+b,0)/n, median:sorted[Math.floor((n-1)*.5)], p95:sorted[Math.ceil(n*.95)-1], max:sorted[n-1] };
  }
}
export class RateWindow {
  constructor(windowMs = 2000) { this.windowMs=windowMs; this.times=[]; }
  add(time) {
    if (!Number.isFinite(time)) return;
    this.times.push(time); this.prune(time);
    if (this.times.length > 512) this.times.shift();
  }
  prune(now) { while(this.times.length && now-this.times[0]>this.windowMs)this.times.shift(); }
  hz(now) {
    this.prune(now); const n=this.times.length;
    if(n<2 || now-this.times[n-1]>250)return 0;
    const span=this.times[n-1]-this.times[0]; return span>0?(n-1)*1000/span:0;
  }
}
export class PeerMetrics {
  constructor() { this.arrivals=new RateWindow(); this.poses=new RateWindow(); this.gaps=new Samples(); this.dispatchAge=new Samples(); this.rtt=new Samples(60); this.lastAt=null; this.lastPose=null; this.sequenceGaps=0; this.received=0; this.sensorStats=null; this.source=null; }
  observe(sample, now, previousSequence=-1) {
    if(this.lastAt!==null)this.gaps.add(now-this.lastAt);
    this.lastAt=now; this.arrivals.add(now); this.received++;
    if(previousSequence>=0)this.sequenceGaps+=Math.max(0,sample.sequence-previousSequence-1);
    const poseTime=Number.isFinite(sample.poseT)?sample.poseT:sample.t;
    if(poseTime!==this.lastPose){this.poses.add(now);this.lastPose=poseTime;}
    const age=sample.t-poseTime;
    if(age>=0 && age<60000)this.dispatchAge.add(age);
    if(sample.sensorStats && typeof sample.sensorStats==='object')this.sensorStats=sample.sensorStats;
    this.source=sample.source || 'unknown';
  }
  snapshot(now) { return { receivedHz:this.arrivals.hz(now), poseHz:this.poses.hz(now), gapMs:this.gaps.snapshot(), captureToSendMs:this.dispatchAge.snapshot(), rttMs:this.rtt.snapshot(), sequenceGaps:this.sequenceGaps, received:this.received, source:this.source, sensors:this.sensorStats, idle:this.lastAt===null || now-this.lastAt>250 }; }
}
export class FrameMetrics {
  constructor() { this.intervals=new Samples(); this.work=new Samples(); this.render=new Samples(); }
  snapshot() { const frame=this.intervals.snapshot();return { fps:frame.mean?1000/frame.mean:null, frameMs:frame, cpuWorkMs:this.work.snapshot(), renderCallMs:this.render.snapshot() }; }
  clear() { this.intervals.clear();this.work.clear();this.render.clear(); }
}
