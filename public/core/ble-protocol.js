export const BLE_SERVICE = '4d1a0001-9cf1-4ee3-a71b-9438ef5d3400';
export const BLE_MOTION = '4d1a0002-9cf1-4ee3-a71b-9438ef5d3400';
export const BLE_CONTROL = '4d1a0003-9cf1-4ee3-a71b-9438ef5d3400';
// Fits the default 20-byte ATT payload, avoiding MTU negotiation/fragmentation.
// v1, flags, sequence u16, capture milliseconds u32, XYZW q15 quaternion,
// angular-speed magnitude (0.01 deg/s) u16, calibration epoch u16; little endian.
export function decodeBleFrame(view) {
  if (!(view instanceof DataView) || view.byteLength !== 20 || view.getUint8(0) !== 1) return null;
  const flags=view.getUint8(1),quat=[8,10,12,14].map(i=>view.getInt16(i,true)/32767);
  if(flags&~3)return null;
  const norm=Math.hypot(...quat);if(norm<.9 || norm>1.1)return null;
  return {active:!!(flags&1),sequence:view.getUint16(2,true),t:view.getUint32(4,true),
    quat:quat.map(x=>x/norm),motion:{rx:view.getUint16(16,true)/100,ry:0,rz:0},motionAge:flags&2?0:1000,epoch:view.getUint16(18,true),source:'bluetooth-native'};
}

// Center commands fit the same default ATT payload. Legacy one-byte commands
// still work; v1.2 sends epoch + captured pose so arrival order cannot set grip.
export function decodeBleCenter(view) {
  if (!(view instanceof DataView) || view.byteLength === 0 || view.getUint8(0) !== 2) return null;
  if (view.byteLength === 1) return { type: 'recentre' };
  if (![3, 15].includes(view.byteLength)) return null;
  const epoch = view.getUint16(1, true);
  if (view.byteLength === 3) return { type: 'recentre', epoch };
  const quat = [7, 9, 11, 13].map(i => view.getInt16(i, true) / 32767);
  const norm = Math.hypot(...quat);
  if (norm < 0.9 || norm > 1.1) return null;
  const t = view.getUint32(3, true);
  return { type: 'recentre', epoch, pose: { quat: quat.map(v => v / norm), t, poseT: t,
    epoch, source: 'bluetooth-native', motion: { rx: 0, ry: 0, rz: 0 }, motionAge: 1000 } };
}

export class BleTimeline {
  constructor(){this.last=null;this.clock=null;this.time=0;this.lastPose=null;this.sequence=0;}
  captureTime(raw) {
    // A calibration can establish the clock immediately before a u32 rollover.
    if(this.clock===null){this.clock=raw;this.time=raw;}
    return this.time + ((raw-this.clock)|0);
  }
  accept(frame) {
    if(!frame)return null;
    const delta=this.last?(frame.sequence-this.last.sequence)&65535:0;
    if(this.last && (!delta || delta>=32768))return null;
    const capture=this.captureTime(frame.t);
    // Inactive frames contain dispatch time. A queued sensor reading can have
    // been captured before that dispatch while still being the newest pose.
    if(frame.active && this.lastPose!==null && capture<this.lastPose)return null;
    if(frame.active)this.lastPose=capture;
    if(capture>=this.time){this.time=capture;this.clock=frame.t;}
    this.sequence=this.last?this.sequence+delta:frame.sequence;
    this.last=frame;
    return {...frame,t:capture,poseT:capture,sequence:this.sequence};
  }
}
