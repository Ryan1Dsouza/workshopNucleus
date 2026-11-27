import {TRACK_LENGTH, angle, wrap} from './track.js';

// The simulation writes the previous pose once per fixed tick. The renderer
// writes into a separate buffer per kart, including both optional surface axes.
export function createPose() {
  return {forwardBuffer:{x:0,y:0,z:0},normalBuffer:{x:0,y:0,z:0}};
}
function direction(out, current, previous, alpha) {
  if (!current) return null;
  if (!previous || alpha===1) {
    out.x=current.x; out.y=current.y; out.z=current.z;
  } else {
    const x=previous.x+(current.x-previous.x)*alpha;
    const y=previous.y+(current.y-previous.y)*alpha;
    const z=previous.z+(current.z-previous.z)*alpha;
    const length=Math.hypot(x,y,z);
    if (length<1e-6) return direction(out,current,null,1);
    out.x=x/length; out.y=y/length; out.z=z/length;
  }
  return out;
}
export function capturePose(r,out) {
  out.x=r.x; out.y=r.y; out.z=r.z; out.s=r.s; out.progress=r.progress;
  out.lateral=r.lateral; out.heading=r.heading; out.hop=r.hop; out.landing=r.landing||0;
  out.surfaceForward=direction(out.forwardBuffer,r.surfaceForward,null,1);
  out.surfaceNormal=direction(out.normalBuffer,r.surfaceNormal,null,1);
  return out;
}
export function samplePose(r,alpha,out) {
  const prev=r.prevPose;
  // Network racers already interpolate on the packet clock. A world-space
  // discontinuity larger than a kart can travel in one tick is a reposition.
  if (!prev || r.remote || alpha>=1 || (r.x-prev.x)**2+(r.y-prev.y)**2+(r.z-prev.z)**2>64)
    return capturePose(r,out);
  out.x=prev.x+(r.x-prev.x)*alpha; out.y=prev.y+(r.y-prev.y)*alpha; out.z=prev.z+(r.z-prev.z)*alpha;
  const ds=wrap(r.s-prev.s+TRACK_LENGTH/2,TRACK_LENGTH)-TRACK_LENGTH/2;
  out.s=wrap(prev.s+ds*alpha,TRACK_LENGTH);
  out.progress=prev.progress+(r.progress-prev.progress)*alpha;
  out.lateral=prev.lateral+(r.lateral-prev.lateral)*alpha;
  out.heading=prev.heading+angle(r.heading-prev.heading)*alpha;
  out.hop=prev.hop+(r.hop-prev.hop)*alpha;
  out.landing=prev.landing+((r.landing||0)-prev.landing)*alpha;
  out.surfaceForward=direction(out.forwardBuffer,r.surfaceForward,prev.surfaceForward,alpha);
  out.surfaceNormal=direction(out.normalBuffer,r.surfaceNormal,prev.surfaceNormal,alpha);
  return out;
}
