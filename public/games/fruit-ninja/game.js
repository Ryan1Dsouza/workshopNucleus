import * as THREE from '/vendor/three/three.module.js';
import { FruitNinja, FRUIT_TYPES, FIELD_H, MAX_JUICE_PARTICLES } from './logic.js';
import { fruitMatch } from './online.js';
import { MotionInput } from '../../core/motion-input.js';
import { laneAim as projectLane } from './lane-aim.js';
import { saveSensitivity } from '../../core/preferences.js';
import { AudioEngine } from '../../core/audio.js';
import { createGameLink, createBluetoothLink } from '../../core/input-links.js';
import { clamp } from '../../core/orientation.js';
import { FrameMetrics } from '../../core/diagnostics.js';
import { Trail } from '../../core/trail.js';
import { RenderBudget } from '../../core/render-budget.js';
import { ScreenBlade } from '../../core/screen-blade.js';

/**
 * Fruit Ninja — Three.js renderer, styled after the original: a wooden dojo
 * wall, fruit that looks like fruit, juice that stains the boards, a white
 * blade swoosh, and brush-lettered score UI.
 *
 * Gameplay runs on the fixed play field in logic.js; this file only maps that
 * field into a 3D scene and draws it. The camera sits at the distance where the
 * field's height exactly fills the frame, which keeps world↔screen a plain
 * linear map and lets the proven 2D collision math carry over untouched.
 */

const $ = (id) => document.getElementById(id);
const embedded = window.__controllerEmbedded === true;

// Classic is the default; Practice is an explicit choice.
const PRACTICE = new URLSearchParams(location.search).has('practice');

// ── Scene ──────────────────────────────────────────────────────────────────
const canvas = $('game');
// desynchronized: lets Chrome present the canvas without waiting for the
// compositor's queue — worth up to a frame of cursor latency. Ignored where
// unsupported.
const renderer = new THREE.WebGLRenderer({
  canvas, antialias: false, desynchronized: true, powerPreference: 'high-performance',
});
// A projector-sized drawing buffer also suits integrated laptop GPUs. DPR 2
// would otherwise quadruple fragment work without improving phone tracking.

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x2b1a0c);

const FOV = 45;
const camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 100);
const CAM_Z = (FIELD_H / 2) / Math.tan((FOV / 2) * (Math.PI / 180));
camera.position.set(0, 0, CAM_Z);

scene.add(new THREE.AmbientLight(0xfff4e0, 0.85));
const key = new THREE.DirectionalLight(0xfff1d6, 1.5);
key.position.set(3, 7, 9);
scene.add(key);
const fill = new THREE.DirectionalLight(0xcfe0ff, 0.3);
fill.position.set(-6, -3, 5);
scene.add(fill);

