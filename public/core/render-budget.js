// Lower GPU pixel work after sustained slow frames. Never compensate for a
// hidden tab or a single loading hitch; resolution changes are infrequent.
export class RenderBudget {
  constructor() { this.scale = 1; this.reset(); this.slowWindows = 0; }
  reset() { this.elapsed = 0; this.frames = 0; }
  observe(interval, active = true) {
    if (!active || !Number.isFinite(interval) || interval <= 0 || interval > 250) { this.reset(); this.slowWindows = 0; return false; }
    this.elapsed += interval; this.frames++;
    if (this.elapsed < 1000) return false;
    const mean = this.elapsed / this.frames;
    this.reset();
    this.slowWindows = mean > 22 ? this.slowWindows + 1 : 0;
    if (this.slowWindows < 2 || this.scale <= .5) return false;
    this.scale = this.scale > .75 ? 2/3 : .5;
    this.slowWindows = 0;
    return true;
  }
}
