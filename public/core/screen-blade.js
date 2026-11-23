import { bladeRibbon } from './blade-ribbon.js';

const svgElement = name => document.createElementNS('http://www.w3.org/2000/svg', name);
const colour = value => '#' + value.toString(16).padStart(6, '0');

// Screen aiming is independent of the WebGL drawing buffer and scene queue.
// Packet arrival can position a tip immediately; trails remain visual only.
export class ScreenBlade {
  constructor(layer, tint, slot) {
    let svg = layer.querySelector('svg');
    if (!svg) { svg = svgElement('svg'); layer.appendChild(svg); }
    this.svg = svg; this.position = { x: .5, y: .5 }; this.active = false;
    this.element = document.createElement('div');
    this.element.className = 'screen-blade'; this.element.dataset.slot = slot;
    this.element.style.setProperty('--core', colour(tint.core));
    this.element.style.setProperty('--glow', colour(tint.glow));
    this.element.innerHTML = '<i></i>'; this.element.hidden = true;
    layer.appendChild(this.element);
    this.paths = [svgElement('path'), svgElement('path')];
    this.paths.forEach((path, i) => { path.setAttribute('fill', colour(i ? tint.core : tint.glow)); path.setAttribute('opacity', i ? '.9' : '.25'); svg.appendChild(path); });
  }
  aim(position, active, width = innerWidth, height = innerHeight) {
    Object.assign(this.position, position); this.active = active;
    this.element.hidden = !active;
    this.element.style.transform = `translate3d(${position.x * width}px,${position.y * height}px,0)`;
    if (!active) this.paths.forEach(p => p.setAttribute('d', ''));
  }
  trail(points, toScreen, height, width, now = performance.now()) {
    this.svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    const age = points.length ? Math.max(0, Math.min(1, 1 - (now - points.at(-1).t) / 140)) : 0;
    this.paths.forEach((path, index) => {
      if (!this.active || points.length < 2) { path.setAttribute('d', ''); return; }
      // The white core meets the 14px tip; the wider halo stays soft and small.
      const halfWidth = index ? 7 : Math.max(9, Math.min(16, height * .014));
      path.setAttribute('d', bladeRibbon(points, toScreen, { now, halfWidth }));
      path.setAttribute('opacity', ((index ? .9 : .25) * Math.sqrt(age)).toFixed(3));
    });
  }
}
