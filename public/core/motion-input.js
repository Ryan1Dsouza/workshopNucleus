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
    this.lastSampleAt = 0;
    this.lastSensorTime = null;
    this.lastSample = null;
    this.session = undefined;
    this.epoch = undefined;
    this.centerToken = null;
  }

  olderEpoch(epoch, source) {
    if (!validEpoch(epoch) || !validEpoch(this.epoch)) return false;
    return source === 'bluetooth-native'
      ? ((epoch - this.epoch + 65536) % 65536) > 32768
      : epoch < this.epoch;
  }

  suspend() {
    this.pointer.suspend();
    this.lastSensorTime = null;
    this.display.reset(this.pointer.position);
  }

  resetSession() {
    this.suspend();
    this.pointer.recentre();
    this.display.reset(this.pointer.position);
    this.lastSampleAt = 0;
    this.lastSample = null;
    this.session = this.epoch = undefined;
    this.centerToken = null;
  }

  receive(sample, now) {
    if (!hasPose(sample) || !Number.isFinite(captureTime(sample))) return null;
    const newSession = this.session !== sample.session;
    if ((!newSession || this.session === undefined) && this.olderEpoch(sample.epoch, sample.source)) return null;
    const newEpoch = newSession || this.epoch !== sample.epoch;
    if (!newEpoch && this.lastSensorTime !== null && captureTime(sample) < this.lastSensorTime) return null;
    let reset = newEpoch;
    if (newEpoch) {
      this.pointer.recentre();
      this.lastSensorTime = null;
      this.centerToken = null;
    } else if (!this.pointer.live || now - this.lastSampleAt > 150) {
      this.suspend();
      reset = true;
    }
    const poseTime = captureTime(sample);
    const freshPose = poseTime !== this.lastSensorTime;
    const dt = this.lastSensorTime === null ? 1 / 60 : clamp((poseTime - this.lastSensorTime) / 1000, 1 / 240, 0.05);
    this.session = sample.session;
    this.epoch = sample.epoch;
    if (freshPose) this.lastSensorTime = poseTime;
    this.lastSample = sample;
    this.lastSampleAt = now;
    this.pointer.update(sample, dt, now);
    if (freshPose) this.display.push(this.pointer.position, poseTime, now, this.pointer.pending.reset);
    return { reset, freshPose };
  }

  center(command = {}, now = 0) {
    const epoch = validEpoch(command.epoch) ? command.epoch : undefined;
    const source = command.pose?.source || this.lastSample?.source;
    if (command.session && this.session && command.session !== this.session) this.resetSession();
    if (epoch !== undefined && this.olderEpoch(epoch, source)) return false;
    const token = epoch === undefined ? null : `${command.session || this.session}:${epoch}:${captureTime(command.pose) ?? 'next'}`;
    if (token !== null && token === this.centerToken) return false;

    // A host keyboard recenter can use the last held pose. A phone command
    // with an epoch must use its own anchor, or wait for that epoch's first pose.
    const anchor = hasPose(command.pose) ? command.pose : epoch === undefined ? this.lastSample : null;
    const latest = this.lastSample && (epoch === undefined || this.lastSample.epoch === epoch) ? this.lastSample : null;
    this.pointer.recentre(anchor, now);
    if (latest && anchor && captureTime(latest) > captureTime(anchor)) {
      this.pointer.update(latest, clamp((captureTime(latest) - captureTime(anchor)) / 1000, 1 / 240, 0.05), now);
    }
    // Neither centering nor a late anchor may harvest fruit along the snap.
    this.pointer.pending = { cutting: false, reset: true };
    this.display.reset(this.pointer.position);
    if(hasPose(command.pose)){
      // A newly received captured anchor is fresh input. Seed its measured
      // timestamp so the first subsequent pose interpolates instead of snapping,
      // and the watchdog cannot immediately suspend this new calibration.
      this.lastSampleAt=now;
      this.display.push(this.pointer.position,captureTime(latest||anchor),now,true);
    }
    this.lastSensorTime = latest ? captureTime(latest) : anchor ? captureTime(anchor) : null;
    if (!latest) this.lastSample = null;
    if (command.session) this.session = command.session;
    if (epoch !== undefined) this.epoch = epoch;
    this.centerToken = token;
    return true;
  }
}
