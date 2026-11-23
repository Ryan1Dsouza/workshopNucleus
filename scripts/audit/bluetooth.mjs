import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import serverModule from '../../server/index.cjs';
import { installFakeBluetooth } from '../../tests/helpers/fake-bluetooth.mjs';
import { browserOptions } from './browser-options.mjs';

const server = serverModule.createWorkshopServer();
await new Promise(resolve => server.servers[0].listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.servers[0].address().port}`;
const output = path.resolve('test-results/bluetooth'); await fs.mkdir(output, { recursive: true });
let browser; const errors = [], checks = [];
const pass = text => { checks.push(text); console.log(`PASS ${text}`); };
try {
  browser = await chromium.launch(browserOptions());
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  await context.addInitScript(installFakeBluetooth);
  const host = await context.newPage(); host.on('pageerror', e => errors.push(e.message));
  await host.goto(origin + '/host'); await host.waitForFunction(() => window.__openwii && window.__airDiagnostics);
  for (const slot of [0, 1]) {
    await host.evaluate(slot => { __fakeBle.next = slot; }, slot);
    await host.click('#bluetooth' + slot);
    await host.waitForFunction(slot => __openwii.bluetooth.connected(slot), slot);
  }
  await host.click('#startPractice');
  assert.equal(await host.evaluate(()=>__openwii.smoothBlade()),true);
  assert.equal(await host.locator('#smoothBlade').isChecked(),true);
  const pose = async (slot, angle, speed = 0, active = true) => {
    await host.evaluate(v => __fakeBle.phones[v.slot].pose(v.angle, v.speed, v.active), { slot, angle, speed, active });
    await host.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  };
  await host.evaluate(() => { __openwii.game.state.nextSpawn = Infinity; __openwii.game.rng=()=>1; });
  for (const slot of [0, 1]) { await pose(slot, 0); await pose(slot, 1, 60); }
  const aimed = await host.evaluate(() => [...__openwii.inputs.values()].map(i => i.pointer.position.x));
  for (const x of aimed) assert.ok(Math.abs(x - (.5 - 1 / 60)) < .00005, `Nonproportional BLE aim: ${x}`);
  pass('two Bluetooth players move proportionally from native quaternion notifications');
  const sourceIsolation = await host.evaluate(() => {
    const before = { ...__openwii.inputs.get(0).pointer.position };
    const callbacks = __openwii.link.handlers;
    callbacks.onSample({ alpha: 80, beta: 0, gamma: 0, session: 'wifi', epoch: 5, t: 9000 }, 0);
    callbacks.onCommand({ type: 'recentre' }, 0); callbacks.onReset(0);
    callbacks.onPresence({ slots: [{ slot: 0, occupied: false }, { slot: 1, occupied: false }] });
    return { before, after: { ...__openwii.inputs.get(0).pointer.position }, session: __openwii.inputs.get(0).session };
  });
  assert.deepEqual(sourceIsolation.before, sourceIsolation.after); assert.match(sourceIsolation.session, /^ble:/);
  pass('Wi-Fi samples, commands, departure and resets cannot overwrite a Bluetooth-owned player');
  await host.waitForTimeout(300);
  assert.deepEqual(await host.evaluate(() => [...__openwii.inputs.values()].map(i => i.pointer.position.x)), aimed);
  assert.equal(await host.evaluate(() => [...__openwii.visuals.values()].every(v => !v.screen.element.hidden)), true);
  assert.equal(await host.evaluate(() => __airDiagnostics.report().transport.peers.every(p => p.deliveredCaptureHz === 0)), true);
  pass('idle holding keeps both tips visible, without inventing poses or movement');
  const fluid=await host.evaluate(async()=>{
    const api=__openwii,phone=__fakeBle.phones[0],inp=api.inputs.get(0),visual=api.visuals.get(0);
    phone.epoch++;phone.time=1000000+performance.now()-16;phone.pose(0);
    await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
    phone.time=1000000+performance.now()-16;phone.pose(1,60);
    const measured=inp.pointer.position.x,first=visual.screen.position.x;
    const frames=[];const start=performance.now();
    await new Promise(resolve=>{const sample=now=>{frames.push(visual.screen.position.x);if(now-start<100)requestAnimationFrame(sample);else resolve();};requestAnimationFrame(sample);});
    return {first,measured,frames,final:visual.screen.position.x};
  });
  assert.ok(fluid.first>fluid.measured,'smooth dot jumped on packet arrival');
  assert.ok(fluid.frames.some(x=>x>fluid.measured+1e-5&&x<fluid.first-1e-5),'dot never drew an intermediate position');
  assert.ok(Math.abs(fluid.final-fluid.measured)<1e-8,'dot did not settle at the measured endpoint');
  assert.ok(fluid.frames.every(x=>x>=fluid.measured-1e-8&&x<=fluid.first+1e-8),'display overshot the measured sweep');
  pass('Bluetooth enables fluid frame interpolation automatically, without changing measured aim or overshooting');
  for (const slot of [0, 1]) {
    await host.evaluate(slot => { __fakeBle.phones[slot].epoch++; __fakeBle.phones[slot].control.emit([2]); }, slot);
    await pose(slot, 0); await pose(slot, 6, 180);
    await host.evaluate(async () => {
      const { FRUIT_TYPES } = await import('/games/fruit-ninja/logic.js'); const g = __openwii.game;
      g.fruits = [{ id: 99001, x: 0, y: 0, vx: 0, vy: 0, r: .62, rot: 0, spin: 0, spinAxis: { x: 1, y: 0, z: 0 }, kind: FRUIT_TYPES[3] }];
    });
    const before = await host.evaluate(() => __openwii.game.state.score);
    // Quiet aim correction crosses a fruit without arming the blade.
    await pose(slot, -6, 0);
    assert.equal(await host.evaluate(() => __openwii.game.state.score), before);
    await pose(slot, 6, 180);
    const cutState = await host.evaluate(slot => {const g=__openwii.game,p=g.getPlayer(slot),i=__openwii.inputs.get(slot);return {score:g.state.score,paused:g.paused,phase:g.state.phase,hidden:document.hidden,fruits:g.fruits.map(f=>({x:f.x,y:f.y})),cursor:p.cursor,cutting:p.cutting,trail:p.trail.points,pointer:i.pointer.position,gyro:i.pointer.hasGyro,pending:i.pointer.pending};},slot);
    assert.equal(cutState.score, before + 1, JSON.stringify(cutState));
    await host.evaluate(async () => {
      const { FRUIT_TYPES } = await import('/games/fruit-ninja/logic.js'); const g = __openwii.game;
      g.fruits = [{ id: 99002, x: 0, y: 0, vx: 0, vy: 0, r: .62, rot: 0, spin: 0, spinAxis: { x: 1, y: 0, z: 0 }, kind: FRUIT_TYPES[3] }];
    });
    await pose(slot, 6, 0, false); await pose(slot, -6, 180);
    assert.equal(await host.evaluate(() => __openwii.game.state.score), before + 1);
    await host.evaluate(slot => { __fakeBle.phones[slot].epoch++; __fakeBle.phones[slot].control.emit([2]); }, slot);
    await pose(slot, 0, 180);
    assert.equal(await host.evaluate(() => __openwii.game.state.score), before + 1);
    await host.evaluate(() => { __openwii.game.fruits = []; });
  }
  pass('both players slice on physical sweeps; quiet correction, suspend, resume and recenter do not auto-cut');
  await host.evaluate(()=>__openwii.setSmoothBlade(false));
  await host.evaluate(() => __fakeBle.phones[0].gatt.disconnect());
  await host.waitForFunction(() => __openwii.bluetooth.connected(0)); await pose(0, 0);
  assert.equal(await host.evaluate(() => __fakeBle.phones[0].motion.listeners.size), 1);
  assert.equal(await host.evaluate(()=>__openwii.smoothBlade()),false);
  assert.equal(await host.locator('#smoothBlade').isChecked(),false);
  await host.evaluate(() => __openwii.bluetooth.disconnect(1));
  await host.waitForFunction(() => !__openwii.game.getPlayer(1).cursor.active);
  pass('automatic reconnect retains one listener; player departure removes only that blade');
  await host.click('#back'); await host.locator('#motionCheck').evaluate(e => { e.open = true; });
  await pose(0, 1); await host.waitForTimeout(1100);
  assert.match(await host.locator('#motionStats').textContent(), /Bluetooth/);
  await host.click('#resetMotionReport');
  assert.equal(await host.evaluate(() => __airDiagnostics.report().transport.peers[0].received), 0);
  for (const size of [{ width: 1920, height: 1080 }, { width: 1366, height: 768 }, { width: 390, height: 844 }]) {
    await host.setViewportSize(size);
    assert.equal(await host.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await host.screenshot({ path: path.join(output, `setup-${size.width}.png`) });
    await host.locator('#motionCheck').evaluate(e => { e.open = false; });
    await host.locator('#setup').evaluate(e => { e.scrollTop = 0; });
    if(size.width>620)assert.ok(await host.locator('#startPractice').evaluate(e=>e.getBoundingClientRect().bottom<=innerHeight),'Play controls are below the laptop viewport');
    await host.screenshot({path:path.join(output,`pairing-${size.width}.png`)});
    await host.locator('#motionCheck').evaluate(e => { e.open = true; });
  }
  pass('Bluetooth diagnostics reset correctly; setup fits projector, laptop and mobile widths');
  await host.setViewportSize({width:1920,height:1080});
  const effect=await host.evaluate(async()=>{
    const {ScreenBlade}=await import('/core/screen-blade.js');
    __openwii.pauseGame();document.getElementById('setup').classList.add('hide');document.getElementById('hud').style.display='none';
    const layer=document.createElement('div');layer.style.cssText='position:fixed;inset:0;pointer-events:none;z-index:3;overflow:hidden';document.body.appendChild(layer);
    const fixtures=[];
    for(const [slot,xy]of [
      [[380,380],[430,410],[490,430],[550,430],[615,400],[670,350],[725,300]],
      [[1000,620],[1080,610],[1160,590],[1240,540],[1160,590],[1080,650],[1000,690]],
    ].entries()){
      const screen=new ScreenBlade(layer,{core:0xffffff,glow:slot?0xff9399:0x7ccfff},slot);
      const points=xy.map(([x,y],i)=>({x,y,t:1000+i*16})),now=points.at(-1).t;
      const last=points.at(-1);screen.aim({x:last.x/innerWidth,y:last.y/innerHeight},true);
      screen.trail(points,(x,y)=>({x,y}),innerHeight,innerWidth,now);
      fixtures.push({screen,points,now});
    }
    window.__bladeFixture={layer,fixtures};
    return fixtures.map(({screen})=>({d:screen.paths[1].getAttribute('d'),tip:screen.position,pathCount:screen.paths.length}));
  });
  for(const e of effect){assert.match(e.d,/ Q/);assert.match(e.d,/ A7\.00,7\.00/);assert.doesNotMatch(e.d,/NaN|Infinity/);assert.equal(e.pathCount,2);}
  assert.equal((effect[1].d.match(/M/g)||[]).length,2);
  await host.screenshot({path:path.join(output,'blade-vfx.png')});
  const faded=await host.evaluate(()=>__bladeFixture.fixtures.map(({screen,points,now})=>{
    const tip={...screen.position};screen.trail(points,(x,y)=>({x,y}),innerHeight,innerWidth,now+80);
    return {tipHeld:JSON.stringify(tip)===JSON.stringify(screen.position),opacity:Number(screen.paths[1].getAttribute('opacity'))};
  }));
  assert.ok(faded.every(f=>f.tipHeld&&f.opacity>0&&f.opacity<.9));
  await host.screenshot({path:path.join(output,'blade-vfx-fading.png')});
  await host.evaluate(()=>{__bladeFixture.layer.remove();document.getElementById('hud').style.display='';});
  pass('blade VFX has rounded curves/caps, splits return strokes and fades without moving its tip');
  assert.equal(errors.length, 0, errors.join('\n'));
  await fs.writeFile(path.join(output, 'results.json'), JSON.stringify({ simulatedBluetooth: true, checks, errors }, null, 2));
} finally { await browser?.close(); await new Promise(resolve => server.io.close(resolve)); }
