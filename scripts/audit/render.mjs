// Render-load isolation. Fixtures exercise production mesh/effect creation;
// phone/network delay is deliberately excluded from these measurements.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import serverModule from '../../server/index.cjs';
import { browserOptions } from './browser-options.mjs';
const server = serverModule.createWorkshopServer();
await new Promise(resolve => server.servers[0].listen(0, '127.0.0.1', resolve));
let browser;
try {
  browser = await chromium.launch(browserOptions());
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type()==='error' && /Shader Error|VALIDATE_STATUS|shader.*compile/i.test(m.text())) errors.push(m.text()); });
  await page.goto(`http://127.0.0.1:${server.servers[0].address().port}/host`);
  await page.waitForFunction(() => window.__openwii);
  await page.click('#startPractice');
  await page.waitForFunction(() => !__openwii.game.paused && document.getElementById('setup').classList.contains('hide'));
  await page.mouse.move(960, 540); await page.mouse.down();
  await page.evaluate(async (measureGPU) => {
    const api = __openwii, g = api.game, { FRUIT_TYPES } = await import('/games/fruit-ninja/logic.js');
    g.paused = true; api.audio.muted = true;
    window.__stress = { gpu: [], queries: [], calls: [], build: [] };
    const gl = api.renderer.getContext(), ext = measureGPU ? gl.getExtension('EXT_disjoint_timer_query_webgl2') : null;
    __stress.gpuSupported = !!ext;
    const original = api.renderer.render.bind(api.renderer);
    api.renderer.render = (...args) => {
      if (ext && !gl.getParameter(ext.GPU_DISJOINT_EXT)) {
        for (let i = __stress.queries.length - 1; i >= 0; i--) {
          const q = __stress.queries[i];
          if (gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE)) {
            __stress.gpu.push(gl.getQueryParameter(q, gl.QUERY_RESULT) / 1e6);
            gl.deleteQuery(q); __stress.queries.splice(i, 1);
          }
        }
      }
      const q = ext && __stress.queries.length < 3 ? gl.createQuery() : null;
      if (q) gl.beginQuery(ext.TIME_ELAPSED_EXT, q);
      original(...args);
      if (q) { gl.endQuery(ext.TIME_ELAPSED_EXT); __stress.queries.push(q); }
      __stress.calls.push(api.renderer.info.render.calls);
    };
    const fruit = (i, bomb = false) => ({ id: 100000 + i, kind: FRUIT_TYPES[i % 8], bomb,
      x: (i % 8 - 3.5) * 1.55, y: (Math.floor(i / 8) % 5 - 2) * 1.45,
      r: .55, rot: i, spinAxis: { x: .3, y: .5, z: .2 }, vx: 0, vy: 0 });
    window.__load = config => {
      const start = performance.now();
      api.setBladeOnly(config.name === 'blade-only');
      g.fruits = []; g.halves = []; g.particles = [];
      api.syncScene(start + 10000); document.getElementById('fx').replaceChildren();
      for (let i = 0; i < config.fruit; i++) g.fruits.push(fruit(i));
      for (let i = 0; i < config.bombs; i++) g.fruits.push(fruit(config.fruit + i, true));
      for (let i = 0; i < config.slices; i++) {
        const f = fruit(80 + i); g.slice(f, i, start);
        g.onEvent({ type: 'slice', ...f, slot: i % 2, gained: 1, combo: i % 5 + 1 });
      }
      for (let i = 0; i < config.explosions; i++) {
        g.explode(fruit(100 + i, true));
        g.onEvent({ type: 'bomb', fatal: false, x: 0, y: 0, slot: 0 });
      }
      api.syncScene(start); __stress.build.push(performance.now() - start);
    };
    // Move the same blade throughout every fixture, independently of load.
    window.__bladePump = setInterval(() => {
      const e = new PointerEvent('pointermove', { clientX: 960 + 600 * Math.sin(performance.now() / 400), clientY: 540, pointerId: 1 });
      document.getElementById('game').dispatchEvent(e);
    }, 8);
  }, process.env.STRESS_GPU === '1');
  const cases = [
    { name: 'blade-only', fruit: 0, bombs: 0, slices: 0, explosions: 0 },
    { name: 'dense-fruit', fruit: 40, bombs: 0, slices: 0, explosions: 0 },
    { name: 'dense-bombs', fruit: 0, bombs: 24, slices: 0, explosions: 0 },
    { name: 'slice-vfx', fruit: 0, bombs: 0, slices: 12, explosions: 0 },
    { name: 'bomb-vfx', fruit: 0, bombs: 0, slices: 0, explosions: 4 },
    { name: 'mixed', fruit: 24, bombs: 6, slices: 12, explosions: 2 },
  ];
  const reports = [];
  for (const config of cases) {
    await page.evaluate(c => __load(c), config); await page.waitForTimeout(300);
    await page.evaluate(() => { __openwii.frameMetrics.clear(); __stress.gpu = []; __stress.calls = []; });
    await page.waitForTimeout(1500);
    const r = await page.evaluate(() => {
      const summary = values => { const a = [...values].sort((a,b) => a-b); return { count: a.length, p95: a[Math.ceil(a.length*.95)-1] ?? null, max: a.at(-1) ?? null }; };
      return { frames: __openwii.frameMetrics.snapshot(), gpuMs: summary(__stress.gpu), calls: summary(__stress.calls.length ? __stress.calls : [0]),
        fruit: __openwii.game.fruits.length, halves: __openwii.game.halves.length, particles: __openwii.game.particles.length,
        memory: { ...__openwii.renderer.info.memory }, buildMs: __stress.build.at(-1), gpuSupported: __stress.gpuSupported };
    });
    reports.push({ name: config.name, ...r });
    console.log(JSON.stringify({ name: config.name, fps: Math.round(r.frames.fps), cpuP95: r.frames.cpuWorkMs.p95, gpuP95: r.gpuMs.p95, calls: r.calls.p95, particles: r.particles, buildMs: r.buildMs }));
  }
  // Rapidly replenish real effects to catch allocation/DOM buildup spikes.
  await page.evaluate(() => { __stress.churnStart = performance.now(); __stress.build = []; __stress.churn = setInterval(() => __load({fruit:12,bombs:4,slices:4,explosions:1}), 200); __openwii.frameMetrics.clear(); __stress.calls=[]; });
  await page.waitForTimeout(2400);
  reports.push(await page.evaluate(() => { clearInterval(__stress.churn); const a=[...__stress.build].sort((a,b)=>a-b); return {name:'effect-churn',frames:__openwii.frameMetrics.snapshot(),buildP95:a[Math.ceil(a.length*.95)-1],memory:{...__openwii.renderer.info.memory},domEffects:document.querySelectorAll('.splash').length}; }));
  assert.equal(errors.length, 0, errors.join('\n'));
  const output = path.resolve('test-results', 'render-stress'); await fs.mkdir(output,{recursive:true});
  await page.screenshot({ path: path.join(output, 'mixed-effects.png') });
  await fs.writeFile(path.join(output, `${process.env.STRESS_LABEL || 'current'}.json`), JSON.stringify({ browser: await browser.version(), renderer: await page.evaluate(() => __airDiagnostics.report().renderer), note: 'Local renderer fixture, simulated blade, no phone or network measurement. GPU timings are optional asynchronous timer queries (STRESS_GPU=1).', reports }, null, 2));
} finally {
  await browser?.close(); await new Promise(resolve => server.io.close(resolve));
  for (const s of server.servers) if (s.listening) await new Promise(resolve => s.close(resolve));
}
