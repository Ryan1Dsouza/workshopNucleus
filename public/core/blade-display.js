import { clamp } from './orientation.js';

// A short presentation buffer, never a velocity predictor. Collisions continue
// to use the immediate measured pose. Only known endpoints can be displayed.
export class BladeDisplay {
  constructor() {
    this.points = [];
    this.position = { x: .5, y: .5 };
    this.delay = 16;
    this.captureAt = null;
    this.lastTime = -Infinity;
    this.offsets = [];
    this.intervals = [];
    this.offset = 0;
  }
  reset(position = this.position) {
    Object.assign(this.position, position);
    this.points.length = 0;
    this.captureAt = null;
    this.lastTime = -Infinity;
    this.offsets.length = this.intervals.length = 0;
    this.offset = 0; this.delay = 16;
  }
  push(position, captureAt, now, reset = false) {
    if (!Number.isFinite(captureAt) || !Number.isFinite(now)) return;
    // Gyro packets repeating the same attitude must not restart interpolation.
    if (!reset && this.captureAt !== null && captureAt <= this.captureAt) return;
    if (reset || !this.points.length || now - this.points.at(-1).arrivalAt > 100 || captureAt - this.captureAt > 100) {
      this.reset(position);
      this.points.push({ ...position, t: captureAt, arrivalAt: now });
      this.captureAt = captureAt;
      this.offset = now - captureAt;
      this.offsets.push(this.offset);
      return;
    }
    const elapsed = captureAt - this.captureAt;
    this.intervals.push(elapsed);
    this.offsets.push(now - captureAt);
    if (this.intervals.length > 20) this.intervals.shift();
    if (this.offsets.length > 20) this.offsets.shift();
    // Rebase the sensor clock onto the receiver using recent earliest arrivals.
    // The unknown clock offset cancels; this is presentation timing, not a
    // measurement of one-way latency. Arrival jitter no longer retimes each
    // segment independently, causing alternate pauses and bursts of speed.
    const offsets = [...this.offsets].sort((a,b) => a-b);
    const intervals = [...this.intervals].sort((a,b) => a-b);
    this.offset = offsets[0];
    const jitter = offsets[Math.ceil(offsets.length * .9) - 1] - this.offset;
    this.delay = clamp(intervals[Math.floor((intervals.length - 1) / 2)] + jitter, 8, 32);
    this.captureAt = captureAt;
    this.points.push({ ...position, t: captureAt, arrivalAt: now });
    if (this.points.length > 16) this.points.shift();
  }
  sampleAt(now) {
    if (!this.points.length) return this.position;
    const time = Math.max(this.lastTime, now - this.offset - this.delay);
    this.lastTime = time;
    while (this.points.length > 1 && this.points[1].t <= time) this.points.shift();
    const a = this.points[0], b = this.points[1];
    const f = b ? clamp((time - a.t) / (b.t - a.t), 0, 1) : 0;
    this.position.x = a.x + (b ? b.x - a.x : 0) * f;
    this.position.y = a.y + (b ? b.y - a.y : 0) * f;
    return this.position;
  }
}