// ── Canvas-texture helpers ─────────────────────────────────────────────────
function makeTexture(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

const rand = (a, b) => a + Math.random() * (b - a);

// ── The dojo wall ──────────────────────────────────────────────────────────
// Vertical planks, warm brown, wavy grain, a few knots, heavy vignette —
// the Original Wood dojo.
const woodTex = makeTexture(1024, 640, (ctx, W, H) => {
  const plank = 93;
  for (let x = 0; x < W; x += plank) {
    const tone = 0.86 + Math.sin(x * 12.7) * 0.1 + Math.random() * 0.08;
    const g = ctx.createLinearGradient(x, 0, x + plank, 0);
    g.addColorStop(0, `rgb(${134 * tone | 0}, ${88 * tone | 0}, ${46 * tone | 0})`);
    g.addColorStop(0.5, `rgb(${148 * tone | 0}, ${99 * tone | 0}, ${54 * tone | 0})`);
    g.addColorStop(1, `rgb(${126 * tone | 0}, ${82 * tone | 0}, ${42 * tone | 0})`);
    ctx.fillStyle = g;
    ctx.fillRect(x, 0, plank, H);

    // Grain: wavy vertical strokes.
    ctx.strokeStyle = `rgba(62, 38, 16, ${rand(0.12, 0.3)})`;
    for (let i = 0; i < 7; i += 1) {
      const gx = x + rand(6, plank - 6);
      ctx.lineWidth = rand(0.6, 1.8);
      ctx.beginPath();
      ctx.moveTo(gx, 0);
      for (let y = 0; y <= H; y += 32) {
        ctx.lineTo(gx + Math.sin(y * 0.02 + gx) * rand(1, 4), y);
      }
      ctx.stroke();
    }
    // The odd knot.
    if (Math.random() < 0.4) {
      const kx = x + plank / 2 + rand(-14, 14);
      const ky = rand(60, H - 60);
      for (let r = 9; r > 1; r -= 2.2) {
        ctx.strokeStyle = `rgba(58, 34, 12, ${0.5 - r * 0.04})`;
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.ellipse(kx, ky, r, r * 1.5, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    // Plank seam.
    ctx.fillStyle = 'rgba(40, 22, 8, 0.75)';
    ctx.fillRect(x + plank - 2, 0, 2, H);
  }
  // Vignette so the action pops off the wall.
  const v = ctx.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, W * 0.72);
  v.addColorStop(0, 'rgba(0,0,0,0)');
  v.addColorStop(1, 'rgba(20, 8, 0, 0.55)');
  ctx.fillStyle = v;
  ctx.fillRect(0, 0, W, H);
});

const backdrop = new THREE.Mesh(
  new THREE.PlaneGeometry(80, 50),
  // The wood texture already contains grain, shading and vignette. Baking
  // its warm tint avoids a PBR lighting calculation for every screen pixel.
  new THREE.MeshBasicMaterial({ map: woodTex, color: 0xd7bf9e }),
);
backdrop.position.z = -14;
scene.add(backdrop);

// ── Fruit skins ────────────────────────────────────────────────────────────
// One rind texture (equirect, wrapped around a sphere) and one flesh texture
// (the cut face) per type, drawn once and shared by every instance.
const speckle = (ctx, W, H, n, color, rMin, rMax) => {
  ctx.fillStyle = color;
  for (let i = 0; i < n; i += 1) {
    ctx.beginPath();
    ctx.ellipse(Math.random() * W, Math.random() * H, rand(rMin, rMax), rand(rMin, rMax), rand(0, 3), 0, Math.PI * 2);
    ctx.fill();
  }
};

const RIND_PAINTERS = {
  watermelon: (ctx, W, H) => {
    ctx.fillStyle = '#7ab648';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#2c661e';
    const stripes = 8;
    for (let i = 0; i < stripes; i += 1) {
      const cx = (i + 0.5) * (W / stripes);
      ctx.beginPath();
      ctx.moveTo(cx - 9, 0);
      for (let y = 0; y <= H; y += 16) {
        ctx.lineTo(cx - 9 + Math.sin(y * 0.09 + i * 2) * 7, y);
      }
      for (let y = H; y >= 0; y -= 16) {
        ctx.lineTo(cx + 9 + Math.sin(y * 0.11 + i * 2) * 7, y);
      }
      ctx.closePath();
      ctx.fill();
    }
    speckle(ctx, W, H, 140, 'rgba(44, 102, 30, 0.35)', 1, 3);
  },
  pineapple: (ctx, W, H) => {
    ctx.fillStyle = '#d99c34';
    ctx.fillRect(0, 0, W, H);
    // Diamond lattice with a pale stud in each cell.
    ctx.strokeStyle = 'rgba(122, 76, 20, 0.85)';
    ctx.lineWidth = 3;
    const s = 32;
    for (let d = -H; d < W + H; d += s) {
      ctx.beginPath(); ctx.moveTo(d, 0); ctx.lineTo(d + H, H); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(d, H); ctx.lineTo(d + H, 0); ctx.stroke();
    }
    for (let y = s / 2; y < H; y += s) {
      for (let x = (y / s % 2) * (s / 2); x < W; x += s) {
        ctx.fillStyle = 'rgba(245, 216, 130, 0.8)';
        ctx.beginPath();
        ctx.arc(x, y, 3.4, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  },
  strawberry: (ctx, W, H) => {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#e6392b');
    g.addColorStop(1, '#c01d14');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    // Seeds in an offset grid.
    for (let y = 10; y < H - 6; y += 22) {
      for (let x = (y % 44 ? 11 : 0); x < W; x += 23) {
        ctx.fillStyle = '#f8e58a';
        ctx.beginPath();
        ctx.ellipse(x, y, 2.4, 3.6, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(120, 20, 10, 0.5)';
        ctx.beginPath();
        ctx.ellipse(x, y + 4, 2.6, 1.6, 0, 0, Math.PI);
        ctx.fill();
      }
    }
  },
  orange: (ctx, W, H) => {
    ctx.fillStyle = '#f28511';
    ctx.fillRect(0, 0, W, H);
    speckle(ctx, W, H, 420, 'rgba(205, 106, 8, 0.5)', 0.8, 2);
    speckle(ctx, W, H, 160, 'rgba(255, 176, 84, 0.4)', 0.8, 1.8);
  },
  kiwi: (ctx, W, H) => {
    ctx.fillStyle = '#7a5b39';
    ctx.fillRect(0, 0, W, H);
    // Fuzz: short scratchy strokes.
    for (let i = 0; i < 700; i += 1) {
      const x = Math.random() * W;
      const y = Math.random() * H;
      ctx.strokeStyle = Math.random() < 0.5 ? 'rgba(146, 116, 78, 0.5)' : 'rgba(84, 60, 34, 0.5)';
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + rand(-3, 3), y + rand(-3, 3));
      ctx.stroke();
    }
  },
  lemon: (ctx, W, H) => {
    ctx.fillStyle = '#f5d321';
    ctx.fillRect(0, 0, W, H);
    speckle(ctx, W, H, 300, 'rgba(214, 178, 14, 0.5)', 0.8, 2);
    speckle(ctx, W, H, 120, 'rgba(255, 244, 150, 0.5)', 0.8, 1.6);
  },
  apple: (ctx, W, H) => {
    ctx.fillStyle = '#7bb92e';
    ctx.fillRect(0, 0, W, H);
    // Faint vertical streaks, like a granny smith.
    for (let i = 0; i < 90; i += 1) {
      const x = Math.random() * W;
      ctx.strokeStyle = Math.random() < 0.6 ? 'rgba(158, 212, 85, 0.5)' : 'rgba(96, 150, 32, 0.45)';
      ctx.lineWidth = rand(1, 2.6);
      ctx.beginPath();
      ctx.moveTo(x, rand(0, H * 0.3));
      ctx.lineTo(x + rand(-4, 4), rand(H * 0.7, H));
      ctx.stroke();
    }
    speckle(ctx, W, H, 90, 'rgba(235, 245, 200, 0.5)', 0.6, 1.2);
  },
  peach: (ctx, W, H) => {
    const g = ctx.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, '#f8b04a');
    g.addColorStop(0.5, '#f5923e');
    g.addColorStop(1, '#e8543f');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    // Blush patches.
    for (let i = 0; i < 12; i += 1) {
      const x = Math.random() * W;
      const y = Math.random() * H;
      const r = rand(18, 44);
      const b = ctx.createRadialGradient(x, y, 0, x, y, r);
      b.addColorStop(0, 'rgba(224, 70, 52, 0.35)');
      b.addColorStop(1, 'rgba(224, 70, 52, 0)');
      ctx.fillStyle = b;
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }
    speckle(ctx, W, H, 200, 'rgba(255, 220, 160, 0.25)', 0.6, 1.4);
  },
};

/** The cut face. Radius 128, centred at (128,128) on a 256² canvas. */
const FLESH_PAINTERS = {
  watermelon: (ctx) => {
    disc(ctx, '#8ec44e');                       // rind edge
    disc(ctx, '#e9f2d0', 122);                  // white rim
    disc(ctx, '#f1373b', 112);                  // red flesh
    // Seeds in two loose rings, pointing outward.
    ctx.fillStyle = '#241a12';
    for (const [ring, n] of [[74, 9], [44, 6]]) {
      for (let i = 0; i < n; i += 1) {
        const a = (i / n) * Math.PI * 2 + ring;
        ctx.save();
        ctx.translate(128 + Math.cos(a) * ring, 128 + Math.sin(a) * ring);
        ctx.rotate(a + Math.PI / 2);
        ctx.beginPath();
        ctx.ellipse(0, 0, 4, 6.5, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }
  },
  pineapple: (ctx) => {
    disc(ctx, '#c78a2e');
    disc(ctx, '#f7de74', 118);
    // Fibrous radial strokes + concentric rings.
    ctx.strokeStyle = 'rgba(214, 172, 74, 0.8)';
    for (let i = 0; i < 40; i += 1) {
      const a = (i / 40) * Math.PI * 2;
      ctx.lineWidth = rand(1, 2.4);
      ctx.beginPath();
      ctx.moveTo(128 + Math.cos(a) * 24, 128 + Math.sin(a) * 24);
      ctx.lineTo(128 + Math.cos(a) * 114, 128 + Math.sin(a) * 114);
      ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(230, 196, 110, 0.9)';
    for (const r of [50, 80, 105]) {
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(128, 128, r, 0, Math.PI * 2);
      ctx.stroke();
    }
    disc(ctx, '#f3e9b4', 20);                   // core
  },
  strawberry: (ctx) => {
    disc(ctx, '#d8261f');
    disc(ctx, '#f7bfae', 116);
    disc(ctx, '#fbe9e2', 78);
    // Radial streaks from the pale core.
    ctx.strokeStyle = 'rgba(240, 120, 104, 0.8)';
    for (let i = 0; i < 26; i += 1) {
      const a = (i / 26) * Math.PI * 2;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(128 + Math.cos(a) * 20, 128 + Math.sin(a) * 20);
      ctx.lineTo(128 + Math.cos(a) * 108, 128 + Math.sin(a) * 108);
      ctx.stroke();
    }
  },
  orange: (ctx) => citrus(ctx, '#f28511', '#ffa62b', '#ffd9a3'),
  lemon: (ctx) => citrus(ctx, '#e3c114', '#fbe97b', '#fdf6cd'),
  kiwi: (ctx) => {
    disc(ctx, '#6d5132');
    disc(ctx, '#8cc63f', 120);
    // Pale starburst toward the core.
    ctx.strokeStyle = 'rgba(214, 236, 160, 0.75)';
    for (let i = 0; i < 36; i += 1) {
      const a = (i / 36) * Math.PI * 2;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(128 + Math.cos(a) * 34, 128 + Math.sin(a) * 34);
      ctx.lineTo(128 + Math.cos(a) * 100, 128 + Math.sin(a) * 100);
      ctx.stroke();
    }
    // Seed ring around a white oval core.
    ctx.fillStyle = '#1c150c';
    for (let i = 0; i < 26; i += 1) {
      const a = (i / 26) * Math.PI * 2;
      const r = 44 + (i % 2) * 8;
      ctx.beginPath();
      ctx.ellipse(128 + Math.cos(a) * r, 128 + Math.sin(a) * r, 2.2, 3.4, a, 0, Math.PI * 2);
      ctx.fill();
    }
    disc(ctx, '#f2f7e2', 26);
  },
  apple: (ctx) => {
    disc(ctx, '#9ed455');
    disc(ctx, '#f4f0d5', 118);
    // Star core with two dark seeds.
    ctx.fillStyle = 'rgba(216, 205, 160, 0.9)';
    ctx.beginPath();
    for (let i = 0; i < 10; i += 1) {
      const a = (i / 10) * Math.PI * 2;
      const r = i % 2 ? 14 : 30;
      ctx[i ? 'lineTo' : 'moveTo'](128 + Math.cos(a) * r, 128 + Math.sin(a) * r);
    }
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#4a2c14';
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.ellipse(128 + s * 9, 128, 4, 8, s * 0.5, 0, Math.PI * 2);
      ctx.fill();
    }
  },
  peach: (ctx) => {
    disc(ctx, '#f5923e');
    disc(ctx, '#fad089', 118);
    const g = ctx.createRadialGradient(128, 128, 12, 128, 128, 70);
    g.addColorStop(0, 'rgba(224, 70, 52, 0.55)');
    g.addColorStop(1, 'rgba(224, 70, 52, 0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 256, 256);
    // The pit.
    disc(ctx, '#8a3d1e', 26);
    ctx.strokeStyle = 'rgba(60, 24, 8, 0.7)';
    for (let i = 0; i < 14; i += 1) {
      const a = rand(0, Math.PI * 2);
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(128 + Math.cos(a) * 6, 128 + Math.sin(a) * 6);
      ctx.lineTo(128 + Math.cos(a) * rand(16, 24), 128 + Math.sin(a) * rand(16, 24));
      ctx.stroke();
    }
  },
};

function disc(ctx, color, r = 128) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(128, 128, r, 0, Math.PI * 2);
  ctx.fill();
}

/** Citrus cut face: pith ring, wedge segments, pale core. */
function citrus(ctx, rindC, fleshC, pithC) {
  disc(ctx, rindC);
  disc(ctx, pithC, 118);
  const wedges = 9;
  ctx.fillStyle = fleshC;
  for (let i = 0; i < wedges; i += 1) {
    const a0 = (i / wedges) * Math.PI * 2 + 0.05;
    const a1 = ((i + 1) / wedges) * Math.PI * 2 - 0.05;
    ctx.beginPath();
    ctx.moveTo(128 + Math.cos(a0) * 12, 128 + Math.sin(a0) * 12);
    ctx.arc(128, 128, 106, a0, a1);
    ctx.closePath();
    ctx.fill();
  }
  disc(ctx, pithC, 11);
}

// Per-type non-uniform scale so a lemon reads as a lemon, not a yellow ball.
const FRUIT_SHAPE = {
  watermelon: [1.18, 0.94, 1],
  pineapple: [0.82, 1.18, 0.82],
  strawberry: [0.95, 1.12, 0.95],
  orange: [1, 1, 1],
  kiwi: [0.92, 1.12, 0.92],
  lemon: [0.88, 1.14, 0.88],
  apple: [1.06, 0.96, 1.06],
  peach: [1.02, 0.98, 1.02],
};

const rindTex = new Map();
const fleshTex = new Map();
for (const name of Object.keys(RIND_PAINTERS)) {
  rindTex.set(name, makeTexture(256, 128, RIND_PAINTERS[name]));
  fleshTex.set(name, makeTexture(256, 256, FLESH_PAINTERS[name]));
}

const game = new FruitNinja({ aspect: 16 / 9, onEvent: handleEvent, infiniteLives: PRACTICE });
const localSlot = () => game.network?.slot ?? 0;

// ── Meshes ─────────────────────────────────────────────────────────────────
const sphereGeo = new THREE.SphereGeometry(1, 28, 20);
const halfGeo = new THREE.SphereGeometry(1, 28, 20, 0, Math.PI);
const particleGeo = new THREE.SphereGeometry(1, 6, 5);
const cutFaceGeo = new THREE.CircleGeometry(1, 28);
const fuseGeo = new THREE.CylinderGeometry(0.05, 0.07, 0.34, 6);
const sparkGeo = new THREE.SphereGeometry(0.09, 8, 6);
const bombMat = new THREE.MeshPhongMaterial({ color: 0x15151c, shininess: 65, specular: 0x666670 });
const sparkMat = new THREE.MeshBasicMaterial({ color: 0xffe08a });
const meshes = new Map();   // logic id → Object3D

// Sprites preserve the luminous tips without changing the shader light count
// whenever a bomb appears or a phone joins/leaves.
const glowTex = makeTexture(64, 64, (ctx) => {
  const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  gradient.addColorStop(0, '#ffffffcc');
  gradient.addColorStop(.25, '#ffffff55');
  gradient.addColorStop(1, '#ffffff00');
  ctx.fillStyle = gradient; ctx.fillRect(0, 0, 64, 64);
});
function glowSprite(colour, size) {
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: colour,
    blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, opacity: .65 }));
  sprite.scale.set(size, size, 1);
  return sprite;
}

const rindMats = new Map();
const fleshMats = new Map();
function rindMat(name) {
  if (!rindMats.has(name)) {
    rindMats.set(name, new THREE.MeshLambertMaterial({
      map: rindTex.get(name),
    }));
  }
  return rindMats.get(name);
}
function fleshMat(name) {
  if (!fleshMats.has(name)) {
    fleshMats.set(name, new THREE.MeshLambertMaterial({
      map: fleshTex.get(name), side: THREE.DoubleSide,
    }));
  }
  return fleshMats.get(name);
}

const leafMat = new THREE.MeshLambertMaterial({ color: 0x2f7a2a });
const stemMat = new THREE.MeshLambertMaterial({ color: 0x6d4a24 });
const leafGeo = new THREE.ConeGeometry(0.16, 0.75, 6);
const stemGeo = new THREE.CylinderGeometry(0.045, 0.06, 0.3, 6);

/** Crowns, stems and calyxes — the little garnishes that sell the silhouette. */
function garnish(name) {
  const g = new THREE.Group();
  if (name === 'pineapple') {
    for (let i = 0; i < 6; i += 1) {
      const leaf = new THREE.Mesh(leafGeo, leafMat);
      const a = (i / 6) * Math.PI * 2;
      leaf.position.set(Math.cos(a) * 0.16, 1.12, Math.sin(a) * 0.16);
      leaf.rotation.set(Math.sin(a) * 0.55, 0, -Math.cos(a) * 0.55);
      g.add(leaf);
    }
    const centre = new THREE.Mesh(leafGeo, leafMat);
    centre.position.y = 1.25;
    g.add(centre);
  } else if (name === 'strawberry') {
    for (let i = 0; i < 5; i += 1) {
      const leaf = new THREE.Mesh(leafGeo, leafMat);
      const a = (i / 5) * Math.PI * 2;
      leaf.scale.setScalar(0.6);
      leaf.position.set(Math.cos(a) * 0.3, 1.02, Math.sin(a) * 0.3);
      leaf.rotation.set(Math.sin(a) * 1.15, 0, -Math.cos(a) * 1.15);
      g.add(leaf);
    }
  } else if (name === 'apple' || name === 'peach') {
    const stem = new THREE.Mesh(stemGeo, stemMat);
    stem.position.y = 1.02;
    g.add(stem);
    if (name === 'apple') {
      const leaf = new THREE.Mesh(leafGeo, leafMat);
      leaf.scale.set(0.5, 0.4, 0.35);
      leaf.position.set(0.18, 1.06, 0);
      leaf.rotation.z = -1.2;
      g.add(leaf);
    }
  }
  return g.children.length ? g : null;
}

function fruitMesh(f) {
  if (f.bomb) {
    const g = new THREE.Group();
    const body = new THREE.Mesh(sphereGeo, bombMat);
    body.scale.setScalar(f.r);
    g.add(body);
    const fuse = new THREE.Mesh(
      fuseGeo,
      stemMat,
    );
    fuse.position.y = f.r * 1.1;
    fuse.rotation.z = 0.25;
    g.add(fuse);
    const spark = new THREE.Mesh(
      sparkGeo,
      sparkMat,
    );
    spark.position.set(-0.08, f.r * 1.1 + 0.2, 0);
    g.add(spark);
    const glow = glowSprite(0xffb347, .65);
    glow.position.copy(spark.position);
    g.add(glow);
    g.userData.spark = spark;
    g.userData.glow = glow;
    return g;
  }
  const g = new THREE.Group();
  const body = new THREE.Mesh(sphereGeo, rindMat(f.kind.name));
  body.scale.set(...(FRUIT_SHAPE[f.kind.name] || [1, 1, 1]));
  g.add(body);
  const extra = garnish(f.kind.name);
  if (extra) g.add(extra);
  g.scale.setScalar(f.r);
  return g;
}

function halfMesh(h) {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(halfGeo, rindMat(h.kind.name)));
  const flesh = new THREE.Mesh(cutFaceGeo, fleshMat(h.kind.name));
  flesh.rotation.y = Math.PI / 2;
  g.add(flesh);
  g.scale.setScalar(h.r);
  return g;
}

/**
 * Point a half's cut face along the direction it flew, then tumble it about the
 * slice line so the exposed flesh swings into view.
 *
 * The hemisphere geometry's flat face normal is −X, so the alignment rotation
 * about Z is `cut + side·90°`. Tumbling about Z instead — the obvious first
 * guess — keeps the flat face permanently edge-on to the camera, and both
 * halves just read as whole fruit.
 */
const Z_AXIS = new THREE.Vector3(0, 0, 1);
const qAlign = new THREE.Quaternion();
const qTumble = new THREE.Quaternion();
const cutAxis = new THREE.Vector3();

function applyHalfOrientation(mesh, h) {
  qAlign.setFromAxisAngle(Z_AXIS, h.cut + h.side * (Math.PI / 2));
  cutAxis.set(Math.cos(h.cut), Math.sin(h.cut), 0);
  qTumble.setFromAxisAngle(cutAxis, h.tumble);
  mesh.quaternion.copy(qTumble).multiply(qAlign);
}

// Every juice droplet/explosion spark shares one draw call and one material.
// Per-instance opacity preserves the fade without allocating N transparent
// MeshBasicMaterials (and sorting/rendering N meshes) on each multi-fruit cut.
const particleAlpha = new THREE.InstancedBufferAttribute(new Float32Array(MAX_JUICE_PARTICLES), 1);
particleAlpha.setUsage(THREE.DynamicDrawUsage);
particleGeo.setAttribute('particleAlpha', particleAlpha);
const particleMat = new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false });
particleMat.onBeforeCompile = shader => {
  shader.vertexShader = 'attribute float particleAlpha; varying float vParticleAlpha;\n' + shader.vertexShader;
  shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvParticleAlpha = particleAlpha;');
  shader.fragmentShader = 'varying float vParticleAlpha;\n' + shader.fragmentShader;
  shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.a *= vParticleAlpha;');
};
particleMat.customProgramCacheKey = () => 'air-slice-particle-alpha-v1';
const particleBatch = new THREE.InstancedMesh(particleGeo, particleMat, MAX_JUICE_PARTICLES);
particleBatch.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
particleBatch.count = 0; particleBatch.frustumCulled = false;
scene.add(particleBatch);
const particleTransform = new THREE.Object3D(), particleColour = new THREE.Color();
// Allocate instance colour before the first frame so the shader layout stays
// identical when the first fruit is sliced.
particleBatch.setColorAt(0, particleColour);
particleBatch.instanceColor.setUsage(THREE.DynamicDrawUsage);
function syncParticles() {
  const list = game.particles, start = Math.max(0, list.length - MAX_JUICE_PARTICLES);
  particleBatch.count = Math.min(list.length, MAX_JUICE_PARTICLES);
  for (let i = 0; i < particleBatch.count; i++) {
    const p = list[start + i];
    particleTransform.position.set(p.x, p.y, .2);
    particleTransform.scale.setScalar(p.r * Math.max(.2, p.life));
    particleTransform.updateMatrix();
    particleBatch.setMatrixAt(i, particleTransform.matrix);
    particleBatch.setColorAt(i, particleColour.set(p.color));
    particleAlpha.setX(i, clamp(p.life, 0, 1));
  }
  if (particleBatch.count) {
    particleBatch.instanceMatrix.needsUpdate = true;
    particleBatch.instanceColor.needsUpdate = true;
    particleAlpha.needsUpdate = true;
  }
}

function syncMeshes(list, build, apply) {
  for (const item of list) {
    let m = meshes.get(item.id);
    if (!m) {
      m = build(item);
      meshes.set(item.id, m);
      scene.add(m);
    }
    apply(m, item);
  }
}

/** Drop meshes whose logic object is gone — otherwise the scene leaks. */
function pruneMeshes() {
  const alive = new Set();
  for (const f of game.fruits) alive.add(f.id);
  for (const h of game.halves) alive.add(h.id);
  for (const [id, m] of meshes) {
    if (alive.has(id)) continue;
    scene.remove(m);
    m.traverse(child => {
      // Geometry and fruit materials are shared. Each bomb glow owns only its
      // sprite material; juice instances have a persistent shared material.
      if (child.isSprite) child.material.dispose();
    });
    meshes.delete(id);
  }
}

// ── Juice on the wall ──────────────────────────────────────────────────────
// Every slice throws a splat onto the dojo boards; it lingers, then fades.
const splatTex = makeTexture(256, 256, (ctx) => {
  const blob = (x, y, r) => {
    ctx.beginPath();
    let a0 = rand(0, Math.PI * 2);
    ctx.moveTo(x + Math.cos(a0) * r, y + Math.sin(a0) * r);
    for (let a = 0.5; a <= Math.PI * 2; a += 0.5) {
      const rr = r * rand(0.65, 1.25);
      ctx.lineTo(x + Math.cos(a0 + a) * rr, y + Math.sin(a0 + a) * rr);
    }
    ctx.closePath();
    ctx.fill();
  };
  ctx.fillStyle = '#fff';
  blob(128, 128, 52);
  for (let i = 0; i < 13; i += 1) {
    const a = rand(0, Math.PI * 2);
    const d = rand(50, 110);
    blob(128 + Math.cos(a) * d, 128 + Math.sin(a) * d, rand(4, 17));
  }
});

const SPLAT_MAX = 34;
const SPLAT_Z = -13.8;
const splats = [];
const splatGeo = new THREE.PlaneGeometry(1, 1);

function addSplat(x, y, colour, now) {
  const m = new THREE.Mesh(
    splatGeo,
    new THREE.MeshBasicMaterial({
      map: splatTex, transparent: true, color: colour,
      opacity: 0.85, depthWrite: false,
    }),
  );
  // Splats live on the wall: project the slice point out to the backdrop.
  const k = -SPLAT_Z / CAM_Z + 1;
  m.position.set(x * k, y * k, SPLAT_Z);
  m.rotation.z = rand(0, Math.PI * 2);
  m.scale.setScalar(rand(2.2, 3.6) * k * 0.55);
  scene.add(m);
  splats.push({ m, born: now });
  if (splats.length > SPLAT_MAX) {
    const old = splats.shift();
    scene.remove(old.m);
    old.m.material.dispose();
  }
}

function stepSplats(now) {
  for (let i = splats.length - 1; i >= 0; i -= 1) {
    const s = splats[i];
    const age = (now - s.born) / 1000;
    if (age < 1.4) continue;
    s.m.material.opacity = 0.85 * Math.max(0, 1 - (age - 1.4) / 4.5);
    if (s.m.material.opacity <= 0) {
      scene.remove(s.m);
      s.m.material.dispose();
      splats.splice(i, 1);
    }
  }
}

// ── Blade trails, one per player ────────────────────────────────────────────
/**
 * A tapered ribbon rather than a line: the blade arc is the signature visual,
 * and THREE.Line is locked to 1px on every platform regardless of linewidth.
 * Two passes — a wide soft glow under a bright core — for the original's
 * silver swoosh. Every connected phone gets its own pair, tinted so it's
 * obvious whose blade is whose; slot 0 keeps the exact white-on-blue look
 * solo play has always had.
 */
// Fixed palette by slot — 4 phones max (see server/index.cjs's MAX_PLAYERS).
const PLAYER_TINTS = [
  { glow: 0xbfd9ff, core: 0xffffff },   // slot 0 — the original white/blue blade
  { glow: 0xffb3c0, core: 0xff5f6d },   // slot 1 — red
  { glow: 0xc8f5b0, core: 0x7ed957 },   // slot 2 — green
  { glow: 0xffe9b0, core: 0xffd166 },   // slot 3 — gold
];
const tintFor = (slot) => PLAYER_TINTS[slot % PLAYER_TINTS.length];

const visuals = new Map();
function visualFor(slot) {
  let v = visuals.get(slot);
  if (v) return v;
  v = { screen: new ScreenBlade($('bladeLayer'), tintFor(slot), slot),
    trail: new Trail({ lifetimeMs: 140, minStep: .004 }),
    cursor: { x: 0, y: 0, active: false } };
  visuals.set(slot, v);
  return v;
}
visualFor(0);

function drawTrail(now = performance.now()) {
  for (const [slot, player] of game.players) {
    const v = visualFor(slot), inp = inputs.get(slot);
    // A pause between sensor packets ends a stroke, but the phone still owns
    // its dot. Only a deliberate drag takes it away from a paired player.
    const phonePresent=bluetooth.devices.get(slot)?.connected || link.slots.some(s=>s.slot===slot&&s.occupied);
    const mousePreview=slot===localSlot()&&mouse.visible&&(mouse.active||!phonePresent&&!inp?.pointer.live);
    const externalAim=!mousePreview?inp?.externalAim:null;
    const localAim = mousePreview?{x:mouse.x,y:mouse.y}:inp && (externalAim || (smoothBlade ? inp.display.sampleAt(now) : inp.pointer.position));
    const opponent = game.network && slot !== localSlot();
    const aim = opponent ? game.network.remoteAim : localAim && laneAim(slot, localAim, mousePreview);
    const p = aim ? toWorld(aim.x, aim.y) : player.cursor;
    Object.assign(v.cursor, p, { active: player.cursor.active });
    if (!player.cursor.active || !opponent && inp && !inp.pointer.live && !(slot === localSlot() && mouse.active)) v.trail.clear();
    else v.trail.push(p.x, p.y, now);
    const visible=player.cursor.active||mousePreview||phonePresent;
    v.screen.aim(aim || {x: .5, y: .5}, visible);
    v.screen.trail(v.trail.points, toScreen, innerHeight, innerWidth, now);
  }
}

// ── Audio ──────────────────────────────────────────────────────────────────
const audio = new AudioEngine();

// The fruit-ninja cue set: squishy slices, a throw-pop, a gong. Every one is
// overridable by dropping audio/<name>.mp3 next to the server.
audio.register('fn-throw', (a) => {
  a.noise({ dur: 0.22, gain: 0.1, type: 'bandpass', freq: 500, sweepTo: 2600, q: 1.6 });
  a.tone({ freq: 300, slideTo: 540, dur: 0.16, type: 'sine', gain: 0.07 });
});

audio.register('fn-slice', (a, { size = 0.65, combo = 1 } = {}) => {
  const depth = 1 - clamp((size - 0.55) / 0.31, 0, 1);   // big fruit = wetter, lower
  a.noise({ dur: 0.1, gain: 0.32, type: 'highpass', freq: 2400, sweepTo: 6000 });
  a.noise({
    dur: 0.16, gain: 0.3, type: 'bandpass',
    freq: 500 + depth * 500 + Math.random() * 120, sweepTo: 180, q: 1.1,
  });
  a.tone({
    freq: 120 + depth * 90 + Math.min(combo, 6) * 12,
    slideTo: 60, dur: 0.14, type: 'triangle', gain: 0.22,
  });
});

audio.register('fn-combo', (a, { combo = 3 } = {}) => {
  const base = 440 + Math.min(combo, 8) * 55;
  a.tone({ freq: base, dur: 0.09, type: 'square', gain: 0.08 });
  a.tone({ freq: base * 1.5, dur: 0.14, type: 'sine', gain: 0.16, delay: 0.06 });
});

audio.register('fn-critical', (a) => {
  a.tone({ freq: 880, dur: 0.08, type: 'square', gain: 0.09 });
  a.tone({ freq: 1318, dur: 0.09, type: 'square', gain: 0.09, delay: 0.05 });
  a.tone({ freq: 1760, dur: 0.22, type: 'sine', gain: 0.16, delay: 0.1 });
  a.noise({ dur: 0.25, gain: 0.08, type: 'highpass', freq: 6000 });
});

audio.register('fn-miss', (a) => {
  a.tone({ freq: 330, slideTo: 190, dur: 0.22, type: 'sine', gain: 0.18 });
  a.tone({ freq: 247, slideTo: 140, dur: 0.28, type: 'sine', gain: 0.14, delay: 0.1 });
});

audio.register('fn-gameover', (a) => {
  // A gong: low fundamentals with slow decay under a metallic shimmer.
  a.tone({ freq: 130.8, dur: 2.4, type: 'sine', gain: 0.34, attack: 0.01 });
  a.tone({ freq: 98, dur: 2.8, type: 'sine', gain: 0.26, attack: 0.01 });
  a.tone({ freq: 196, dur: 1.9, type: 'triangle', gain: 0.12, attack: 0.01 });
  a.noise({ dur: 1.6, gain: 0.1, type: 'bandpass', freq: 900, sweepTo: 300, q: 6 });
});

// ── Pointer, one per connected phone ────────────────────────────────────────
// Each phone aims from its measured pose relative to its centered grip.
// The blade never extrapolates motion or switches grip axes during a swing.
const inputs = new Map();   // slot → { pointer, lastSampleAt }
const frameMetrics = new FrameMetrics();
const renderBudget = new RenderBudget();
let smoothing = false;
let smoothBlade = false;
let bladeDisplayChosen = false;
function setSmoothBlade(value, userChoice = true) {
  if (userChoice) bladeDisplayChosen = true;
  smoothBlade = !!value;
  for (const [slot, inp] of inputs) { inp.display.reset(inp.pointer.position); visualFor(slot).trail.clear(); }
  document.dispatchEvent(new CustomEvent('air-blade-display',{detail:{enabled:smoothBlade}}));
}
let bladeOnly = false, bladeOnlySince = 0;
function setBladeOnly(value) {
  value = !!value;
  if (value === bladeOnly) return;
  const now = performance.now();
  if (value) bladeOnlySince = now;
  else {
    const elapsed = now - bladeOnlySince;
    for (const key of ['startedAt', 'nextSpawn', 'comboUntil']) game.state[key] += elapsed;
    for (const p of game.players.values()) p.comboUntil += elapsed;
    for (const s of splats) s.born += elapsed;
  }
  bladeOnly = value;
  for (const m of meshes.values()) m.visible = !value;
  particleBatch.visible = !value;
  for (const s of splats) s.m.visible = !value;
  for (const [slot, inp] of inputs) {
    inp.pointer.pending = { cutting: false, reset: true };
    inp.display.reset(inp.pointer.position);
    game.getPlayer(slot).trail.clear(); visualFor(slot).trail.clear();
  }
  document.body.classList.toggle('blade-only', value);
  $('bladeOnlyToggle').textContent = value ? 'Return to fruit' : 'Blade-only check';
  frameMetrics.clear();
}
function setSmoothing(value) {
  smoothing=!!value;
  for(const [slot,inp] of inputs){inp.pointer.setSmoothing(smoothing);inp.display.reset(inp.pointer.position);visualFor(slot).trail.clear();const p=game.getPlayer(slot);p.trail.clear();p.cutting=false;}
  sendFeedback({type:'tracking-mode',smoothing});
}

function inputFor(slot) {
  let inp = inputs.get(slot);
  if (!inp) {
    inp = new MotionInput({ sensitivity: 1, smoothing, smoothDisplay:true, aspect: window.innerHeight / window.innerWidth });
    inp.pointer.setViewport(window.innerWidth / (game.splitScreen ? 2 : 1), window.innerHeight);
    inputs.set(slot, inp);
  }
  return inp;
}
inputFor(0);   // always present, for the desk-testing mouse/keyboard fallback

let viewportSize = null;
function resize() {
  const w = Math.max(1, window.innerWidth);
  const h = Math.max(1, window.innerHeight);
  const remapped = viewportSize && (viewportSize.w !== w || viewportSize.h !== h);
  viewportSize = { w, h };
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.25, Math.sqrt(1920 * 1080 / (w * h))) * renderBudget.scale);
  renderer.setSize(w, h, false);
  camera.aspect = game.network ? 16 / 9 : w / h;
  camera.updateProjectionMatrix();
  game.setAspect(camera.aspect);
  for (const inp of inputs.values()) inp.pointer.setViewport(w / (game.splitScreen ? 2 : 1), h);
  if (remapped) {
    // Reprojecting the play surface starts a fresh stroke without recalibrating.
    for (const [slot, inp] of inputs) {
      inp.externalReset = true;
      inp.pointer.pending = { cutting: false, reset: true };
      inp.display.reset(inp.pointer.position);
      game.getPlayer(slot).trail.clear();
      visualFor(slot).trail.clear();
    }
  }
}
window.addEventListener('resize', resize);

