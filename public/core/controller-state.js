import { BUTTON_MASK, BUTTON_BITS, buttonState, validateProfile } from './controller-contract.js';

const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
function inverse(q) { return [-q[0], -q[1], -q[2], q[3]]; }
function multiply(a, b) {
  const [x, y, z, w] = a, [X, Y, Z, W] = b;
  return [w*X+x*W+y*Z-z*Y, w*Y-x*Z+y*W+z*X, w*Z+x*Y-y*X+z*W, w*W-x*X-y*Y-z*Z];
}
function actionsFor(profile, mask) {
  const actions={};for(const control of profile?.controls || [])actions[control.action]=!!actions[control.action]||!!(mask & BUTTON_BITS[control.id]);
  return actions;
}

export class ControllerState {
  constructor({ createMotion } = {}) {
    this.profileEpoch = 0; this.profile = null;
    this.players = [0, 1].map(slot => ({ slot, connected: false, name: '', session: '', ready: false,
      motion: createMotion?.() || null, mask: 0, pressed: 0, released: 0, buttonSequence: null,
      actionPressed:new Set(),actionReleased:new Set(),buttonsAt: 0, reference: null, latestQuat: null, steer: 0 }));
  }
  player(slot) { if (![0, 1].includes(slot)) throw new Error('Invalid player slot.'); return this.players[slot]; }
  connect(slot, session, name) {
    const player = this.player(slot);
    if (player.session !== session) { player.motion?.resetSession(); player.reference = player.latestQuat = null; player.buttonSequence = null; }
    Object.assign(player, { connected: true, session, name, ready: false }); this.release(slot);
  }
  disconnect(slot) {
    const player = this.player(slot); this.release(slot);
    Object.assign(player, { connected: false, ready: false, session: '', reference: null, latestQuat: null, steer: 0, buttonSequence: null });
    player.motion?.resetSession();
  }
  setProfile(profile) {
    this.profile = validateProfile(profile); this.profileEpoch = (this.profileEpoch + 1) & 65535;
    for (const player of this.players) {
      this.release(player.slot); player.ready = false; player.buttonSequence = null;
      player.actionPressed.clear();player.actionReleased.clear();
      player.reference = player.latestQuat?.slice() || null; player.steer = 0;
      player.motion?.center({}, performance.now());
    }
    return this.profileEpoch;
  }
  markReady(slot, epoch) { const player = this.player(slot); if (epoch === this.profileEpoch && player.connected) player.ready = true; }
  release(slot, {suspendMotion = true} = {}) {
    const player = this.player(slot);for(const [action,held]of Object.entries(actionsFor(this.profile,player.mask)))if(held)player.actionReleased.add(action);
    player.actionPressed.clear();player.released |= player.mask; player.mask = player.pressed = 0;
    if(suspendMotion)player.motion?.suspend();
  }
  buttons(slot, frame, session, now = performance.now()) {
    const player = this.player(slot);
    if (!player.connected || !player.ready || session !== player.session || !frame || frame.profileEpoch !== this.profileEpoch
      || !Number.isInteger(frame.mask) || frame.mask & ~BUTTON_MASK || !Number.isInteger(frame.sequence) || frame.sequence < 0 || frame.sequence > 65535) return false;
    if (player.buttonSequence !== null) {
      const delta = (frame.sequence - player.buttonSequence + 65536) % 65536;
      if (!delta || delta > 32768) return false;
    }
    const before=actionsFor(this.profile,player.mask),after=actionsFor(this.profile,frame.mask);
    for(const action of Object.keys(after)){if(after[action]&&!before[action])player.actionPressed.add(action);if(before[action]&&!after[action])player.actionReleased.add(action);}
    player.pressed |= frame.mask & ~player.mask; player.released |= player.mask & ~frame.mask;
    player.mask = frame.mask; player.buttonSequence = frame.sequence; player.buttonsAt = now;
    return true;
  }
  motion(slot, frame, now = performance.now()) {
    const player = this.player(slot);
    if (!player.connected || !player.motion || frame.session !== player.session) return false;
    const change = player.motion.receive(frame, now); if (!change) return false;
    if (Array.isArray(frame.quat)) {
      player.latestQuat = frame.quat.slice();
      if (change.reset && !player.reference) player.reference = frame.quat.slice();
      this.steering(player);
    }
    return true;
  }
  center(slot, command, now = performance.now()) {
    const player = this.player(slot);
    if (!player.motion || command.session && command.session !== player.session) return false;
    if (!player.motion.center(command, now)) return false;
    const anchor = command.pose?.quat || player.latestQuat;
    if (anchor) player.reference = anchor.slice();
    player.latestQuat = player.motion.lastSample?.quat?.slice() || anchor?.slice() || null;
    this.steering(player); return true;
  }
  steering(player) {
    if (!player.latestQuat || !player.reference) { player.steer = 0; return; }
    const [x, y, z, w] = multiply(inverse(player.reference), player.latestQuat);
    const angle = Math.atan2(2*(w*z+x*y), 1-2*(y*y+z*z));
    const steer = clamp(angle / (Math.PI / 4), -1, 1);
    player.steer = Math.abs(steer) < .025 ? 0 : steer;
  }
  sample(slot, now = performance.now()) {
    const player = this.player(slot);
    // A lost button heartbeat releases held buttons, not a fresh gyro stream.
    if (player.mask && now - player.buttonsAt > 1250) this.release(slot,{suspendMotion:false});
    if (player.motion?.pointer.live && now - player.motion.lastSampleAt > 150) player.motion.suspend();
    const movement = player.motion?.pointer.consumeMovement() || { cutting: false, reset: true };
    const position = player.motion?.pointer.position || { x: .5, y: .5 };
    // Presentation uses capture-timed interpolation; actions and collision keep
    // the immediate measured position and one-shot movement flags.
    const display = player.motion?.display?.sampleAt(now) || position;
    const result = { slot, connected: player.connected, ready: player.ready, session: player.session,
      name: player.name, profileEpoch: this.profileEpoch, buttons: buttonState(player.mask),
      pressed: buttonState(player.pressed), released: buttonState(player.released),
      actions:actionsFor(this.profile,player.mask),pressedActions:Object.fromEntries([...player.actionPressed].map(action=>[action,true])),releasedActions:Object.fromEntries([...player.actionReleased].map(action=>[action,true])),
      axes: { x: position.x, y: position.y, steer: player.motion?.pointer.live ? player.steer : 0 },
      displayAxes: { x: display.x, y: display.y },
      motionLive: !!player.motion?.pointer.live, cutting: !!movement.cutting && player.ready, reset: !!movement.reset };
    player.pressed = player.released = 0;player.actionPressed.clear();player.actionReleased.clear();return result;
  }
}
