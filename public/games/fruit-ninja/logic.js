import { Trail, segmentDistance } from '../../core/trail.js';

/**
 * Fruit Ninja — pure game logic. No Three.js, no DOM.
 *
 * Kept renderer-free so the mechanics can be tested headlessly in Node instead
 * of by evaluating JavaScript inside a browser tab. `game.js` owns rendering
 * and drives an instance of this.
 *
 * Units are a virtual play field measured in world units, `FIELD_H` tall and
 * `FIELD_H * aspect` wide — not pixels. The 2D original scaled its physics off
 * the window size, which quietly changed how the game felt when you resized it.
 */

export const FIELD_H = 9;
export const GRAVITY = 18.75;          // world units/s², = the old 1500 px/s²
export const MIN_SLICE_SPEED = 3.25;   // world units/s, = the old 260 px/s
export const CRITICAL_CHANCE = 0.05;   // like the original: rare, +10, gold burst
export const BOMB_PENALTY = 10;        // practice mode: bombs cost points, not the run
export const MAX_ACTIVE_FRUIT = 24;
export const MAX_JUICE_PARTICLES = 256;
export const MAX_FRUIT_HALVES = 48;

/**
 * The classic line-up. `splat` is the juice that stains the dojo wall — it is
 * the flesh colour, not the rind: a watermelon splats red, a kiwi green.
 */
export const FRUIT_TYPES = [
  { name: 'watermelon', rind: 0x27691f, flesh: 0xf1373b, splat: 0xd92a35, r: 0.86 },
  { name: 'pineapple', rind: 0xd9a13b, flesh: 0xf7de74, splat: 0xf0c945, r: 0.74 },
  { name: 'strawberry', rind: 0xd8261f, flesh: 0xf7a9a0, splat: 0xd92a35, r: 0.58 },
  { name: 'orange', rind: 0xf28511, flesh: 0xffb840, splat: 0xff9a1f, r: 0.62 },
  { name: 'kiwi', rind: 0x7a5b39, flesh: 0x8cc63f, splat: 0x7fb832, r: 0.55 },
  { name: 'lemon', rind: 0xf5d321, flesh: 0xfbe97b, splat: 0xf2d93b, r: 0.58 },
  { name: 'apple', rind: 0x7bb92e, flesh: 0xf4f0d5, splat: 0xb9d152, r: 0.62 },
  { name: 'peach', rind: 0xf5923e, flesh: 0xfad089, splat: 0xf5a623, r: 0.65 },
];

const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

export class FruitNinja {
  constructor({ aspect = 16 / 9, onEvent = () => {}, infiniteLives = false, rng = Math.random } = {}) {
    this.h = FIELD_H;
    this.w = FIELD_H * aspect;
    this.onEvent = onEvent;
    this.infiniteLives = infiniteLives;   // practice: misses and bombs never end the run
    this.rng = rng;                        // injected so criticals are testable
    this.splitScreen = false;
    this.durationMs = 0;
    this.paused = false;
    this.pausedAt = null;

    this.state = {
      phase: 'idle',        // idle | playing | over
      score: 0,              // combined total across every player, for the HUD/back-compat
      lives: 3,               // one shared pool: everyone's on the same board
      combo: 0,               // mirrors whichever player most recently scored
      comboUntil: 0,
      nextSpawn: 0,
      startedAt: 0,
      remainingMs: 0,
    };

    this.fruits = [];
    this.halves = [];
    this.particles = [];
    // One board, sliced by up to MAX_PLAYERS blades — one per connected phone
    // (the server tags every packet with a `slot`; see server/index.cjs). Each slot
    // gets its own trail, so simultaneous swings never contaminate each
    // other's speed/segment history. Entries are created lazily by
    // `setCursor` and persist for the session (a reconnect keeps its slot's
    // running score), so this Map is never cleared, only reset in `start`.
    this.players = new Map();
  }

  setAspect(aspect) {
    this.w = this.h * aspect;
  }

  laneBounds(slot) {
    return this.splitScreen ? { min: slot === 0 ? -this.w / 2 : 0, max: slot === 0 ? 0 : this.w / 2 }
      : { min: -this.w / 2, max: this.w / 2 };
  }

  setSplitScreen(value) {
    value = !!value;
    if (value === this.splitScreen) return;
    this.splitScreen = value;
    for (const p of this.players.values()) { p.trail.clear(); p.cutting = false; p.cursor.active = false; }
    for (const f of this.fruits) f.lane = value ? (f.x < 0 ? 0 : 1) : undefined;
  }