/** Normalised pointer (0..1, y down) → world units on the z=0 plane. */
function toWorld(nx, ny) {
  const halfH = FIELD_H / 2;
  const halfW = halfH * camera.aspect;
  return { x: (nx - 0.5) * 2 * halfW, y: (0.5 - ny) * 2 * halfH };
}

// Phone axes cover their own lane. Mouse coordinates already address the
// whole canvas, so clamp them to Player 1's lane instead of compressing them.
function laneAim(slot, aim, screenSpace = false) {
  return projectLane(game.splitScreen, slot, aim, screenSpace);
}

function configureRound({splitScreen = game.splitScreen, durationSeconds = game.durationMs / 1000} = {}) {
  const changed = !!splitScreen !== game.splitScreen;
  game.setSplitScreen(splitScreen); game.setDuration(durationSeconds);
  document.body.classList.toggle('split-screen',game.splitScreen);
  if (changed) {
    for (const inp of inputs.values()) {
      inp.pointer.setViewport(innerWidth / (game.splitScreen ? 2 : 1), innerHeight);
      inp.center({freshGrip:true},performance.now());
    }
    mouse.active = false;
    for (const [slot,inp] of inputs) { inp.externalReset = true; inp.pointer.pending = {cutting:false,reset:true}; visualFor(slot).trail.clear(); }
  }
  syncHud();
}

