import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Race, FIXED_DT as dt, topSpeed} from '../public/games/mario-kart/logic.js';
import {
  CURB_OUTER, SECTIONS, TRACK_LENGTH, WALL_HALF, angle, project, surfaceAt, trackAt,
} from '../public/games/mario-kart/track.js';
import {kartFootprint} from '../public/games/mario-kart/kart-contact.js';

function place(s, lateral, speed = 36, yaw = 0) {
  const race = new Race(), r = race.player, p = surfaceAt(s, lateral);
  Object.assign(r, {
    x: p.x, y: p.y, z: p.z, heading: p.heading + yaw, s, progress: s, lateral, speed,
  });
  return race;
}

test('inside and outside curb and rail edges advance continuously around the lap seam and hairpins', () => {
  for (const lateral of [-WALL_HALF - 0.3, -CURB_OUTER, CURB_OUTER, WALL_HALF + 0.3]) {
    const step = 0.25;
    for (let s = 0; s < TRACK_LENGTH; s += step) {
      const a = surfaceAt(s, lateral), b = surfaceAt(s + step, lateral);
      const forward = (b.x - a.x) * a.tx + (b.z - a.z) * a.tz;
      assert.ok(forward > 0, `edge at ${lateral} m folds at station ${s}`);
    }
  }
});

test('paved shoulders and striped or plain curbs retain road speed on both sides', () => {
  for (const side of [-1, 1]) {
    for (const [s, width] of [[8, 12], [8, 10.6], [SECTIONS.grassStart + 6, 10.6], [SECTIONS.glideEnd + 6, 10.6]]) {
      const race = place(s, side * width), r = race.player;
      for (let i = 0; i < 24; i++) race.move(r, {gas: true}, dt);
      assert.equal(r.speed, topSpeed());
    }
  }
});

test('grass and sand slow the kart progressively and respect boost', () => {
  for (const s of [SECTIONS.grassStart + 8, SECTIONS.glideEnd + 6]) {
    const race = place(s, 12.2), r = race.player;
    race.move(r, {gas: true}, dt);
    assert.ok(r.speed < topSpeed() && r.speed >= topSpeed() - 36 * dt);
    for (let i = 0; i < 75; i++) race.move(r, {gas: true}, dt);
    assert.equal(r.speed, topSpeed() * 0.43);
    r.boost = 1;
    race.move(r, {gas: true}, dt);
    assert.ok(r.speed > topSpeed() * 0.43);
  }
});

test('full throttle can graze either rail and steer back across the curb', () => {
  for (const side of [-1, 1]) {
    const race = place(8, side * 9.4), r = race.player;
    for (let i = 0; i < 200; i++) {
      race.move(r, {gas: true, steer: side}, dt);
      for (const corner of kartFootprint(r)) {
        assert.ok(Math.abs(project(corner.x, corner.z, r.s).lateral) <= WALL_HALF - 0.3 + 0.02);
      }
    }
    assert.ok(r.lateral * side > 12.5 && r.speed > 35);
    for (let i = 0; i < 80; i++) race.move(r, {gas: true, steer: -side}, dt);
    assert.ok(Math.abs(r.lateral) < 8 && r.progress - 8 > 70);
  }
});

test('rail contact preserves signed tangential speed and dissipates a head-on impact', () => {
  for (const side of [-1, 1]) {
    for (const [speed, yaw] of [[30, 0.22], [-9, -0.22], [30, Math.PI - 0.22], [30, 1.53]]) {
      const race = place(48, side * 13.1, speed, side * yaw), r = race.player;
      race.move(r, {}, dt);
      const tangent = trackAt(r.s).heading;
      const expected = Math.sign(speed) * (Math.abs(speed) - 5.5 * dt) * Math.abs(Math.cos(yaw));
      assert.ok(Math.abs(r.speed - expected) < 0.15);
      assert.ok(Math.abs(Math.sin(angle(r.heading - tangent))) < 0.001);
    }
  }
});
