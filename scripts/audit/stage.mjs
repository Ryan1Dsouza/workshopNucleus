import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import serverModule from '../../server/index.cjs';
import { stage, features } from '../../public/stage.mjs';
import { browserOptions } from './browser-options.mjs';

const requested = process.argv[2] === undefined ? stage : Number(process.argv[2]);
assert.equal(requested, stage, 'Audit the current stage');
assert.ok(stage >= 1 && stage <= 7);
const output = path.resolve('test-results/stages');
await fs.mkdir(output, { recursive: true });
const server = serverModule.createWorkshopServer();
await new Promise(resolve => server.servers[0].listen(0, '127.0.0.1', resolve));
const origin = 'http://127.0.0.1:' + server.servers[0].address().port;
const errors = [], checks = [];
const pass = text => { checks.push(text); console.log('PASS ' + text); };
let browser;
try {
  const health = await fetch(origin + '/api/health').then(response => response.json());
  assert.equal(health.app, 'air-slice');
  browser = await chromium.launch(browserOptions());
  const context = await browser.newContext({ viewport: { width: 1366, height: 768 } });
  if (features.bluetooth) {
    const { installFakeBluetooth } = await import('../../tests/helpers/fake-bluetooth.mjs');
    await context.addInitScript(installFakeBluetooth);
  }
  const host = await context.newPage();
  host.on('pageerror', error => errors.push(error.message));
  await host.goto(origin + '/host');
  await host.waitForFunction(expected => Number(document.documentElement.dataset.stage) === expected, stage);
  assert.equal(await host.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  if (!features.game) {
    await host.waitForFunction(() => document.getElementById('serverNote').textContent.includes('Stage 1 is ready'));
    assert.equal(await host.evaluate(() => !!window.__openwii), false);
    assert.equal(await host.locator('.phones').isVisible(), false);
    pass('server and projector shell load without game, phone or WebGL dependencies');
  } else {
    await host.waitForFunction(() => window.__openwii);
    assert.equal(await host.locator('.phones').isVisible(), features.phone);
    assert.equal(await host.locator('#bluetooth0').isVisible(), features.bluetooth);
    assert.equal(await host.locator('#motionCheck').isVisible(), features.diagnostics);
    await host.click('#startPractice');
    await host.evaluate(() => { __openwii.game.state.nextSpawn = Infinity; __openwii.game.rng = () => 1; });
    const fruit = async () => host.evaluate(async () => {
      const { FRUIT_TYPES } = await import('/games/fruit-ninja/logic.js');
      const g = __openwii.game;
      g.fruits = [{ id: 80001, x: 0, y: 0, vx: 0, vy: 0, r: .62, rot: 0, spin: 0, spinAxis: { x: 1, y: 0, z: 0 }, kind: FRUIT_TYPES[3] }];
    });
    await host.mouse.move(500, 384);
    await host.mouse.down();
    await fruit();
    const mouseScore = await host.evaluate(() => __openwii.game.state.score);
    await host.mouse.move(866, 384, { steps: 12 });
    await host.mouse.up();
    await host.waitForFunction(previous => __openwii.game.state.score > previous, mouseScore);
    await host.evaluate(() => { __openwii.game.fruits = []; });
    pass('the actual 3D game starts and a mouse drag slices fruit');

    if (features.phone) {
      const phones = [];
      for (let slot = 0; slot < features.players; slot++) {
        const phoneContext = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
        await phoneContext.addInitScript(() => {
          window.DeviceOrientationEvent ??= class {};
          window.DeviceMotionEvent ??= class {};
          DeviceOrientationEvent.requestPermission = DeviceMotionEvent.requestPermission = () => Promise.resolve('granted');
        });
        const phone = await phoneContext.newPage();
        phone.on('pageerror', error => errors.push(error.message));
        const join = new URL(await host.locator('#join' + slot).getAttribute('href'));
        await phone.goto(origin + join.pathname + join.search);
        await phone.tap('#enable');
        await phone.evaluate(slot => {
          window.__pose = { alpha: 0, beta: 0, gamma: slot === 1 ? 90 : 0 };
          window.__rate = 0;
          window.__pump = setInterval(() => {
            const m = new Event('devicemotion'); Object.assign(m, { rotationRate: { alpha: __rate, beta: 0, gamma: 0 } }); dispatchEvent(m);
            const o = new Event('deviceorientation'); Object.assign(o, __pose); dispatchEvent(o);
          }, 16);
        }, slot);
        await host.waitForFunction(slot => __openwii.inputs.get(slot)?.pointer.live, slot);
        if (features.direct) await host.waitForFunction(slot => [...__openwii.link.peers.values()].some(peer => peer.slot === slot && peer.motion?.readyState === 'open'), slot);
        else assert.match(await host.locator('#networkNote').textContent(), /server relay/i);
        phones.push(phone);
      }
      const setPose = async (phone, angle, rate = 0) => { await phone.evaluate(value => { __pose.alpha = value.angle; __rate = value.rate; }, { angle, rate }); await phone.waitForTimeout(90); };
      const aim = async (slot, x, tolerance = 1e-5) => host.waitForFunction(({ slot, x, tolerance }) => Math.abs(__openwii.inputs.get(slot).pointer.position.x - x) < tolerance, { slot, x, tolerance });

      for (const [slot, phone] of phones.entries()) {
        await setPose(phone, 12, 120);
        await phone.tap('#recenter'); await aim(slot, .5);
        await setPose(phone, 13, 30); await aim(slot, .5 - 1 / 60);
        await phone.locator('#recenter').focus(); await phone.keyboard.press('Enter'); await aim(slot, .5);
        await setPose(phone, 13.5, 30); await aim(slot, .5 - .5 / 60);
        await phone.locator('#recenter').focus(); await phone.keyboard.press('Space'); await aim(slot, .5);
        await phone.evaluate(() => {
          window.__originalCommand = __airRemote.link.command.bind(__airRemote.link);
          __airRemote.link.command = command => command.type === 'recentre' ? setTimeout(() => __originalCommand(command), 150) : __originalCommand(command);
        });
        await phone.tap('#recenter'); await setPose(phone, 14.5, 60);
        await phone.waitForTimeout(200); await aim(slot, .5 - 1 / 60);
        await phone.evaluate(() => { __airRemote.link.command = __originalCommand; });
        await setPose(phone, 0); await phone.tap('#recenter'); await aim(slot, .5);
        await setPose(phone, 6, 180); await aim(slot, .4);
        await fruit(); const before = await host.evaluate(() => __openwii.game.state.score);
        await setPose(phone, -6, 180);
        await host.waitForFunction(previous => __openwii.game.state.score > previous, before);
        await host.evaluate(() => { __openwii.game.fruits = []; });
      }
      pass('Center blade works with touch, Enter and Space; a delayed command preserves the captured grip');
      pass(features.direct ? 'two players pair directly over WebRTC and both physical sweeps score' : 'one phone pairs and slices over the explicitly labeled server relay');
      assert.equal(await host.evaluate(() => [...__openwii.link.peers.values()].every(peer => !!peer.pc)), features.direct);

      if (features.diagnostics) {
        await host.click('#back');
        await host.locator('#motionCheck').evaluate(element => { element.open = true; });
        await host.selectOption('#smoothing', 'light');
        assert.equal(await host.evaluate(() => __airDiagnostics.report().tracking), 'one-euro');
        await host.check('#smoothBlade');
        assert.equal(await host.evaluate(() => __airDiagnostics.report().bladeDisplay), 'interpolated');
        await host.waitForTimeout(1100);
        const report = await host.evaluate(() => __airDiagnostics.report());
        assert.equal(report.transport.peers.length, features.players);
        assert.ok(report.frames.fps > 0);
        await host.selectOption('#smoothing', 'off'); await host.uncheck('#smoothBlade');
        await host.click('#startBladeCheck');
        assert.equal(await host.evaluate(() => __openwii.bladeOnly()), true);
        await host.click('#bladeOnlyToggle');
        assert.equal(await host.evaluate(() => __openwii.bladeOnly()), false);
        pass('diagnostics, filtering, visual smoothing and blade-only controls work in the browser');
      }
      if (features.bluetooth) {
        await host.click('#back');
        await host.evaluate(() => { __fakeBle.next = 0; });
        await host.click('#bluetooth0');
        await host.waitForFunction(() => __openwii.bluetooth.connected(0));
        for (const motionFirst of [false, true]) {
          await host.evaluate(motionFirst => {
            const phone = __fakeBle.phones[0];
            phone.pose(0); phone.pose(12, 90); phone.center(12, motionFirst);
          }, motionFirst);
          await aim(0, .5 - 1 / 60, .0001);
        }
        assert.equal(await host.evaluate(() => __fakeBle.phones[0].motion.listeners.size), 1);
        pass('native Center blade preserves its anchor with command-first and motion-first GATT delivery');
      }
    }
    await host.evaluate(() => __openwii.pauseGame());
    await host.screenshot({ path: path.join(output, 'stage-' + stage + '.png') });
  }
  if (!features.game) await host.screenshot({ path: path.join(output, 'stage-' + stage + '.png') });
  assert.deepEqual(errors, []);
  await fs.writeFile(path.join(output, 'stage-' + stage + '.json'), JSON.stringify({ stage, checks, errors,
    note: 'Browser sensor and GATT data are simulated. Physical-device performance is a separate workshop check.' }, null, 2));
  console.log('Stage ' + stage + ' audit passed.');
} finally {
  await browser?.close();
  await new Promise(resolve => server.io.close(resolve));
}