/** World units on z=0 → CSS pixels, for the DOM splash text. */
function toScreen(x, y) {
  const halfH = FIELD_H / 2;
  const halfW = halfH * camera.aspect;
  return {
    x: (x / (2 * halfW) + 0.5) * window.innerWidth,
    y: (0.5 - y / (2 * halfH)) * window.innerHeight,
  };
}

/**
 * The link pill names every connected phone and whether it's actually
 * streaming motion — "P2 no motion" is the difference between a paired phone
 * and a playing one, and it's exactly the state that otherwise looks like
 * "multiplayer is broken" (a phone that never tapped Enable motion sensors).
 */
function syncLinkLabel() {
  const occupied = activePlayers();
  if(bluetooth.devices.size){$('link-t').textContent=[...bluetooth.devices.values()].map(r=>`P${r.slot+1} Bluetooth ${r.connected?'connected':'waiting'}`).concat(occupied.filter(s=>!bluetooth.has(s.slot)).map(s=>`P${s.slot+1} Wi-Fi`)).join(' · ');return;}
  if (occupied.length === 0) { $('link-t').textContent = 'no remote connected'; return; }
  if (occupied.length === 1) {
    const s = occupied[0];
    const inp = inputs.get(s.slot);
    const initialized = inp?.session !== undefined;
    $('link-t').textContent = !initialized ? 'remote paired · no motion yet'
      : inp.pointer.live ? 'remote connected' : 'remote connected · idle';
    return;
  }
  $('link-t').textContent = occupied.map((s) => {
    const inp = inputs.get(s.slot);
    return `P${s.slot + 1}${!inp?.session ? ' (no motion)' : inp.pointer.live ? '' : ' (idle)'}`;
  }).join(' · ');
}
setInterval(syncLinkLabel, 1000);

