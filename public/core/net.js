import { MotionLink } from './phone-link.js';
import { roomCode } from './room.js';
export class GameLink extends MotionLink {
  constructor(options = {}) {
    super({ ...options, role: 'game', room: roomCode(), onSample: options.onOrientation,
      onStatus: status => { document.dispatchEvent(new CustomEvent('air-link', { detail: status })); options.onStatus?.(status); } });
  }
}
