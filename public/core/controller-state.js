import { BUTTON_MASK, BUTTON_BITS, buttonState, validateProfile } from './controller-contract.js';
import { bodyAxesFromQuat, DEG, kartWheelSteer } from './orientation.js';
import { OneEuroFilter } from './one-euro.js';

const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const elevation = axis => Math.asin(clamp(axis.z,-1,1)) / DEG;
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
  constructor({ createMotion, slots = 2 } = {}) {
    this.profileEpoch = 0; this.profile = null;
    this.players = Array.from({length:slots}, (_,slot) => ({ slot, connected: false, name: '', session: '', ready: false,
      motion: createMotion?.() || null, mask: 0, pressed: 0, released: 0, buttonSequence: null,
      actionPressed:new Set(),actionReleased:new Set(),buttonsAt: 0, reference: null, latestQuat: null, steer: 0,
      landscapeSign: 1, steerFilter: new OneEuroFilter({ minCutoff: 4.5, beta: 0.35, derivativeCutoff: 1 }) }));
  }
  player(slot) { if (!Number.isInteger(slot) || !this.players[slot]) throw new Error('Invalid player slot.'); return this.players[slot]; }
  connect(slot, session, name) {
    const player = this.player(slot);
    if (player.session !== session) { player.motion?.resetSession(); player.reference = player.latestQuat = null; player.buttonSequence = null; player.rotation = null; player.levelReference = false; player.landscapeSign = 1; player.steerFilter.reset(); }
    Object.assign(player, { connected: true, session, name, ready: false }); this.release(slot);
  }
  disconnect(slot) {
    const player = this.player(slot); this.release(slot);
    Object.assign(player, { connected: false, ready: false, session: '', reference: null, latestQuat: null, steer: 0, buttonSequence: null, landscapeSign: 1 });
    player.steerFilter.reset();
    player.motion?.resetSession();
  }
  setProfile(profile, overrides = []) {
    this.profile = validateProfile(profile); this.profileEpoch = (this.profileEpoch + 1) & 65535;
    for (const player of this.players) {
      this.release(player.slot);
      player.profile = overrides[player.slot] ? validateProfile(overrides[player.slot]) : this.profile;
      player.ready = false; player.buttonSequence = null;
      player.actionPressed.clear();player.actionReleased.clear();
      player.reference = player.latestQuat?.slice() || null; player.steer = 0;
      player.levelReference = false; player.rotation = null; player.landscapeSign = 1; player.steerFilter.reset();
      if (player.motion) {
        player.motion.timeout = player.profile.motion === 'steer' ? 450 : 150;
        player.motion.collectPath = player.profile.motion === 'aim';
        player.motion.pointer.smoothDisplay = player.profile.id === 'fruit-ninja';
      }
      player.motion?.center({}, performance.now());
    }
    return this.profileEpoch;
  }
  markReady(slot, epoch) { const player = this.player(slot); if (epoch === this.profileEpoch && player.connected) player.ready = true; }
  release(slot, {suspendMotion = true} = {}) {
    const player = this.player(slot);for(const [action,held]of Object.entries(actionsFor(player.profile,player.mask)))if(held)player.actionReleased.add(action);
    player.actionPressed.clear();player.released |= player.mask; player.mask = player.pressed = 0;
    if(suspendMotion)player.motion?.suspend();
  }
  buttons(slot, frame, session, now = performance.now()) {
    const player = this.player(slot);
    if (!player.connected || !player.ready || session !== player.session || !frame || frame.profileEpoch !== this.profileEpoch
      || !Number.isInteger(frame.mask) || frame.mask & ~BUTTON_MASK || !Number.isInteger(frame.sequence) || frame.sequence < 0 || frame.sequence > 65535) return false;
    if (player.buttonSequence !== null) {
      const delta = (frame.sequence - player.buttonSequence + 65536) % 65536;
      if (!delta || delta >= 32768) return false;
    }
    const before=actionsFor(player.profile,player.mask),after=actionsFor(player.profile,frame.mask);
    if (after.recenter && !before.recenter) this.center(slot,{freshGrip:true},now);
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
      if (change.newEpoch || !player.reference) player.reference = frame.quat.slice();
      if (change.reset) player.steerFilter.reset();
      const poseTime = Number.isFinite(frame.poseT) ? frame.poseT : frame.t;
      this.steering(player, poseTime);
      if (player.profile.motion === 'steer') player.motion.wheelDisplay.push({x:player.steer,y:0},poseTime,now,change.reset);
    }
    return true;
  }
  center(slot, command, now = performance.now()) {
    const player = this.player(slot);
    if (!player.motion || command.session && command.session !== player.session) return false;
    if (!player.motion.center(command, now)) return false;
    const anchor = player.motion.anchor?.quat;
    player.reference = anchor?.slice() || null;
    player.levelReference = false;
    player.latestQuat = player.motion.lastSample?.quat?.slice() || anchor?.slice() || null;
    player.steerFilter.reset();
    if (player.reference) {
      const refAxes = bodyAxesFromQuat(player.reference);
      if (refAxes.x.z < -0.25) player.landscapeSign = -1;
      else if (refAxes.x.z > 0.15) player.landscapeSign = 1;
    }
    this.steering(player);
    player.motion.wheelDisplay.reset({x:player.steer,y:0});
    return true;
  }
  setWheelRotation(slot,{rotation,profileEpoch,session}) {
    const player=this.player(slot);
    if (!player.connected || session!==player.session || profileEpoch!==this.profileEpoch ||
        player.profile.motion!=='steer' || !Number.isInteger(rotation) || rotation<0 || rotation>3) return false;
    if (player.rotation!==rotation) {
      player.rotation=rotation;
      // The initial profile center can have been captured in portrait. In the
      // new display orientation the level horizon is neutral until recentered.
      player.levelReference=true;
      player.steerFilter.reset();
      // The last pose may belong to the previous display orientation.
      player.steer=0;
      player.motion?.wheelDisplay.reset({x:0,y:0});
    }
    return true;
  }
  steering(player, poseTime = null) {
    if (!player.latestQuat) { player.steer = 0; return; }
    if (player.profile?.motion === 'steer' && player.profile.orientation === 'landscape') {
      const cur = bodyAxesFromQuat(player.latestQuat);
      const ref = player.reference && !player.levelReference ? bodyAxesFromQuat(player.reference) : null;
      let rawDeg;
      if (Number.isInteger(player.rotation)) {
        // Gravity component of the DISPLAY'S left edge. Rotation 0/180
        // also covers tablets whose native sensor coordinates are landscape.
        const axis = player.rotation % 2 ? 'y' : 'x';
        const sign = player.rotation === 1 || player.rotation === 2 ? 1 : -1;
        rawDeg = sign * (elevation(cur[axis]) - (ref ? elevation(ref[axis]) : 0));
      } else {
        // Older phones provide no display rotation. Retain the last sign in
        // the flat region where gravity cannot distinguish landscape grips.
        if (cur.x.z < -.35) player.landscapeSign = -1;
        else if (cur.x.z > .2) player.landscapeSign = 1;
        const sign = player.landscapeSign;
        const refSign = ref && (ref.x.z < -.25 ? -1 : ref.x.z > .15 ? 1 : sign);
        const portraitRef = ref && Math.abs(ref.x.z) < .2 && (
          Math.abs(ref.y.z) > .65 && Math.abs(cur.x.z) > .35 ||
          Math.abs(ref.y.x*cur.y.x + ref.y.y*cur.y.y + ref.y.z*cur.y.z) < .35);
        rawDeg = sign * (elevation(cur.y) - (refSign === sign && !portraitRef ? elevation(ref.y) : 0));
      }
      const deg = Number.isFinite(poseTime) ? player.steerFilter.filter(rawDeg, poseTime / 1000) : rawDeg;
      if (player.profile.id === 'kart-racing') {
        player.steer = kartWheelSteer(deg);
        return;
      }
      const mag = Math.max(0, Math.abs(deg) - 2.5) / (38 - 2.5);
      player.steer = mag <= 0 ? 0 : Math.sign(deg) * clamp(mag, 0, 1);
      return;
    }
    if (!player.reference) { player.steer = 0; return; }
    const [x, y, z, w] = multiply(inverse(player.reference), player.latestQuat);
    const turn = Math.atan2(2*(w*z+x*y), 1-2*(y*y+z*z));
    const steer = clamp(turn / (Math.PI / 4), -1, 1);
    player.steer = Math.abs(steer) < .025 ? 0 : steer;
  }
  sample(slot, now = performance.now()) {
    const player = this.player(slot);
    // A lost button heartbeat releases held buttons, not a fresh gyro stream.
    if (player.mask && now - player.buttonsAt > 1250) this.release(slot,{suspendMotion:false});
    if (player.motion?.pointer.live && now - player.motion.lastSampleAt > player.motion.timeout) player.motion.suspend();
    const movement = player.motion?.pointer.consumeMovement() || { cutting: false, reset: true };
    const position = player.motion?.pointer.position || { x: .5, y: .5 };
    // Presentation uses capture-timed interpolation; actions and collision keep
    // the immediate measured position and one-shot movement flags.
    const display = player.motion?.display?.sampleAt(now) || position;
    const result = { slot, connected: player.connected, ready: player.ready, session: player.session,
      name: player.name, profileEpoch: this.profileEpoch, buttons: buttonState(player.mask),
      pressed: buttonState(player.pressed), released: buttonState(player.released),
      actions:actionsFor(player.profile,player.mask),pressedActions:Object.fromEntries([...player.actionPressed].map(action=>[action,true])),releasedActions:Object.fromEntries([...player.actionReleased].map(action=>[action,true])),
      axes: { x: position.x, y: position.y, steer: player.motion?.pointer.live ? player.steer : 0 },
      displayAxes: { x: display.x, y: display.y },
      motionLive: !!player.motion?.pointer.live, cutting: !!movement.cutting && player.ready, reset: !!movement.reset };
    if (player.motion?.collectPath) {
      result.motionPath = player.motion.path.splice(0).map(({measuredAt,...point})=>({...point,age:Math.max(0,now-measuredAt)}));
    }
    if (player.profile?.motion === 'steer' && player.motion)
      result.displayAxes.steer = result.motionLive ? player.motion.wheelDisplay.sampleAt(now).x : 0;
    player.pressed = player.released = 0;player.actionPressed.clear();player.actionReleased.clear();return result;
  }
}