/** Re-centre one phone's blade; names the player once there's more than one. */
function recentreSlot(slot, command = {}) {
  const inp = inputFor(slot);
  if (!inp.center(command, performance.now())) return;
  visualFor(slot).trail.clear();
  const player = game.getPlayer(slot);
  player.trail.clear(); player.cutting = false;
  if (player.cursor.active) {const aim=laneAim(slot,inp.pointer.position);Object.assign(player.cursor,toWorld(aim.x,aim.y));}
  flash(controllerCount() > 1 ? `P${slot + 1} re-centred` : 're-centred');
}

function suspendSlot(slot) {
  const inp = inputFor(slot), player = game.getPlayer(slot);
  inp.suspend(); visualFor(slot).trail.clear();
  player.trail.clear(); player.cutting = false;
  // Cursor visibility follows connection state; freshness only gates cuts.
}

function measuredCursor(slot, point, observedAt, reset = false) {
  const mapped = laneAim(slot, point), world = toWorld(mapped.x, mapped.y);
  game.setCursor(world.x, world.y, observedAt, slot, {
    captureAt: point.poseTime, reset: reset || point.reset, cutting: point.cutting && !reset && !game.paused,
  });
}
function receiveOrientation(sample, slot) {
    const now = performance.now();
    const inp = inputFor(slot);
    const result = inp.receive(sample, now);
    if (!result) return;
    if (result.reset) {
      const player = game.getPlayer(slot);
      player.trail.clear(); player.cutting = false;
      visualFor(slot).trail.clear();
    }
    const movement = inp.pointer.consumeMovement();
    if (!(slot===localSlot() && mouse.active)) {
      inp.packetCursor = true;
      measuredCursor(slot, {...inp.pointer.position,...movement,poseTime:inp.lastSensorTime},inp.lastSampleAt,result.reset);
    }
}
function receiveCommand(cmd, slot) {
    if (cmd.type === 'calibrate' || cmd.type === 'recentre') recentreSlot(slot, cmd);
    else if (cmd.type === 'start') { audio.unlock(); startGame(); }
    else if (cmd.type === 'suspend') suspendSlot(slot);
    else if (cmd.type === 'sensitivity') { const inp = inputFor(slot); inp.pointer.sensitivity = clamp(Number(cmd.value) || 1, 0.5, 2); recentreSlot(slot, cmd); }
    else if (cmd.type === 'button' && cmd.button === 'A' && game.state.phase==='idle') beginPlay();
    // B returns to the menu, so the whole loop is reachable from the phone.
    else if (cmd.type === 'button' && cmd.button === 'B') pauseGame();
    else if (cmd.type === 'speed') {
      const inp = inputFor(slot);
      inp.pointer.sensitivity = clamp(inp.pointer.sensitivity * (cmd.factor || 1), 0.2, 6);
      recentreSlot(slot);
      // Only slot 0 is persisted: one shared localStorage key can't hold
      // four players' preferences, and slot 0 is the phone guaranteed to be
      // around across sessions (solo play). Others adjust for the session.
      if (slot === 0) saveSensitivity(inp.pointer.sensitivity);
      const label = controllerCount() > 1 ? `P${slot + 1} speed` : 'pointer speed';
      flash(`${label} ${(inp.pointer.sensitivity * 100).toFixed(0)}%`);
    }
}
const bluetooth = embedded ? { devices:new Map(), has(slot){return this.devices.has(slot);}, feedback(data){parent.postMessage({type:'game-feedback',data},location.origin);} } : await createBluetoothLink({
  onSample: receiveOrientation, onCommand: receiveCommand,
  onState: (state) => {
    const {slot, connected}=state;
    if(connected && !bladeDisplayChosen && !smoothBlade)setSmoothBlade(true,false);
    if(!connected){suspendSlot(slot);game.getPlayer(slot).cursor.active=false;visualFor(slot).screen.aim(inputFor(slot).pointer.position,false);}
    syncLinkLabel();syncHud();$('dot').classList.toggle('on',controllerCount()>0);
    document.dispatchEvent(new CustomEvent('air-bluetooth',{detail:state}));
  },
});
function activePlayers() {
  const players=new Map((link.slots||[]).filter(s=>s.occupied&&!bluetooth.has(s.slot)).map(s=>[s.slot,s]));
  for(const r of bluetooth.devices.values())if(r.connected)players.set(r.slot,{slot:r.slot,occupied:true});
  return [...players.values()];
}
function controllerCount(){return activePlayers().length;}
function sendFeedback(data) {
  bluetooth.feedback(data);
  for(const peer of link.peers.values())if(!bluetooth.has(peer.slot)&&(!Number.isInteger(data.slot)||data.slot===peer.slot))link.feedback({...data,slot:peer.slot});
}
const link = embedded ? { slots:[], peers:new Map(), rate:0, feedback(){} } : await createGameLink({
  onOrientation: (sample, slot) => {if(!bluetooth.has(slot))receiveOrientation(sample,slot);},
  onCommand: (cmd, slot) => {if(!bluetooth.has(slot))receiveCommand(cmd,slot);},
  onPresence: (p) => {
    const on = controllerCount() > 0;
    $('dot').classList.toggle('on', on);
    syncLinkLabel();
    // Actual departure hides the blade; ordinary sensor silence does not.
    for (const s of p.slots || []) {
      if (s.occupied || bluetooth.has(s.slot)) continue;
      if (inputs.has(s.slot)) suspendSlot(s.slot);
      const player = game.players.get(s.slot);
      if (player) { player.cursor.active = false; player.trail.clear(); }
    }
    syncHud();
    sendFeedback({type:'tracking-mode',smoothing});
  },
  onReset: slot => {
    for (const [index, inp] of inputs) if (!bluetooth.has(index) && (slot === undefined || slot === index)) {
      suspendSlot(index); inp.pointer.recentre(); inp.lastSampleAt = 0;
      inp.display.reset(inp.pointer.position);
      inp.session = undefined; inp.epoch = undefined;
      game.getPlayer(index).cursor.active = false; game.getPlayer(index).trail.clear();
    }
  },
});