  setDuration(seconds) {
    if (!Number.isFinite(seconds) || seconds < 0 || seconds > 3600) throw new Error('Invalid round duration.');
    this.durationMs = seconds * 1000;
  }

  pause(now) {
    if (this.paused) return;
    this.paused = true; this.pausedAt = now;
  }

  resume(now) {
    if (!this.paused) return;
    if (this.pausedAt !== null) {
      const elapsed = Math.max(0, now - this.pausedAt);
      for (const key of ['startedAt', 'nextSpawn', 'comboUntil']) this.state[key] += elapsed;
      for (const p of this.players.values()) p.comboUntil += elapsed;
    }
    this.paused = false; this.pausedAt = null;
  }

  /** Lazily create a player's per-slot state: trail, cursor, score, combo. */
  getPlayer(slot) {
    let p = this.players.get(slot);
    if (!p) {
      p = {
        slot,
        trail: new Trail({ lifetimeMs: 140, minStep: 0.004, speedWindowMs: 55 }),
        cursor: { x: 0, y: 0, active: false },
        score: 0,
        combo: 0,
        comboUntil: 0,
        lastActiveAt: -Infinity,
        cutting: false,
      };
      this.players.set(slot, p);
    }
    return p;
  }

  // Back-compat accessors for the common single-player case (tests, and any
  // renderer code that hasn't been made slot-aware) — slot 0's trail/cursor.
  get trail() { return this.getPlayer(0).trail; }
  get cursor() { return this.getPlayer(0).cursor; }

  /** A phone's blade position in world units. `slot` defaults to the lone
   *  single-player controller. */
  setCursor(x, y, now, slot = 0, { cutting = true, reset = false, captureAt = now } = {}) {
    const p = this.getPlayer(slot);
    if (reset) p.trail.clear();
    const bounds = this.laneBounds(slot);
    x = clamp(x, bounds.min, bounds.max);
    p.cursor.x = x;
    p.cursor.y = y;
    p.cursor.active = true;
    p.lastActiveAt = now;
    p.cutting = cutting;
    const queued = p.trail.segments.length;
    p.trail.push(x, y, captureAt, true);
    if (p.trail.segments.length > queued) {
      if (!cutting || p.trail.speed() <= MIN_SLICE_SPEED) p.trail.segments.pop();
      else p.trail.segments[queued].at = now;
    }
    if (p.trail.segments.length > 32) p.trail.segments.shift();
  }

  start(now) {
    this.paused = false; this.pausedAt = null;
    Object.assign(this.state, {
      phase: 'playing', score: 0, lives: 3, combo: 0, comboUntil: 0,
      startedAt: now, nextSpawn: now + 100,
      remainingMs: this.durationMs,
    });
    this.fruits.length = 0;
    this.spawnNumber = 0;
    this.halves.length = 0;
    this.particles.length = 0;
    // Fresh round for every player who's ever connected — scores and combos
    // reset, but the slot (and its blade colour) is kept, so nobody has to
    // reconnect between rounds.
    for (const p of this.players.values()) {
      p.score = 0;
      p.combo = 0;
      p.comboUntil = 0;
      p.trail.clear();
      p.cutting = false; p.cursor.active = false;
    }
    this.onEvent({ type: 'start' });
  }

  end(now, reason = 'lives') {
    if (this.state.phase === 'over') return;
    this.state.phase = 'over';
    this.onEvent({ type: 'gameover', score: this.state.score, reason });
  }

  spawn(isBomb, now, lane = 0) {
    // Skip an overcrowded wave instead of queueing it for a catch-up burst.
    if (!this.network && this.fruits.length >= MAX_ACTIVE_FRUIT) return false;
    const random = this.spawnRandom || Math.random;
    const rand = (a,b)=>a+(b-a)*random();
    const kind = FRUIT_TYPES[(random() * FRUIT_TYPES.length) | 0];
    const bounds = this.laneBounds(lane);
    const radius = isBomb ? 0.6 : kind.r;
    const inset = Math.min(radius + .1, (bounds.max - bounds.min) / 2);
    const x = this.splitScreen ? rand(bounds.min + inset, bounds.max - inset) : rand(-this.w * 0.38, this.w * 0.38);
    const center = (bounds.min + bounds.max) / 2;
    const rise = rand(this.h * 0.55, this.h * 0.88);
    this.fruits.push({
      x,
      y: -this.h / 2 - 0.8,
      vx: ((center - x) / 4) * rand(0.4, 1.1),
      vy: Math.sqrt(2 * GRAVITY * rise),
      r: isBomb ? 0.6 : kind.r,
      rot: rand(0, Math.PI * 2),
      spin: rand(-2.4, 2.4),
      spinAxis: { x: rand(-1, 1), y: rand(-1, 1), z: rand(-1, 1) },
      bomb: !!isBomb,
      kind,
      id: this.network ? -(++this.spawnNumber) : FruitNinja.nextId++,
      lane: this.splitScreen ? lane : undefined,
    });
    this.onEvent({ type: 'launch', bomb: !!isBomb });
    return true;
  }

