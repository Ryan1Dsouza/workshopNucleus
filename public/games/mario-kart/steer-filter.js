import { kartWheelSteer } from '../../core/orientation.js';

const DEG = Math.PI / 180;
const clamp1 = v => Math.max(-1,Math.min(1,v));
export { KART_NEUTRAL_DEGREES as STEER_DEADZONE } from '../../core/orientation.js';

export const STEER_FULL = 18;
export const BIAS_HEAL_BAND = 4.5;
export const BIAS_HEAL_TAU_S = 6;
export const BIAS_SETTLE_S = 2;
export const BIAS_SETTLE_TAU_S = 0.6;

export function captureTray(axes, prevRight = null) {
  const vx = -axes.z.x;
  const vy = -axes.z.y;
  const m = Math.hypot(vx, vy);
  let right = prevRight || { x: 1, y: 0 };
  if (m > 0.05) right = { x: vy / m, y: -vx / m };

  const sy = axes.y.x * right.x + axes.y.y * right.y >= 0 ? 1 : -1;
  const ref = { right, sy, bank0: 0 };
  ref.bank0 = trayRead(axes, ref).bank;
  return ref;
}

export function trayRead(axes, ref) {
  const rightEndZ = ref.sy * axes.y.z;
  return { bank: -Math.asin(clamp1(rightEndZ)) / DEG - ref.bank0 };
}

export function shapeSteer(bankDeg) {
  return kartWheelSteer(bankDeg, STEER_FULL) * STEER_FULL;
}

export class SteerFilter {
  constructor() {
    this.bias = 0;
    this.ageS = 0;
  }

  update(rawBank, dt) {
    this.ageS += dt;
    const corrected = rawBank - this.bias;
    if (Math.abs(corrected) < BIAS_HEAL_BAND) {
      const tau = this.ageS < BIAS_SETTLE_S ? BIAS_SETTLE_TAU_S : BIAS_HEAL_TAU_S;
      this.bias += Math.min(1, dt / tau) * (rawBank - this.bias);
    }
    return shapeSteer(corrected);
  }
}