// ── DOM effects: splash text, the red miss ✗, the bomb flash ──────────────
function splash(worldX, worldY, text, cls = '', colour = null) {
  // Simultaneous combo/critical labels should not pile up DOM layers.
  const fx = $('fx');
  while (fx.childElementCount >= 12) fx.firstElementChild.remove();
  const el = document.createElement('div');
  el.className = `splash ${cls}`;
  el.textContent = text;
  if (colour) el.style.color = colour;
  const p = toScreen(worldX, worldY);
  el.style.left = `${p.x}px`;
  el.style.top = `${p.y}px`;
  fx.appendChild(el);
  setTimeout(() => el.remove(), 950);
}

/** CSS colour for a slot's blade, so its floating "+n" reads as theirs. */
const cssTint = (slot) => `#${tintFor(slot).core.toString(16).padStart(6, '0')}`;

let missAnimation = null, bombAnimation = null;
function missFlash(worldX) {
  const el = $('miss-x');
  const p = toScreen(clamp(worldX, -game.w * 0.42, game.w * 0.42), -FIELD_H * 0.32);
  el.style.left = `clamp(70px, ${p.x / innerWidth * 100}%, calc(100% - 70px))`;
  missAnimation?.cancel();
  missAnimation = el.animate([
    { opacity: 0, transform: 'translate(-50%, 0) scale(.3)' },
    { opacity: 1, transform: 'translate(-50%, 0) scale(1.25)', offset: .2 },
    { opacity: 1, transform: 'translate(-50%, 0) scale(1)', offset: .7 },
    { opacity: 0, transform: 'translate(-50%, 0) scale(1.05)' },
  ], { duration: 750, easing: 'ease-out' });
}

function bombFlash() {
  const el = $('flash');
  bombAnimation?.cancel();
  // Restart without a forced synchronous layout. A short, translucent flash
  // also keeps the aiming blade visible during consecutive explosions.
  bombAnimation = el.animate([{ opacity: .28 }, { opacity: 0 }], { duration: 250, easing: 'ease-out' });
}

// ── Events from the logic layer ────────────────────────────────────────────
// Browsers keep audio locked until a click or keypress on THIS page. When the
// whole session is phone-driven, that never happens — so say so, once, at the
// first moment sound was supposed to play.
let soundHintShown = false;
function maybeSoundHint() {
  if (soundHintShown || audio.muted) return;
  if (!audio.ctx || audio.ctx.state !== 'running') {
    soundHintShown = true;
    flash('click or press any key to enable sound');
  }
}

const lastCueAt = new Map();
function playEffectCue(name, opts, cooldown = 35) {
  const now = performance.now();
  if (now - (lastCueAt.get(name) ?? -Infinity) < cooldown) return;
  lastCueAt.set(name, now);
  audio.play(name, opts);
}

function handleEvent(e) {
  if (e.type === 'launch') {
    playEffectCue('fn-throw', {}, 60);
  } else if (e.type === 'slice') {
    maybeSoundHint();
    playEffectCue('fn-slice', { size: e.r, combo: e.combo });
    addSplat(e.x, e.y, e.kind.splat, performance.now());
    if (e.critical) {
      playEffectCue('fn-critical');
      splash(e.x, e.y, 'CRITICAL', 'crit');
      splash(e.x, e.y - 0.9, `+${e.gained}`, 'plus', cssTint(e.slot));
    } else if (e.combo >= 3) {
      playEffectCue('fn-combo', { combo: e.combo });
      splash(e.x, e.y, `COMBO ×${e.combo}`, 'combo');
    } else {
      splash(e.x, e.y, `+${e.gained}`, 'plus', cssTint(e.slot));
    }
    // Only the phone that landed the cut feels it — see server/index.cjs: a
    // feedback message with a slot targets that one controller.
    sendFeedback({ type: 'slice', combo: e.combo, slot: e.slot });
  } else if (e.type === 'bomb') {
    playEffectCue('explode', {}, 100);
    bombFlash();
    if (!e.fatal) splash(e.x, e.y, game.infiniteLives?'−10':'−1 life', 'penalty');
    sendFeedback({ type: 'bomb' });
  } else if (e.type === 'miss') {
    playEffectCue('fn-miss', {}, 60);
    missFlash(e.x ?? 0);
    sendFeedback({ type: 'miss' });
  } else if (e.type === 'gameover') {
    audio.play('fn-gameover');
    const best = Math.max(Number(localStorage.getItem('fn.best') || 0), e.score);
    localStorage.setItem('fn.best', String(best));
    showOverlay(`<h1 class="gameover">${e.reason === 'timer' ? 'TIME UP' : 'GAME OVER'}</h1>
      <div id="final">score <b>${e.score}</b> · best <b>${best}</b></div>
      <div class="cta">${game.network?'Ready up in the lobby to play again':'<strong>Space</strong> to play again'}</div>`);
  }
  syncHud();
}