  slice(f, angle, now) {
    const perp = angle + Math.PI / 2;
    for (const side of [-1, 1]) {
      this.halves.push({
        x: f.x, y: f.y,
        vx: f.vx + Math.cos(perp) * side * rand(1.2, 2.2),
        vy: f.vy + Math.sin(perp) * side * rand(1.2, 2.2) - 0.8,
        r: f.r,
        // `cut` is the fixed angle of the slice line; `tumble` accumulates
        // about it. Keeping them separate lets the renderer point the flat
        // face along the separation direction and still spin the half so the
        // exposed flesh turns toward the camera.
        cut: angle,
        tumble: 0,
        spin: side * rand(1.5, 4),
        side,
        kind: f.kind,
        id: FruitNinja.nextId++,
      });
    }
    for (let i = 0; i < 22; i += 1) {
      const a = angle + rand(-0.9, 0.9) + (Math.random() < 0.5 ? 0 : Math.PI);
      const s = rand(1, 6);
      this.particles.push({
        x: f.x, y: f.y,
        vx: Math.cos(a) * s, vy: Math.sin(a) * s + rand(0, 1.8),
        r: rand(0.03, 0.1), color: f.kind.splat, life: 1, decay: rand(0.7, 1.6),
        id: FruitNinja.nextId++,
      });
    }
    this.trimEffects();
  }

  explode(f) {
    for (let i = 0; i < 90; i += 1) {
      const a = rand(0, Math.PI * 2);
      const s = rand(1.5, 11);
      this.particles.push({
        x: f.x, y: f.y,
        vx: Math.cos(a) * s, vy: Math.sin(a) * s,
        r: rand(0.025, 0.11), color: Math.random() < 0.5 ? 0xffd166 : 0xff5f6d,
        life: 1, decay: rand(0.6, 1.4), id: FruitNinja.nextId++,
      });
    }
    this.trimEffects();
  }

  trimEffects() {
    // Only cosmetic debris is retired. New cuts, scores and bomb damage are
    // processed in full even when several players slice the same wave.
    if (this.particles.length > MAX_JUICE_PARTICLES) this.particles.splice(0, this.particles.length - MAX_JUICE_PARTICLES);
    if (this.halves.length > MAX_FRUIT_HALVES) this.halves.splice(0, this.halves.length - MAX_FRUIT_HALVES);
  }

  spawnInterval(now) {
    return Math.max(260, 780 - ((now - this.state.startedAt) / 1000) * 14);
  }

  bombChance(now) {
    return clamp(0.06 + ((now - this.state.startedAt) / 1000) * 0.003, 0, 0.25);
  }

