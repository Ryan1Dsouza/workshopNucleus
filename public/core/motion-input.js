import { PosePointer } from './pose-pointer.js';
import { BladeDisplay } from './blade-display.js';
import { clamp } from './orientation.js';

export const hasPose = sample => !!sample && (
  Array.isArray(sample.quat) && sample.quat.length === 4 && sample.quat.every(Number.isFinite)
    && Math.hypot(...sample.quat) > 0.1
  || [sample.alpha, sample.beta, sample.gamma].every(Number.isFinite)
);
const captureTime = sample => Number.isFinite(sample?.poseT) ? sample.poseT : sample?.t;
const validEpoch = epoch => Number.isSafeInteger(epoch) && epoch >= 0;

// Calibration commands and motion use different channels. Their arrival order
// must never choose the grip or let an old packet undo the Center blade action.
export class MotionInput {
  constructor(options = {}) {
    this.pointer = new PosePointer(options);
    this.display = new BladeDisplay();
    this.wheelDisplay = new BladeDisplay(36);
    this.timeout = 150;
    this.collectPath = !!options.collectPath;
    this.path = [];
    this.clockOffset = null;
    this.lastSampleAt = 0;
    this.lastSensorTime = null;
    this.lastSample = null;
    this.session = undefined;
    this.epoch = undefined;
    this.centerToken = null;
    this.anchor = null;
  }

  olderEpoch(epoch, source) {
    if (!validEpoch(epoch) || !validEpoch(this.epoch)) return false;
    return source === 'bluetooth-native'
      ? ((epoch - this.epoch + 65536) % 65536) >= 32768
      : epoch < this.epoch;
  }

  suspend() {
    this.pointer.suspend();
    this.path.length = 0;
    this.display.reset(this.pointer.display);
    this.wheelDisplay.reset({x:0,y:0});
  }

  resetSession() {
    this.suspend();
    this.pointer.recentre();
    this.display.reset(this.pointer.display);
    this.lastSampleAt = 0;
    this.lastSample = null;
    this.clockOffset = this.offsetUpdatedAt = this.lastSensorTime = null;
    this.session = this.epoch = undefined;
    this.anchor = null;
    this.centerToken = null;
  }

  receive(sample, now) {
    if (!hasPose(sample) || !Number.isFinite(captureTime(sample))) return null;
    const newSession = this.session !== sample.session;
    if ((!newSession || this.session === undefined) && this.olderEpoch(sample.epoch, sample.source)) return null;
    const newEpoch = newSession || this.epoch !== sample.epoch;
    const poseTime = captureTime(sample);
    if (!newEpoch && this.lastSensorTime !== null && poseTime <= this.lastSensorTime) return null;
    if (newSession) this.clockOffset = null;
    let measuredAt = now;
    if (sample.source === 'bluetooth-native') {
      // Earliest transit supplies an offset between two boot clocks. Let it
      // follow slow oscillator drift without treating a queued burst as fresh.
      const offset = now - poseTime;
      const elapsed = Math.max(0, now - (this.offsetUpdatedAt ?? now));
      this.offsetUpdatedAt = now;
      this.clockOffset = this.clockOffset === null ? offset : Math.min(offset, this.clockOffset + elapsed * .0002);
      measuredAt = poseTime + this.clockOffset;
      if (now - measuredAt > this.timeout) return null;
    }
    let reset = newEpoch;
    if (newEpoch) {
      this.path.length = 0;
      this.pointer.recentre();
      this.lastSensorTime = null;
      this.anchor = sample;
      this.centerToken = null;
    } else if (!this.pointer.live || measuredAt - this.lastSampleAt > this.timeout || poseTime - this.lastSensorTime > this.timeout) {
      this.suspend();
      reset = true;
    }
    const dt = reset || this.lastSensorTime === null ? 1 / 60 : Math.max((poseTime - this.lastSensorTime) / 1000, 1 / 240);
    if (!this.anchor) this.anchor = sample;
    if (this.collectPath && this.path.length) this.pointer.consumeMovement();
    this.session = sample.session;
    this.epoch = sample.epoch;
    this.lastSensorTime = poseTime;
    this.lastSample = sample;
    this.lastSampleAt = measuredAt;
    this.pointer.update(sample, dt, measuredAt);
    // Draw the filtered aim while retaining every measured endpoint for slicing.
    this.display.push(this.pointer.display, poseTime, now, this.pointer.pending.reset);
    if (this.collectPath) {
      // A stalled display cannot accumulate an unbounded or disconnected stroke.
      if (this.path.length >= 32) { this.path.length = 0; this.pointer.pending = {reset:true,cutting:false}; }
      this.path.push({...this.pointer.position, ...this.pointer.pending, poseTime, measuredAt});
    }
    return { reset, newEpoch, freshPose:true };
  }

  center(command = {}, now = 0) {
    const epoch = validEpoch(command.epoch) ? command.epoch : undefined;
    const source = command.source || command.pose?.source || this.lastSample?.source;
    if (command.session && this.session && command.session !== this.session) this.resetSession();
    if (epoch !== undefined && this.olderEpoch(epoch, source)) return false;
    const token = epoch === undefined ? null : `${command.session || this.session}:${epoch}:${captureTime(command.pose) ?? 'next'}`;
    if (token !== null && token === this.centerToken) return false;

    // A host keyboard recenter can use the last held pose. A phone command
    // with an epoch must use its own anchor, or wait for that epoch's first pose.
    const useLast = epoch === undefined && (!command.freshGrip || now - this.lastSampleAt <= 150);
    const epochAnchor = epoch !== undefined && epoch === this.epoch ? this.anchor : null;
    const anchor = hasPose(command.pose) ? command.pose : useLast ? this.lastSample : epochAnchor;
    const latest = this.lastSample && (epoch === undefined ? anchor : this.lastSample.epoch === epoch) ? this.lastSample : null;
    this.path.length = 0;
    this.pointer.recentre(anchor, now);
    const newer = latest && (!anchor || captureTime(latest) > captureTime(anchor)) ? latest : anchor;
    if (newer && newer !== anchor) {
      this.pointer.update(newer, anchor ? clamp((captureTime(newer) - captureTime(anchor)) / 1000, 1 / 240, 0.05) : 1/60, now);
    }
    // Neither centering nor a late anchor may harvest fruit along the snap.
    this.pointer.pending = { cutting: false, reset: true };
    this.display.reset(this.pointer.display);
    if (hasPose(command.pose)) {
      // A newly received captured anchor is fresh input. Seed its measured
      // timestamp so the first subsequent pose interpolates instead of snapping,
      // and the watchdog cannot immediately suspend this new calibration.
      const nativeOffset = source === 'bluetooth-native' ? this.clockOffset : null;
      this.lastSampleAt = nativeOffset === null ? now : Math.min(now, captureTime(newer) + nativeOffset);
      this.display.push(this.pointer.display,captureTime(newer),now,true);
      if (now - this.lastSampleAt > this.timeout) this.suspend();
    }
    if (newer) this.lastSensorTime = captureTime(newer);
    else if (epoch !== undefined && epoch !== this.epoch) this.lastSensorTime = null;
    this.lastSample = newer;
    this.anchor = anchor || newer;
    if (command.session) this.session = command.session;
    if (epoch !== undefined) this.epoch = epoch;
    this.centerToken = token;
    return true;
  }
}