// ── Overlays / HUD ─────────────────────────────────────────────────────────
let toastUntil = 0;
function flash(text) {
  toastUntil = performance.now() + 2200;
  $('toast').textContent = text.toUpperCase();
  $('toast').classList.add('on');
}

const showOverlay = (html) => { $('panel').innerHTML = html; $('overlay').classList.remove('hide'); };
const hideOverlay = () => $('overlay').classList.add('hide');

function syncHud() {
  $('score-v').textContent = game.state.score;
  $('best').textContent = `BEST: ${Math.max(Number(localStorage.getItem('fn.best') || 0), game.state.score)}`;
  const xs = $('lives').querySelectorAll('.x');
  for (let i = 0; i < xs.length; i += 1) {
    xs[i].classList.toggle('lost', !game.infiniteLives && i >= game.state.lives);
  }
  $('practice').style.display = game.infiniteLives ? '' : 'none';

  // Multiplayer scoreboard: everyone's individual score, on the shared
  // board — only shown once a second phone actually joins, so solo play's
  // HUD is pixel-identical to before this existed.
  const board = $('players');
  const connected = game.splitScreen ? [{slot:0},{slot:1}] : activePlayers();
  if (game.splitScreen || connected.length > 1) {
    board.classList.add('on');
    const nodes = connected.map(({ slot }) => {
      const p = game.getPlayer(slot);
      const row = document.createElement('div');
      row.className = 'prow';
      const dot = document.createElement('span');
      dot.className = 'pdot';
      dot.style.background = cssTint(slot);
      const label = document.createTextNode(`${game.playerNames?.[slot] || `P${slot + 1}`} `);
      const score = document.createElement('b');
      score.textContent = String(p.score);
      row.append(dot, label, score);
      return row;
    });
    const sig = nodes.map(n => n.textContent).join('|');
    if (board.dataset.sig !== sig) { board.dataset.sig = sig; board.replaceChildren(...nodes); }
  } else {
    board.classList.remove('on');
  }
  syncTimer();
}