  update(now, dt) {
    if (this.paused) return;
    this.stepDebris(dt);
    if (this.state.phase !== 'playing') return;
    this.state.remainingMs = Math.max(0, this.durationMs - (now - this.state.startedAt));
    if (this.durationMs && !this.state.remainingMs) { this.end(now, 'timer'); return; }

    while (now >= this.state.nextSpawn) {
      const at = this.network ? this.state.nextSpawn : now;
      const random = this.spawnRandom || Math.random;
      const roll = random();
      const burst = roll < 0.15 ? 4 : roll < 0.35 ? 3 : roll < 0.62 ? 2 : 1;
      for (let i = 0; i < burst; i += 1) {
        for (const lane of this.splitScreen ? [0, 1] : [0]) this.spawn(random() < this.bombChance(at), at, lane);
      }
      this.state.nextSpawn = at + this.spawnInterval(at);
    }

    const floor = -this.h / 2 - 1.2;

    // Consume each speed-qualified, measured segment once. Expire a queued
    // swing if the display stalls or the player leaves during delivery.
    const activeBlades = [];
    for (const p of this.players.values()) {
      const segments = p.trail.segments.splice(0).filter(segment => now - segment.at <= 100);
      if (this.network && p.slot !== this.network.slot) continue;
      if (segments.length) activeBlades.push({ player: p, segments });
    }

    for (let i = this.fruits.length - 1; i >= 0; i -= 1) {
      const f = this.fruits[i];
      f.vy -= GRAVITY * dt;
      f.x += f.vx * dt;
      f.y += f.vy * dt;
      f.rot += f.spin * dt;
      if (this.splitScreen) {
        f.lane ??= f.x < 0 ? 0 : 1;
        const bounds = this.laneBounds(f.lane), inset = Math.min(f.r, (bounds.max - bounds.min) / 2);
        const clampedX = clamp(f.x, bounds.min + inset, bounds.max - inset);
        if (clampedX !== f.x) f.vx *= -1;
        f.x = clampedX;
      }

      let cutBy = null;
      let cutSeg = null;
      for (const { player, segments } of activeBlades) {
        if (this.splitScreen && player.slot !== f.lane) continue;
        for (const s of segments) {
          if (segmentDistance(f.x, f.y, s.x1, s.y1, s.x2, s.y2) > f.r) continue;
          cutBy = player;
          cutSeg = s;
          break;
        }
        if (cutBy) break;
      }

      if (cutBy) {
        if(this.network)this.network.cut(f,cutSeg);
        this.fruits.splice(i, 1);
        if (f.bomb) {
          this.explode(f);
          if (this.infiniteLives) {
            // Practice: the blast costs points, not the run.
            this.state.score = Math.max(0, this.state.score - (this.network ? Math.min(cutBy.score,BOMB_PENALTY) : BOMB_PENALTY));
            cutBy.score = Math.max(0, cutBy.score - BOMB_PENALTY);
            cutBy.combo = 0;
            this.state.combo = 0;
            this.onEvent({ type: 'bomb', fatal: false, x: f.x, y: f.y, slot: cutBy.slot });
          } else {
            this.state.lives = Math.max(0,this.state.lives-1);
            cutBy.combo=0;this.state.combo=0;
            this.onEvent({ type: 'bomb', fatal: this.state.lives===0, lives:this.state.lives, x: f.x, y: f.y, slot: cutBy.slot });
            if(this.state.lives===0)this.end(now, 'bomb');
          }
        } else {
          this.slice(f, Math.atan2(cutSeg.y2 - cutSeg.y1, cutSeg.x2 - cutSeg.x1), now);
          cutBy.combo = now < cutBy.comboUntil ? cutBy.combo + 1 : 1;
          cutBy.comboUntil = now + 260;
          // Mirrored onto shared state for back-compat (single-player reads
          // state.combo directly) and so the HUD's combo banner always shows
          // whoever most recently extended a streak.
          this.state.combo = cutBy.combo;
          this.state.comboUntil = cutBy.comboUntil;
          const critical = this.rng() < CRITICAL_CHANCE;
          const gained = 1 + (cutBy.combo > 1 ? cutBy.combo : 0) + (critical ? 10 : 0);
          cutBy.score += gained;
          this.state.score += gained;
          this.onEvent({
            type: 'slice', combo: cutBy.combo, gained, critical,
            x: f.x, y: f.y, kind: f.kind, r: f.r, slot: cutBy.slot, playerScore: cutBy.score,
          });
        }
        if (this.state.phase === 'over') break;
        continue;
      }

      if (f.y + f.r < floor) {
        this.fruits.splice(i, 1);
        // Dropped fruit is ignored: no damage, miss cue or BLE haptic traffic.
      }
    }

    for (const p of this.players.values()) {
      if (p.combo > 1 && now >= p.comboUntil) p.combo = 0;
    }
    if (this.state.combo > 1 && now >= this.state.comboUntil) this.state.combo = 0;
  }

  stepDebris(dt) {
    const floor = -this.h / 2 - 2;
    for (let i = this.halves.length - 1; i >= 0; i -= 1) {
      const h = this.halves[i];
      h.vy -= GRAVITY * dt;
      h.x += h.vx * dt;
      h.y += h.vy * dt;
      h.tumble += h.spin * dt;
      if (h.y < floor) this.halves.splice(i, 1);
    }
    for (let i = this.particles.length - 1; i >= 0; i -= 1) {
      const p = this.particles[i];
      p.vy -= GRAVITY * 0.55 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= p.decay * dt;
      if (p.life <= 0) this.particles.splice(i, 1);
    }
  }
}

FruitNinja.nextId = 1;
