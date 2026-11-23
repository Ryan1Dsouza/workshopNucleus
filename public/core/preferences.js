import { clamp } from './orientation.js';
const KEY = 'air-slice.sensitivity.v1';
export function saveSensitivity(value) {
  try { localStorage.setItem(KEY, String(clamp(value, 0.2, 6))); } catch {}
}