function syncTimer() {
  const timer = $('roundTimer');
  timer.hidden = !game.durationMs;
  const seconds = Math.ceil(game.state.remainingMs / 1000);
  const text = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2,'0')}`;
  if(timer.textContent !== text)timer.textContent = text;
}

function startGame(now = performance.now()) {
  $('setup').classList.add('hide');
  mouse.active = false;
  if(embedded)clearStrokes();
  else for (const [slot, inp] of inputs) { recentreSlot(slot,{freshGrip:true}); inp.externalReset = true; }
  hideOverlay();
  game.start(now);
  if (bladeOnly) bladeOnlySince = performance.now();
  syncHud();
  reportState();
}

function beginPlay() {
  if(game.network)return;
  audio.unlock();
  if(embedded&&game.state.phase!=='playing'){parent.postMessage({type:'fruit-request-play'},location.origin);return;}
  if (game.state.phase !== 'playing') startGame();
  else if(game.paused)resumeGame();
}

function pauseGame() {
  if (game.network) return;
  game.pause(performance.now());
  mouse.active = false;
  $('setup').classList.remove('hide');
  clearStrokes();
  reportState();
}
function clearStrokes() {
  mouse.active = false;
  for (const [slot,inp] of inputs) {
    inp.externalReset = true; inp.pointer.pending = {cutting:false,reset:true};
    inp.display.reset(inp.pointer.position); visualFor(slot).trail.clear();
    const player=game.getPlayer(slot);player.trail.clear();player.cutting=false;player.cursor.active=false;
  }
}
function reportState(){if(embedded)parent.postMessage({type:'game-state',paused:game.paused},location.origin);}
function resumeGame() { game.resume(performance.now());clearStrokes();$('setup').classList.add('hide');reportState(); }
function setControllerState(slot,state) {
  if(!embedded || ![0,1].includes(slot))return;
  const inp=inputFor(slot), player=game.getPlayer(slot), now=performance.now();
  inp.latestController=state;
  const wasConnected=bluetooth.devices.has(slot);
  const mouseOwns=slot===localSlot()&&mouse.active;
  if(!state.connected || state.session==='desktop'){
    bluetooth.devices.delete(slot);
    if(wasConnected){
      inp.externalAim=null;inp.externalSession=null;suspendSlot(slot);
      if(!mouseOwns)player.cursor.active=false;
    }
    if(wasConnected)syncHud();
    return;
  }
  const newlyConnected=!bluetooth.devices.has(slot);
  bluetooth.devices.set(slot,{slot,connected:true});
  if(mouseOwns){if(newlyConnected)syncHud();return;}
  inp.lastSampleAt=now;inp.session=state.session;inp.pointer.lastSeen=now;
  inp.pointer.source='bluetooth-native';inp.pointer.live=state.motionLive&&state.ready;
  inp.pointer.setFromMouse(state.axes.x,state.axes.y);
  const boundary=inp.externalReset || inp.externalSession!==state.session;
  const reset=state.reset||boundary||inp.pointer.pending.reset;
  inp.externalReset=false;inp.externalSession=state.session;
  inp.pointer.pending={cutting:(state.cutting||inp.pointer.pending.cutting)&&!game.paused&&!reset,reset};
  // The host already interpolates these presentation coordinates from sensor
  // capture time. Keep them out of the pointer/collision path and avoid a
  // second interpolation delay in the embedded game.
  const display=state.displayAxes||state.axes;
  inp.externalAim=display&&Number.isFinite(display.x)&&Number.isFinite(display.y)?{x:display.x,y:display.y}:null;
  if(!inp.externalAim)inp.display.push(inp.pointer.position,now,now,reset);
  inp.packetCursor = Array.isArray(state.motionPath);
  if (inp.packetCursor) {
    const path = state.motionPath;
    if (boundary || !inp.pointer.live || (state.reset && !path.length)) player.trail.clear();
    if (inp.pointer.live) {
      for (const [i,point] of path.entries())
        measuredCursor(slot,point,now-point.age,boundary && i===0);
      if (!path.length && (boundary || state.reset || !player.cursor.active)) {
        const aim=laneAim(slot,state.axes);
        Object.assign(player.cursor,toWorld(aim.x,aim.y),{active:true});
      }
    }
    inp.pointer.consumeMovement();
  } else if (reset) player.trail.clear();
  if(reset){player.cutting=false;visualFor(slot).trail.clear();}
  if(newlyConnected)syncHud();
}
let automaticPause=false;
document.addEventListener('visibilitychange', () => {
  // The host coordinates embedded pause/resume; standalone owns its lifecycle.
  if(embedded)return;
  if(document.hidden){automaticPause=!game.paused&&game.state.phase==='playing';if(automaticPause)pauseGame();}
  else if(automaticPause){automaticPause=false;resumeGame();}
});

/** Mirror the logic state into the scene graph. Split out so the verification
 *  harness can time a frame's work directly, without depending on rAF cadence. */
function syncScene(now = performance.now()) {
  if (bladeOnly) { drawTrail(now); return; }
  syncMeshes(game.fruits, fruitMesh, (m, f) => {
    m.position.set(f.x, f.y, 0);
    m.rotation.set(f.rot * f.spinAxis.x, f.rot * f.spinAxis.y, f.rot * f.spinAxis.z);
    if (m.userData.spark) {
      // The fuse flickers.
      const flicker = 0.65 + Math.abs(Math.sin(now / 47 + f.id)) * 0.8;
      m.userData.glow.material.opacity = .65 * flicker;
      m.userData.spark.scale.setScalar(flicker);
    }
  });
  syncMeshes(game.halves, halfMesh, (m, h) => {
    m.position.set(h.x, h.y, 0);
    applyHalfOrientation(m, h);
  });
  syncParticles();
  pruneMeshes();
  stepSplats(now);
  drawTrail(now);
}

// ── Loop ───────────────────────────────────────────────────────────────────
let last = performance.now();
let frames = 0;
let fpsMark = performance.now();
let fps = 0;

function frame(now) {
  requestAnimationFrame(frame);
  const workStart=performance.now();
  if(!document.hidden && now-last>0)frameMetrics.intervals.add(now-last);
  if (renderBudget.observe(now-last, !document.hidden && !game.paused && !bladeOnly)) resize();
  const dt = Math.min((now - last) / 1000, 1 / 20);
  last = now;
  if (dt <= 0) return;

  frames += 1;
  if (now - fpsMark >= 500) {
    fps = (frames * 1000) / (now - fpsMark);
    frames = 0;
    fpsMark = now;
  }

  // Collision positions are immediate. The separate visual trail interpolates
  // measured endpoints; it never submits a collision or invents extra travel.
  for (const [slot, inp] of inputs) {
    if(game.network && slot!==localSlot())continue;
    if (inp.pointer.live && now - inp.pointer.lastSeen > 150) suspendSlot(slot);
    const mouseOwns=slot===localSlot()&&mouse.active;
    if ((inp.pointer.live && !inp.packetCursor) || mouseOwns) {
      const aim = mouseOwns ? mouse : inp.pointer.sampleAt(now);
      const mapped=laneAim(slot,aim,mouseOwns),p = toWorld(mapped.x,mapped.y);
      const movement = inp.pointer.consumeMovement();
      game.setCursor(p.x, p.y, now, slot, { cutting: !game.paused&&(mouseOwns || movement.cutting), reset: mouseOwns?mouse.reset:movement.reset });
      if(mouseOwns)mouse.reset=false;
    }
  }

  if (game.network) {
    // Identical fixed-step waves on both displays, independent of render rate.
    // Drain a background backlog over several frames so the peer channel and
    // input handlers still run while this display catches up.
    for(let steps=0;steps<32 && game.network.simTime+1000/120<=now && game.state.phase==='playing';steps++) {
      game.network.simTime += 1000/120;
      game.update(game.network.simTime, 1/120);
    }
  } else if (!game.paused && !document.hidden && !bladeOnly) game.update(now, dt);
  syncTimer();
  syncScene(now);

  if (toastUntil && now > toastUntil) { toastUntil = 0; $('toast').classList.remove('on'); }

  const renderStart=performance.now();
  if (!bladeOnly) renderer.render(scene, camera);
  if(!document.hidden){frameMetrics.render.add(performance.now()-renderStart);frameMetrics.work.add(performance.now()-workStart);}
}

// ── Input ──────────────────────────────────────────────────────────────────
const mouse = { x: 0.5, y: 0.5, active: false, visible: false, reset: false };
function mousePosition(e){
  if(!e.isPrimary)return;
  mouse.x=clamp(e.clientX/window.innerWidth,0,1);mouse.y=clamp(e.clientY/window.innerHeight,0,1);mouse.visible=true;
}
canvas.addEventListener('pointerenter',mousePosition);
canvas.addEventListener('pointerleave',e=>{if(e.isPrimary&&!mouse.active)mouse.visible=false;});
canvas.addEventListener('pointerdown', (e) => {
  if (!e.isPrimary || game.paused || e.button !== 0) return;
  canvas.setPointerCapture(e.pointerId); mouse.active = true;mouse.reset=true;mousePosition(e);
  const inp = inputFor(localSlot()); inp.pointer.live = false;inp.pointer.pending={cutting:false,reset:false};game.getPlayer(localSlot()).trail.clear();visualFor(localSlot()).trail.clear();
});
canvas.addEventListener('pointermove', (e) => {
  mousePosition(e);
});
for (const event of ['pointerup', 'pointercancel', 'lostpointercapture']) canvas.addEventListener(event, e => {
  if(!e.isPrimary || !mouse.active)return;
  if(event==='pointercancel')mouse.visible=false;
  else if(event==='pointerup')mouse.visible=e.pointerType!=='touch'&&e.clientX>=0&&e.clientX<=innerWidth&&e.clientY>=0&&e.clientY<=innerHeight;
  mouse.active = false; game.getPlayer(localSlot()).cursor.active = false;game.getPlayer(localSlot()).cutting=false;game.getPlayer(localSlot()).trail.clear();
  const inp=inputFor(localSlot());inp.externalReset=true;inp.pointer.pending={cutting:false,reset:true};visualFor(localSlot()).trail.clear();
  if(inp.latestController)setControllerState(localSlot(),{...inp.latestController,motionPath:[],cutting:false,reset:true});
});
window.addEventListener('pointerdown', () => audio.unlock());

// Keyboard/desk fallback always addresses slot 0 — the one guaranteed input.
window.addEventListener('keydown', (e) => {
  if (e.target.closest('button, input, select, textarea, a')) return;
  audio.unlock();
  const p0 = inputFor(0).pointer;
  switch (e.key.toLowerCase()) {
    case 'escape': if(!game.network)pauseGame(); break;
    case ' ': e.preventDefault(); beginPlay(); break;
    case 'r':
    case 'c': recentreSlot(0); break;
    case 'arrowright':
      p0.sensitivity = clamp(p0.sensitivity * 1.12, 0.2, 6);
      recentreSlot(0);
      saveSensitivity(p0.sensitivity);
      flash(`pointer speed ${(p0.sensitivity * 100).toFixed(0)}%`);
      break;
    case 'arrowleft':
      p0.sensitivity = clamp(p0.sensitivity / 1.12, 0.2, 6);
      recentreSlot(0);
      saveSensitivity(p0.sensitivity);
      flash(`pointer speed ${(p0.sensitivity * 100).toFixed(0)}%`);
      break;
    case 'd': $('debug').classList.toggle('on'); break;
    default: break;
  }
});

setInterval(() => {
  if (!$('debug').classList.contains('on')) return;
  const p0 = inputFor(0).pointer;
  const players = [...inputs.entries()]
    .map(([slot, inp]) => `P${slot + 1}:${inp.pointer.live ? 'live' : 'idle'}`)
    .join(' ');
  $('debug').textContent = [
    `mode        ${p0.mode}`,
    `mapping     ${p0.describeMap()}`,
    `rate        ${p0.rateDps.yaw.toFixed(1)} / ${p0.rateDps.pitch.toFixed(1)} deg/s`,
    `pointer     ${p0.display.x.toFixed(3)}, ${p0.display.y.toFixed(3)}`,
    `gesture     ${game.trail.speed().toFixed(2)} u/s`,
    `sensor rate ${link.rate.toFixed(0)} Hz`,
    `source      ${p0.source}`,
    `fps         ${fps.toFixed(0)}`,
    `players     ${players}`,
    `entities    ${game.fruits.length}f ${game.halves.length}h ${game.particles.length}p`,
    `meshes      ${meshes.size} · splats ${splats.length}`,
  ].join('\n');
}, 250);

// Keep one bounded set of representative materials alive, so transient bomb
// glows/splats can reuse their programs even after earlier effects expire.
const warmupAssets = new THREE.Group();
async function warmRenderer() {
  const started=performance.now();
  for(const kind of FRUIT_TYPES){warmupAssets.add(fruitMesh({kind,r:kind.r}),halfMesh({kind,r:kind.r}));}
  warmupAssets.add(fruitMesh({bomb:true,r:.6}));
  warmupAssets.add(new THREE.Mesh(splatGeo,new THREE.MeshBasicMaterial({map:splatTex,transparent:true,opacity:.85,depthWrite:false})));
  for(const texture of [woodTex,glowTex,splatTex,...rindTex.values(),...fleshTex.values()])renderer.initTexture(texture);
  scene.add(warmupAssets);
  try { await renderer.compileAsync(scene,camera); }
  finally { scene.remove(warmupAssets); }
  return {milliseconds:performance.now()-started,programs:renderer.info.programs.length};
}

resize();
syncHud();
// Finish GPU setup before publishing fruit-ready or starting gameplay rAF.
const rendererWarmup = await warmRenderer();
// Try to unlock audio immediately: when the page was reached by clicking a
// channel tile, the browser carries that gesture across the navigation and
// this succeeds — sound works without ever touching the PC again.
audio.unlock();
// The workshop setup owns starting a round, after phones are paired.
game.paused = true;
// Hold the first fruit until the launch splash has fully faded: its throw
// whoosh under the loading banner read as a stray leftover menu sound.
game.state.nextSpawn = performance.now() + 1800;
requestAnimationFrame(frame);

// Exposed for the verification harness. `pointer` is slot 0's, kept for
// scripts written against the old single-player shape; `inputs` is the full
// per-slot map for multiplayer-aware verification.
window.__openwii = {
  startGame, pauseGame, resumeGame, setControllerState, configureRound, laneAim,
  startMatch({slot,seed,options,elapsed}) {
    game.playerNames = Array.isArray(options?.names) ? options.names : null;
    game.network=fruitMatch(game,slot,seed);
    resize();
    game.infiniteLives=options.practice;
    configureRound({splitScreen:true,durationSeconds:options.duration});
    game.network.simTime=performance.now()-elapsed;
    startGame(game.network.simTime);
  },
  matchFrame:()=>game.network?.snapshot(),
  receiveMatch(frame) {
    if(!game.network)return;
    const {score,lives}=game.state;
    game.network.receive(frame,performance.now());
    if(game.state.score!==score || game.state.lives!==lives){
      syncHud();
      if(game.state.phase==='over' && $('final')){
        const total=game.state.score,best=Math.max(total,Number(localStorage.getItem('fn.best')||0));
        localStorage.setItem('fn.best',String(best));
        const values=$('final').querySelectorAll('b');values[0].textContent=total;values[1].textContent=best;
      }
    }
  },
  game, pointer: inputFor(0).pointer, inputs, audio, link, bluetooth, toWorld, toScreen,
  scene, camera, renderer, meshes, splats, visuals, particleBatch,
  rendererWarmup,
  syncScene, drawTrail, pruneMeshes,
  fps: () => fps,
  frameMetrics, setSmoothing, smoothing:()=>smoothing,
  setBladeOnly, bladeOnly:()=>bladeOnly,
  setSmoothBlade, smoothBlade:()=>smoothBlade,
};
