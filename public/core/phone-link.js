import { features } from '../stage.mjs';
export const MotionLink = features.direct
  ? (await import('./transport.js')).MotionLink
  : (await import('./relay-link.js')).RelayMotionLink;
