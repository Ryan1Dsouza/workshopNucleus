import { axesFromSample, clamp, cross, dot, length, scale, DEG } from './orientation.js';
import { OneEuroFilter } from './one-euro.js';

const unit = vector => scale(vector, 1 / Math.max(length(vector), 1e-9));
const validPose = s => s && (Array.isArray(s.quat) && s.quat.length === 4 && s.quat.every(Number.isFinite)
  && Math.hypot(...s.quat) > 0.1 || [s.alpha, s.beta, s.gamma].every(Number.isFinite));

// Position is a direct function of the measured pose relative to Center blade.
// Drawing another frame cannot integrate a rate, predict a swing or heal drift.
export class PosePointer {
  constructor({ sensitivity = 1, degPerScreen = 60, aspect = 0.6, noiseDegrees = 0.04, smoothing = false } = {}) {
    this.sensitivity = sensitivity; this.degPerScreen = degPerScreen; this.aspect = aspect;
    this.noiseDegrees = noiseDegrees; this.invertX = this.invertY = false;
    this.pos = { x: 0.5, y: 0.5 }; this.rateDps = { yaw: 0, pitch: 0 };
    this.live = false; this.lastSeen = 0; this.source = 'waiting'; this.mode = 'direct-pose';
    this.hasGyro = false; this.gyroTrusted = false; this.displayLead = false;
    this.w = this.h = 1; this.reference = null; this.beam = null;
    this.yaw = this.pitch = 0; this.pending = { cutting: false, reset: true };
    this.poseStreak = 0; this.lastDirection = null; this.lastChangeAt = -Infinity;
    this.smoothing=smoothing;this.filterYaw=new OneEuroFilter();this.filterPitch=new OneEuroFilter();
    this.rawPosition={...this.pos};this.lastPoseTime=null;
  }
  get display() { return this.pos; }
  get position() { return this.pos; }
  get pixels() { return { x: this.pos.x * this.w, y: this.pos.y * this.h }; }
  setViewport(w, h) { this.w = Math.max(1, w); this.h = Math.max(1, h); }
  describeMap() { return 'calibrated angle · no prediction'; }
  setSmoothing(value) { this.smoothing=!!value;Object.assign(this.pos,this.rawPosition);this.filterYaw.reset();this.filterPitch.reset();this.pending={cutting:false,reset:true}; }
  project(yaw,pitch,time,reset=false) {
    const position=(a,b)=>({x:clamp(.5+a*this.sensitivity*(this.invertX?-1:1)/this.degPerScreen,0,1),y:clamp(.5-b*this.sensitivity*(this.invertY?-1:1)/(this.degPerScreen*this.aspect),0,1)});
    this.rawPosition=position(yaw,pitch);
    if(reset){this.filterYaw.reset(yaw,time);this.filterPitch.reset(pitch,time);}
    const a=this.smoothing?this.filterYaw.filter(yaw,time):yaw,b=this.smoothing?this.filterPitch.filter(pitch,time):pitch;
    Object.assign(this.pos,position(a,b));
  }
  suspend() {
    // Missing events mean no new movement, not a new pointing reference.
    // Break the stroke on resume without hiding or moving the held aim.
    this.live = false; this.rateDps = { yaw: 0, pitch: 0 };
    this.pending = { cutting: false, reset: true };
    this.poseStreak = 0; this.lastDirection = null; this.lastChangeAt = -Infinity;
  }
  recentre(sample = null, now = 0) {
    this.reference = null; this.beam = null; this.yaw = this.pitch = 0;
    this.pos.x = this.pos.y = 0.5; this.rateDps = { yaw: 0, pitch: 0 };
    this.pending = { cutting: false, reset: true };
    this.poseStreak = 0; this.lastDirection = null; this.lastChangeAt = -Infinity;
    this.filterYaw.reset();this.filterPitch.reset();this.rawPosition={...this.pos};this.lastPoseTime=null;
    this.live = false;
    if (validPose(sample)) this.update(sample, 1 / 60, now);
  }
  setFromMouse(x, y) { this.pos.x = clamp(x, 0, 1); this.pos.y = clamp(y, 0, 1); }
  update(sample, dt, now = 0) {
    if (!validPose(sample)) return false;
    const axes = axesFromSample(sample);
    this.live = true; this.lastSeen = now; this.source = sample.source || (sample.quat ? 'quaternion' : 'orientation');
    this.hasGyro = !!sample.motion;
    const poseTime=Number.isFinite(sample.poseT)?sample.poseT/1000:now/1000;
    const newPose=poseTime!==this.lastPoseTime;this.lastPoseTime=poseTime;
    if (!this.reference) {
      // Choose the pointing axis once, in the grip used while centering.
      // Keeping it fixed prevents sideways/upright grip changes from flipping
      // the axes mid-sweep. Roll about this beam does not change the aim.
      this.beam = Math.abs(axes.y.z) <= Math.abs(axes.z.z) ? 'top' : 'back';
      const forward = unit(this.beam === 'top' ? axes.y : scale(axes.z, -1));
      const right = unit(cross(forward, { x: 0, y: 0, z: 1 }));
      this.reference = { forward, right, up: unit(cross(right, forward)) };
      this.project(0,0,poseTime,true);this.pending = { cutting: false, reset: true }; return true;
    }
    const beam = this.beam === 'top' ? axes.y : scale(axes.z, -1), ref = this.reference;
    const x = dot(beam, ref.right), y = dot(beam, ref.up), z = dot(beam, ref.forward);
    const yaw = Math.atan2(x, z) / DEG;
    const pitch = Math.atan2(y, Math.hypot(x, z)) / DEG;
    const dYaw = yaw - this.yaw, dPitch = pitch - this.pitch;
    const delta = Math.hypot(dYaw, dPitch);
    // A sub-pixel stationary deadband, not a velocity-controlled cursor.
    // Slow movement still accumulates against the last accepted angle.
    if (delta < this.noiseDegrees) {
      this.rateDps = { yaw: 0, pitch: 0 };
      // Filter settling is aiming only; it cannot arm a new collision stroke.
      if(this.smoothing && newPose && !this.pending.cutting)this.project(this.yaw,this.pitch,poseTime);
      return true;
    }
    const seconds = Number.isFinite(dt) && dt > 0 ? dt : 1 / 60;
    const angularSpeed = delta / seconds;
    const rates = sample.motion;
    const gyroFresh = !Number.isFinite(sample.motionAge) || sample.motionAge < 80;
    // Quiet gyro + moving orientation usually means a compass correction.
    // It can update aiming, but cannot be mistaken for a physical slice.
    const direction = { x: dYaw / delta, y: dPitch / delta };
    const coherent = this.lastDirection && now - this.lastChangeAt < 100
      && direction.x * this.lastDirection.x + direction.y * this.lastDirection.y > 0.7;
    this.poseStreak = coherent ? this.poseStreak + 1 : 1;
    this.lastDirection = direction; this.lastChangeAt = now;
    const physical = rates ? gyroFresh && Math.hypot(rates.rx || 0, rates.ry || 0, rates.rz || 0) > 1
      : this.poseStreak >= 2 && angularSpeed < 300 && delta < 8;
    const discontinuity = angularSpeed > 1000 || delta > 25;
    this.yaw = yaw; this.pitch = pitch;
    this.rateDps = { yaw: dYaw / seconds, pitch: dPitch / seconds };
    this.project(yaw,pitch,poseTime,discontinuity || this.pending.reset);
    this.pending = { cutting: physical && !discontinuity && !this.pending.reset, reset: discontinuity || this.pending.reset };
    return true;
  }
  sampleAt() { return this.pos; }
  consumeMovement() { const movement = this.pending; this.pending = { cutting: false, reset: false }; return movement; }
}
