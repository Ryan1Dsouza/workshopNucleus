// Cosmetic ribbon geometry only. These curves never enter collision input.
const clamp01 = x => Math.max(0, Math.min(1, x));
const xy = p => `${p.x.toFixed(2)},${p.y.toFixed(2)}`;
function edge(points) {
  let path = '';
  for (let i = 1; i < points.length; i++) {
    const p = points[i], next = points[i + 1];
    const end = next ? { x: (p.x + next.x) / 2, y: (p.y + next.y) / 2 } : p;
    path += ` Q${xy(p)} ${xy(end)}`;
  }
  return path;
}

export function bladeRibbon(points, toScreen, { now, halfWidth = 7, lifetimeMs = 140 } = {}) {
  if (!Number.isFinite(now) || !(halfWidth > 0) || !(lifetimeMs > 0)) return '';
  const centers = [];
  // Bounded work even if a caller supplies a long history.
  for (const point of points.slice(-64)) {
    if (!Number.isFinite(point.t) || now - point.t >= lifetimeMs) continue;
    const p = toScreen(point.x, point.y);
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) continue;
    const last = centers.at(-1);
    if (last && Math.hypot(p.x - last.x, p.y - last.y) < .05) continue;
    centers.push({ ...p, t: point.t });
  }
  if (centers.length < 2) return '';

  // A returning sword stroke must not flip the two sides of one polygon and
  // make a bow tie. End the old ribbon at the turn, then start the new one.
  const sections = []; let section = [centers[0]];
  for (let i = 1; i < centers.length; i++) {
    const a = centers[i - 1], b = centers[i], c = centers[i + 1];
    section.push(b);
    if (c) {
      const ux = b.x - a.x, uy = b.y - a.y, vx = c.x - b.x, vy = c.y - b.y;
      if ((ux * vx + uy * vy) / (Math.hypot(ux, uy) * Math.hypot(vx, vy)) < -.5) {
        sections.push(section); section = [b];
      }
    }
  }
  if (section.length > 1) sections.push(section);

  return sections.map(section => {
    const distances = [0];
    for (let i = 1; i < section.length; i++) distances.push(distances[i - 1] + Math.hypot(section[i].x - section[i - 1].x, section[i].y - section[i - 1].y));
    const total = distances.at(-1), left = [], right = []; let radius = 0;
    for (let i = 0; i < section.length; i++) {
      const p = section[i], a = section[Math.max(0, i - 1)], b = section[Math.min(section.length - 1, i + 1)];
      const dx = b.x - a.x, dy = b.y - a.y, length = Math.hypot(dx, dy) || 1;
      // Time fade avoids width popping when an old history point expires.
      // Distance taper stays consistent across different sensor/display rates.
      const age = clamp01(1 - (now - p.t) / lifetimeMs);
      radius = halfWidth * age ** 1.5 * (distances[i] / total) ** .65;
      const nx = -dy / length * radius, ny = dx / length * radius;
      left.push({ x: p.x + nx, y: p.y + ny }); right.push({ x: p.x - nx, y: p.y - ny });
    }
    const head = right.at(-1), cap = radius > .02 ? ` A${radius.toFixed(2)},${radius.toFixed(2)} 0 0 0 ${xy(head)}` : ` L${xy(head)}`;
    return `M${xy(left[0])}${edge(left)}${cap}${edge(right.reverse())} Z`;
  }).join(' ');
}
