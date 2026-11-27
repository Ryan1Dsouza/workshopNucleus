/**
 * Orientation decoding — phone attitude → world-space body axes.
 *
 * Everything downstream works in body axes rather than Euler angles. The phone
 * reports `alpha`/`beta`/`gamma` (a ZXY Euler triple) or, on the Generic Sensor
 * path, a quaternion. Both reduce to the same three axes, and reasoning about
 * axes sidesteps the gimbal traps that Euler angles set for you.
 */

export const DEG = Math.PI / 180;
export const TAU = Math.PI * 2;

// Bank only: lifting, yawing or moving the whole wheel doesn't command a turn.
// Ease out of the neutral zone, joining the normal steering curve at 9 degrees.
export const KART_NEUTRAL_DEGREES = 4.5;
export function kartWheelSteer(bank, fullLock = 38) {
  const degrees = Math.abs(bank);
  if (degrees <= KART_NEUTRAL_DEGREES) return 0;
  const t = Math.min(1,(degrees-KART_NEUTRAL_DEGREES)/(9-KART_NEUTRAL_DEGREES));
  const gain = t*t*(3-2*t);
  return Math.sign(bank)*gain*Math.min(1,(degrees-2.5)/(fullLock-2.5));
}

// Velocity of the pointing beam in its calibrated yaw/pitch coordinates.
// Browser rotationRate is in device axes. Native BLE v1 carries only speed;
// its gravity-referenced quaternion supplies the measured sweep direction.
export function sweepRates(sample, axes, beam, reference, dx, dy) {
  const rate = sample.motion;
  if (!rate || sample.motionAge >= 80) return null;
  if (sample.source === 'bluetooth-native') {
    const distance = Math.hypot(dx, dy);
    return distance ? [rate.rx * dx / distance, rate.rx * dy / distance] : null;
  }
  const omega = {};
  for (const k of ['x','y','z']) omega[k] = axes.x[k]*rate.rx + axes.y[k]*rate.ry + axes.z[k]*rate.rz;
  const velocity = cross(omega, beam);
  const x = dot(beam, reference.right), z = dot(beam, reference.forward);
  const horizontal = Math.max(.1, Math.hypot(x,z));
  return [(z*dot(velocity,reference.right)-x*dot(velocity,reference.forward))/(horizontal*horizontal),
    dot(velocity,reference.up)/horizontal];
}

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

// ── Vector helpers ─────────────────────────────────────────────────────────
export const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
export const scale = (a, k) => ({ x: a.x * k, y: a.y * k, z: a.z * k });
export const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
export const length = (a) => Math.hypot(a.x, a.y, a.z);
export const cross = (a, b) => ({
  x: a.y * b.z - a.z * b.y,
  y: a.z * b.x - a.x * b.z,
  z: a.x * b.y - a.y * b.x,
});

/**
 * The phone's three body axes expressed in world coordinates.
 *
 * Rows of the W3C ZXY rotation matrix R = Rz(alpha)·Rx(beta)·Ry(gamma) give the
 * world axes; its *columns* give the device axes, which is what we want — we
 * care about where the phone is pointing, not where north is.
 *
 *   x → right edge      y → top edge      z → out of the screen
 */
export function bodyAxes(alpha, beta, gamma) {
  const z = alpha * DEG;
  const x = beta * DEG;
  const y = gamma * DEG;
  const cZ = Math.cos(z);
  const sZ = Math.sin(z);
  const cX = Math.cos(x);
  const sX = Math.sin(x);
  const cY = Math.cos(y);
  const sY = Math.sin(y);
  return {
    x: { x: cZ * cY - sZ * sX * sY, y: sZ * cY + cZ * sX * sY, z: -cX * sY },
    y: { x: -sZ * cX, y: cZ * cX, z: sX },
    z: { x: cZ * sY + sZ * sX * cY, y: sZ * sY - cZ * sX * cY, z: cX * cY },
  };
}

/**
 * The same three axes, straight from a quaternion.
 *
 * `AbsoluteOrientationSensor` reports device→world rotation using the same ENU
 * convention as the Euler triple, so the columns mean exactly what they do
 * above — and we skip Euler decoding entirely, which is strictly better
 * numerically. Verified to agree with bodyAxes() to 4.4e-16.
 */
export function bodyAxesFromQuat(q) {
  const [x, y, z, w] = q;
  return {
    x: { x: 1 - 2 * (y * y + z * z), y: 2 * (x * y + z * w), z: 2 * (x * z - y * w) },
    y: { x: 2 * (x * y - z * w), y: 1 - 2 * (x * x + z * z), z: 2 * (y * z + x * w) },
    z: { x: 2 * (x * z + y * w), y: 2 * (y * z - x * w), z: 1 - 2 * (x * x + y * y) },
  };
}

/** Accept either representation a controller might be streaming. */
export function axesFromSample(sample) {
  return sample.quat
    ? bodyAxesFromQuat(sample.quat)
    : bodyAxes(sample.alpha || 0, sample.beta || 0, sample.gamma || 0);
}

/** Shortest signed difference a−b, wrapped to (−180, 180]. */
export function angleDelta(a, b) {
  let d = a - b;
  while (d > 180) d -= 360;
  while (d <= -180) d += 360;
  return d;
}

/**
 * Tilt of the phone relative to the horizon, in degrees — the input for
 * steering-wheel and flight-stick style controls.
 *
 *   bank  — roll about the pointing direction. Positive = right edge dipped
 *           below the horizon = steer/bank right. (Numerically pinned in
 *           tests: for a flat grip this equals the W3C gamma angle.)
 *   pitch — elevation of the beam. Positive = pointing above the horizon.
 *
 * Uses the same most-horizontal beam selection as the pointer, so it works in
 * flat, upright and landscape grips without calibration.
 */
export function gripTilt(axes) {
  const beamY = axes.y;
  const beamZ = scale(axes.z, -1);
  const fwd = Math.abs(beamY.z) <= Math.abs(beamZ.z) ? beamY : beamZ;
  return {
    bank: -Math.asin(clamp(axes.x.z, -1, 1)) / DEG,
    pitch: Math.asin(clamp(fwd.z, -1, 1)) / DEG,
  };
}
