import { RateWindow } from '../core/diagnostics.js';
const DEG = Math.PI / 180;
const finite = Number.isFinite;
const multiply = (a, b) => [
  a[3]*b[0]+a[0]*b[3]+a[1]*b[2]-a[2]*b[1],
  a[3]*b[1]-a[0]*b[2]+a[1]*b[3]+a[2]*b[0],
  a[3]*b[2]+a[0]*b[1]-a[1]*b[0]+a[2]*b[3],
  a[3]*b[3]-a[0]*b[0]-a[1]*b[1]-a[2]*b[2],
];
function eulerQuat(alpha, beta, gamma) {
  const axis = (i, angle) => { const q = [0,0,0,Math.cos(angle*DEG/2)]; q[i] = Math.sin(angle*DEG/2); return q; };
  return multiply(multiply(axis(2,alpha),axis(0,beta)),axis(1,gamma));
}
function gravityQuat(g) {
  if (!g || ![g.x,g.y,g.z].every(finite) || Math.hypot(g.x,g.y,g.z) < 5) return [0,0,0,1];
  const n = Math.hypot(g.x,g.y,g.z), x=g.y/n, y=-g.x/n, w=1+g.z/n;
  const length = Math.hypot(x,y,w);
  return length > 1e-5 ? [x/length,y/length,0,w/length] : [1,0,0,0];
}

// Keep raw attitude and raw body rates for direct aiming and physical-motion
// checks; no phone-side pointer smoothing or swipe generation is involved.
export class SensorStream {
  constructor() { this.reset(); this.epoch = 0; this.sequence = 0; }
  reset() { this.pose = null; this.q = null; this.rates = null; this.orientationKind = null; this.lastOrientation = -Infinity; this.lastReading = -Infinity; this.lastMotion = null; this.poseAt = null; this.orientationGraceUntil = 0; this.mode = 'waiting'; this.orientationRate=new RateWindow();this.motionRate=new RateWindow(); }
  suspend() { this.reset(); this.epoch++; }
  recenter(now) {
    this.epoch++;
    return { epoch: this.epoch, pose: Number.isFinite(now) ? this.sample(now) : null };
  }
  orient(event, now) {
    if (![event.alpha,event.beta,event.gamma].every(finite)) return false;
    const kind = event.type || 'deviceorientation';
    // Android may emit relative and compass-referenced attitudes together.
    // Their headings differ: interleaving them makes a stationary blade jump.
    // Keep one frame until it goes stale; a fallback switch must re-center.
    if (this.orientationKind && this.orientationKind !== kind) {
      if (now-this.lastOrientation < 300) return false;
      this.epoch++;
    }
    this.orientationKind = kind;
    this.orientationRate.add(now);this.poseAt=now;
    if (this.mode === 'gyro-only') this.epoch++;
    this.pose = { alpha:event.alpha,beta:event.beta,gamma:event.gamma };
    this.q = eulerQuat(event.alpha,event.beta,event.gamma);
    this.lastOrientation = this.lastReading = now; this.orientationGraceUntil = 0; this.mode = 'orientation'; return true;
  }
  quaternion(q, now) {
    if (!Array.isArray(q) || q.length !== 4 || !q.every(finite) || Math.hypot(...q) < 0.1) return false;
    if (this.orientationKind && this.orientationKind !== 'quaternion') {
      if (now-this.lastOrientation < 300) return false;
      this.epoch++;
    }
    this.orientationKind = 'quaternion';
    this.orientationRate.add(now);this.poseAt=now;
    const n = Math.hypot(...q); this.q = q.map(x=>x/n); this.pose = { quat:this.q };
    this.lastOrientation = this.lastReading = now; this.orientationGraceUntil = 0; this.mode = 'quaternion'; return true;
  }
  motion(event, now) {
    const rate = event.rotationRate;
    if (!rate || ![rate.beta,rate.gamma,rate.alpha].some(finite)) return false;
    const r = [rate.beta,rate.gamma,rate.alpha].map(v=>finite(v)?v:0);
    this.motionRate.add(now);
    this.rates = { rx:r[0],ry:r[1],rz:r[2] };
    const resumed = this.lastMotion === null || now-this.lastMotion > 150;
    const dt = this.lastMotion === null ? 0 : Math.max(0, Math.min(0.05,(now-this.lastMotion)/1000));
    this.lastMotion = now;
    if (now-this.lastOrientation < 180) { this.lastReading = now; return true; }
    // After a quiet gap, motion often arrives just before orientation. Don't
    // switch sources/epochs on that first event and lose the centered grip.
    // Continuous gyro events still get a fallback if attitude never returns.
    if (this.orientationKind && this.mode !== 'gyro-only') {
      if (resumed) this.orientationGraceUntil = now+180;
      if (now < this.orientationGraceUntil) return false;
    }
    if (this.mode !== 'gyro-only') { this.epoch++; this.q = this.q || gravityQuat(event.accelerationIncludingGravity); }
    const speed = Math.hypot(...r)*DEG;
    if (speed > 0 && dt > 0) {
      const k = Math.sin(speed*dt/2)/(speed/DEG);
      this.q = multiply(this.q,[r[0]*k,r[1]*k,r[2]*k,Math.cos(speed*dt/2)]);
      const n = Math.hypot(...this.q); this.q = this.q.map(v=>v/n);
    }
    this.pose = { quat:this.q }; this.mode = 'gyro-only'; this.lastReading = this.poseAt = now; return true;
  }
  sample(now) {
    if (!this.pose || now-this.lastReading > 150) return null;
    return { ...this.pose, motion:this.rates, motionAge:this.lastMotion === null ? null : now-this.lastMotion,
      t:now, poseT:this.poseAt, epoch:this.epoch, sequence:++this.sequence, source:this.mode,
      sensorStats:this.diagnostics(now) };
  }
  diagnostics(now) { return { orientationHz:this.orientationRate.hz(now), gyroHz:this.motionRate.hz(now), source:this.mode }; }
}
