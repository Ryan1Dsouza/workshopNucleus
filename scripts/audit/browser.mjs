// Portable checks + a real Chrome DevTools Protocol trace. All sensor readings
// below are simulated; physical phone latency is deliberately not inferred.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium, firefox, webkit } from 'playwright';
import serverModule from '../../server/index.cjs';
import { browserOptions } from './browser-options.mjs';
const engine=process.env.AUDIT_BROWSER || 'chromium', engines={chromium,firefox,webkit};
if(!engines[engine])throw new Error('AUDIT_BROWSER must be chromium, firefox or webkit');
const output=path.resolve('test-results',engine);await fs.mkdir(output,{recursive:true});
const server=serverModule.createWorkshopServer();
await new Promise(resolve=>server.servers[0].listen(0,'127.0.0.1',resolve));
const origin=`http://127.0.0.1:${server.servers[0].address().port}`;
let browser;const errors=[],checks=[],reports={};
const check=text=>{checks.push(text);console.log(`PASS ${text}`);};
try {
  browser=await engines[engine].launch(browserOptions(engine));
  const makeContext=async(phone=false,relay=false)=>{
    const c=await browser.newContext({viewport:phone?{width:390,height:844}:{width:1920,height:1080}});
    c.setDefaultTimeout(15000);c.on('page',p=>p.on('pageerror',e=>errors.push(e.message)));
    await c.addInitScript(relay=>{
      window.DeviceOrientationEvent??=class{};window.DeviceMotionEvent??=class{};
      DeviceOrientationEvent.requestPermission=DeviceMotionEvent.requestPermission=()=>Promise.resolve('granted');
      if(relay)window.RTCPeerConnection=undefined;
    },relay);return c;
  };
  const host=await(await makeContext()).newPage();await host.goto(origin+'/host');
  await host.waitForFunction(()=>window.__airDiagnostics?.report());
  const phones=[];
  for(const slot of [0,1]){
    const p=await(await makeContext(true)).newPage(),url=new URL(await host.locator('#join'+slot).getAttribute('href'));
    await p.goto(origin+url.pathname+url.search);await p.click('#enable');
    await p.evaluate(slot=>{
      window.__pose={alpha:0,beta:0,gamma:slot===1?90:0};window.__rate=0;window.__animated=false;window.__count=0;
      window.__emit=()=>{
        __count++;if(__animated){__pose.alpha=12*Math.sin(__count*.012);__rate=150*Math.cos(__count*.012);}
        const m=new Event('devicemotion');Object.assign(m,{rotationRate:{alpha:__rate,beta:0,gamma:0},acceleration:null});dispatchEvent(m);
        if(__count%2===0){const o=new Event('deviceorientation');Object.assign(o,__pose);dispatchEvent(o);}
      };window.__pump=setInterval(__emit,8);__emit();__emit();
    },slot);phones.push(p);
  }
  await host.waitForFunction(()=>__openwii.inputs.size===2&&[...__openwii.inputs.values()].every(i=>i.pointer.live)&&[...__openwii.link.peers.values()].every(p=>p.motion?.readyState==='open'));
  await host.click('#startPractice');check('two independent phone sessions pair over direct WebRTC');
  // Initial shader/connection work can already trigger a legitimate recovery.
  // Inject this stall only after that recovery's production cooldown expires.
  await phones[0].waitForFunction(()=>performance.now()-__airRemote.link.lastRecovery>=15000&&[...__airRemote.link.peers.values()].some(p=>p.motion?.readyState==='open'&&p.motion.bufferedAmount===0),null,{timeout:20000});
  await phones[0].evaluate(()=>{
    const link=__airRemote.link,c=[...link.peers.values()][0].motion;
    window.__previousSession=link.socket.id;
    window.__previousRecoveries=link.reconnects;
    Object.defineProperty(c,'bufferedAmount',{configurable:true,get:()=>8192});
  });
  await phones[0].waitForFunction(()=>__airRemote.link.reconnects===__previousRecoveries+1&&__airRemote.link.socket.id!==__previousSession&&[...__airRemote.link.peers.values()].some(p=>p.motion?.readyState==='open'));
  await host.waitForFunction(()=>[...__openwii.inputs.values()].every(i=>i.pointer.live));
  check('an open-but-jammed motion channel reconnects automatically and resumes fresh phone input');
  await phones[0].waitForTimeout(1200);
  const staleCheck=await host.evaluate(()=>{
    const link=__openwii.link,p=[...link.peers.values()].find(p=>p.slot===0);
    const previous=p.staleDropped,position={...__openwii.inputs.get(0).pointer.position};
    const t=performance.now()+p.clock.offset-1000;
    link.receive({alpha:90,beta:0,gamma:0,t,poseT:t,sequence:p.lastSequence+1,motion:{rx:0,ry:0,rz:200},motionAge:0},0,p.id);
    return {clockReady:p.clock.offset!==null,dropped:p.staleDropped===previous+1,held:JSON.stringify(position)===JSON.stringify(__openwii.inputs.get(0).pointer.position)};
  });
  assert(staleCheck.clockReady&&staleCheck.dropped&&staleCheck.held,'a delayed old pose moved the blade');
  check('clock-aligned stale input is discarded without moving or cutting the blade');
  const session=await phones[0].evaluate(()=>__airRemote.link.socket.id);
  await phones[0].click('#resetConnection');
  await phones[0].waitForFunction(previous=>__airRemote.link.socket.id!==previous&&[...__airRemote.link.peers.values()].some(p=>p.motion?.readyState==='open'),session);
  await host.waitForFunction(()=>[...__openwii.inputs.values()].every(i=>i.pointer.live));
  check('the phone reset control reconnects without losing its room or player slot');
  const pose=async(p,alpha,rate=0,beta=0)=>{await p.evaluate(v=>{Object.assign(__pose,{alpha:v.alpha,beta:v.beta});__rate=v.rate;__emit();__emit();},{alpha,rate,beta});await p.waitForTimeout(90);};
  for(const [slot,p] of phones.entries()){
    await p.evaluate(()=>{__emit();__emit();});
    await p.click('#recenter');await p.waitForTimeout(70);await pose(p,.5,30);
    await host.waitForFunction(slot=>Math.abs(__openwii.inputs.get(slot).pointer.position.x-(.5-.5/60))<1e-5,slot);
    await pose(p,1,30);
    assert(Math.abs(await host.evaluate(slot=>__openwii.inputs.get(slot).pointer.position.x,slot)-(.5-1/60))<1e-5);
    await pose(p,1,0);const held=await host.evaluate(slot=>({...__openwii.inputs.get(slot).pointer.position}),slot);
    await p.waitForTimeout(300);assert.deepEqual(await host.evaluate(slot=>({...__openwii.inputs.get(slot).pointer.position}),slot),held);
  }
  check('flat and sideways grips keep small turns proportional and held aim stationary');
  // Isolate render load with the real scene. Repeated bomb/half creation must
  // reuse geometry and leave the lighting shader configuration unchanged.
  const renderCheck = await host.evaluate(async () => {
    const api = __openwii, g = api.game;
    const { FRUIT_TYPES } = await import('/games/fruit-ninja/logic.js');
    g.paused = true;
    const fill = () => {
      g.fruits = [{ id: 90001, x: 0, y: 0, r: .7, rot: 0, spinAxis: { x: 1, y: 0, z: 0 }, bomb: true }];
      g.halves = [{ id: 90002, x: 1, y: 0, r: .7, cut: 0, side: 1, tumble: 0, kind: FRUIT_TYPES[3] }];
      g.particles = [{ id: 90003, x: 0, y: 1, r: .08, color: 0xff5f6d, life: .25 }];
      api.syncScene(); api.renderer.render(api.scene, api.camera);
    };
    const empty = () => { g.fruits = []; g.halves = []; g.particles = []; api.syncScene(); api.renderer.render(api.scene, api.camera); };
    fill(); empty();
    const geometries = api.renderer.info.memory.geometries, programs = api.renderer.info.programs.length;
    for (let n = 0; n < 30; n++) { fill(); empty(); }
    const stable = api.renderer.info.memory.geometries === geometries && api.renderer.info.programs.length === programs;
    fill();
    const normalCalls = api.renderer.info.render.calls;
    const state = JSON.stringify({ fruits: g.fruits, halves: g.halves, score: g.state.score });
    api.setBladeOnly(true); api.syncScene(); api.renderer.render(api.scene, api.camera);
    const checkCalls = api.renderer.info.render.calls;
    const hidden = [...api.meshes.values()].every(m => !m.visible) && !api.particleBatch.visible;
    api.setBladeOnly(false); api.syncScene();
    const restored = [...api.meshes.values()].every(m => m.visible) && api.particleBatch.visible && state === JSON.stringify({ fruits: g.fruits, halves: g.halves, score: g.state.score });
    const particleFade = api.particleBatch.count === 1 && api.particleBatch.geometry.attributes.particleAlpha.getX(0) === .25;
    // A simultaneous wave must keep all feedback while avoiding one audio
    // synthesis and DOM animation per fruit/bomb on the same frame.
    const play = api.audio.play.bind(api.audio), cues = [];
    api.audio.play = name => cues.push(name);
    document.getElementById('fx').replaceChildren();
    for (let n = 0; n < 24; n++) {
      g.onEvent({type:'launch'});
      g.onEvent({type:'slice',x:0,y:0,r:.6,kind:FRUIT_TYPES[3],combo:1,gained:1,slot:0});
      g.onEvent({type:'bomb',fatal:false,x:0,y:0,slot:0});
    }
    const bounded = document.querySelectorAll('.splash').length <= 12 && new Set(cues).size === cues.length && document.getElementById('flash').getAnimations().length <= 1;
    api.audio.play = play; document.getElementById('fx').replaceChildren();
    const v = api.visuals.get(0), input = api.inputs.get(0).pointer.position;
    const aligned = Math.abs(v.screen.position.x - input.x) < 1e-5 && Math.abs(v.screen.position.y - input.y) < 1e-5;
    empty(); g.paused = false;
    return { stable, hidden, restored, aligned, particleFade, bounded, normalCalls, checkCalls };
  });
  assert(renderCheck.stable, 'bomb/half geometry or shaders accumulated');
  assert(renderCheck.hidden && renderCheck.restored, 'blade-only mode did not preserve/hide fruit');
  assert(renderCheck.checkCalls < renderCheck.normalCalls, 'blade-only mode did not remove fruit render work');
  assert(renderCheck.aligned, 'blade tip disagrees with measured screen coordinates');
  assert(renderCheck.particleFade && renderCheck.bounded, 'particle fades or simultaneous effect budgets failed');
  await host.evaluate(() => __openwii.pauseGame());
  await host.click('#startBladeCheck');
  await host.waitForTimeout(100);
  assert.equal(await host.evaluate(() => __openwii.bladeOnly()), true);
  const bladeCheck = await host.evaluate(async () => {
    const api=__openwii, render=api.renderer.render.bind(api.renderer), inp=api.inputs.get(0);
    let calls=0;api.renderer.render=(...args)=>{calls++;return render(...args);};
    api.frameMetrics.clear();
    await new Promise(resolve=>setTimeout(resolve,1000));
    api.renderer.render=render;
    // Invoke the production sample handler and inspect the overlay in the
    // same JS task, before another display frame has an opportunity to run.
    api.link.handlers.onSample({alpha:2,beta:0,gamma:0,poseT:performance.now(),t:performance.now(),sequence:99999,epoch:inp.epoch,session:inp.session,motion:{rx:0,ry:0,rz:30},motionAge:0},0);
    const immediate=Math.abs(api.visuals.get(0).screen.position.x-inp.pointer.position.x)<1e-8;
    return {calls,immediate,visible:!api.visuals.get(0).screen.element.hidden,frames:api.frameMetrics.snapshot()};
  });
  assert.equal(bladeCheck.calls,0,'blade-only still rendered WebGL');
  assert(bladeCheck.immediate&&bladeCheck.visible,'raw tip waited for a render frame');
  reports.bladeOnly=bladeCheck;
  await host.click('#bladeOnlyToggle');
  assert.equal(await host.evaluate(() => __openwii.bladeOnly()), false);
  check('blade-only controls preserve fruit state, remove render work, and keep blade alignment exact; geometry/shaders remain stable over 30 cycles');
  for(const mode of ['off','light']){
    await host.evaluate(()=>__openwii.pauseGame());await host.locator('#motionCheck').evaluate(e=>e.open=true);await host.selectOption('#smoothing',mode);await host.click('#startPractice');
    for(const p of phones){await pose(p,0);await p.click('#recenter');await p.waitForTimeout(100);}
    // Freeze only fixture physics; use the real cursor, renderer and collision loop.
    await host.evaluate(()=>{const g=__openwii.game;g.state.nextSpawn=Infinity;if(!g._auditUpdate){g._auditUpdate=g.update.bind(g);g.update=(now,dt)=>{for(const f of g.fruits)if(f.fixture){f.y=0;f.vy=18.75*dt;}g._auditUpdate(now,dt);};}});
    const fruit=async(id,x=0)=>host.evaluate(async({id,x})=>{const {FRUIT_TYPES}=await import('/games/fruit-ninja/logic.js');__openwii.game.rng=()=>1;__openwii.game.fruits=[{fixture:true,id,x,y:0,vx:0,vy:0,r:.62,rot:0,spin:0,spinAxis:{x:1,y:0,z:0},kind:FRUIT_TYPES[3],bomb:false}];},{id,x});
    for(const [slot,p] of phones.entries()){
      await host.evaluate(()=>__openwii.game.fruits=[]);await pose(p,8,0);await fruit(5000+slot);
      await pose(p,-8,0);await p.waitForTimeout(300);
      assert.equal(await host.evaluate(slot=>__openwii.game.getPlayer(slot).score,slot),0,'quiet correction auto-sliced');
      await host.evaluate(()=>__openwii.game.fruits=[]);await pose(p,14,100);await fruit(5010+slot);
      for(let n=0;n<=14;n++)await pose(p,14-n*2,-60);
      await host.waitForFunction(slot=>__openwii.game.getPlayer(slot).score===1,slot);
      await pose(p,-14,0);await p.waitForTimeout(100);
    }
    for(const p of phones)await p.evaluate(()=>clearInterval(__pump));
    await host.waitForTimeout(350);const held=await host.evaluate(()=>[0,1].map(s=>({...__openwii.inputs.get(s).pointer.position})));
    await host.waitForTimeout(1000);
    for(const slot of [0,1])assert.deepEqual(await host.evaluate(slot=>({position:{...__openwii.inputs.get(slot).pointer.position},visible:!__openwii.visuals.get(slot).screen.element.hidden,score:__openwii.game.getPlayer(slot).score}),slot),{position:held[slot],visible:true,score:1});
    for(const p of phones)await p.evaluate(()=>__pump=setInterval(__emit,8));
    await host.waitForFunction(()=>[...__openwii.inputs.values()].every(i=>i.pointer.live));
    check(`${mode==='off'?'direct':'filtered'}: real sweeps cut; corrections, settling and idle do not; points stay visible`);
    // Measure live rendering with naturally spawned fruit and moving phones.
    await host.evaluate(()=>__openwii.pauseGame());await host.click('#startPractice');
    for(const p of phones)await p.evaluate(()=>__animated=true);
    await host.waitForTimeout(1500);await host.evaluate(()=>__openwii.frameMetrics.clear());
    let cdp;if(engine==='chromium'){cdp=await host.context().newCDPSession(host);await cdp.send('Tracing.start',{categories:'devtools.timeline,v8.execute,toplevel',transferMode:'ReturnAsStream'});}
    await host.waitForTimeout(3500);reports[mode]=await host.evaluate(()=>__airDiagnostics.report());
    if(cdp){
      const finished=new Promise(resolve=>cdp.once('Tracing.tracingComplete',resolve));await cdp.send('Tracing.end');const {stream}=await finished;
      let trace='';for(;;){const part=await cdp.send('IO.read',{handle:stream});trace+=part.data;if(part.eof)break;}await cdp.send('IO.close',{handle:stream});
      await fs.writeFile(path.join(output,`${mode}-devtools-trace.json`),trace);await cdp.detach();
    }
    for(const p of phones)await p.evaluate(()=>{__animated=false;__rate=0;});
    const r=reports[mode];assert(Number.isFinite(r.frames.frameMs.p95));
    assert(r.transport.peers.every(p=>p.path==='direct'&&p.rttMs.count>0&&p.sensors.orientationHz>0&&p.sensors.gyroHz>0));
  }
  check('per-phone sensor rates, RTT, pose rates and frame timings are measured; DevTools traces saved');
  await host.evaluate(()=>__openwii.pauseGame());await host.locator('#motionCheck').evaluate(e=>e.open=true);
  await host.waitForTimeout(600);assert.match(await host.locator('#motionStats').textContent(),/RTT median/);
  for(const size of [{width:1920,height:1080},{width:1366,height:768}]){
    await host.setViewportSize(size);
    await host.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    const layout=await host.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,offenders:[...document.querySelectorAll('body *')].filter(e=>getComputedStyle(e).display!=='none'&&e.getBoundingClientRect().right>innerWidth+1).map(e=>({tag:e.tagName,id:e.id,right:e.getBoundingClientRect().right})).slice(0,8)}));
    assert(layout.scroll<=layout.width,JSON.stringify(layout));
    await host.screenshot({path:path.join(output,`setup-${size.width}.png`)});
  }
  await phones[0].setViewportSize({width:844,height:390});assert.equal(await phones[0].evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  check('projector/laptop setup and landscape phone have no horizontal overflow');
  // A delayed echo is a deterministic scheduling/network fault fixture.
  // It is applied after profiling so it cannot contaminate baseline reports.
  await phones[0].evaluate(()=>{const c=[...__airRemote.link.peers.values()][0].control,handle=c.onmessage;c.onmessage=e=>{const d=JSON.parse(e.data);if(d.kind==='ping')setTimeout(()=>handle(e),70);else handle(e);};});
  await host.waitForFunction(()=>__openwii.link.diagnostics().peers.find(p=>p.slot===0).rttMs.p95>60);
  await host.waitForTimeout(600);assert.match(await host.locator('#motionAdvice').textContent(),/uneven/);
  check('delayed-echo fault produces an uneven-connection warning without inventing one-way latency');
  // Replace one phone with a controller lacking WebRTC. No backend changes
  // are needed: existing commands/feedback provide the relay RTT echo.
  const url=new URL(await host.locator('#join1').getAttribute('href'));
  const fallback=await(await makeContext(true,true)).newPage();await fallback.goto(origin+url.pathname+url.search);await fallback.click('#enable');
  await fallback.evaluate(()=>{window.__pump=setInterval(()=>{const o=new Event('deviceorientation');Object.assign(o,{alpha:0,beta:0,gamma:0});dispatchEvent(o);},16);});
  await host.waitForFunction(()=>{const p=__openwii.link.diagnostics().peers.find(p=>p.slot===1);return p?.path==='relay'&&p.rttMs.count>0;});
  const mixed=await host.evaluate(()=>__openwii.link.diagnostics());assert.equal(mixed.peers.find(p=>p.slot===0).path,'direct');
  await host.waitForTimeout(600);assert.match(await host.locator('#motionAdvice').textContent(),/relay/);
  check('mixed direct/relay sessions are identified per phone and relay RTT is measured');
  await fallback.evaluate(()=>__airRemote.link.destroy());await host.waitForFunction(()=>!__openwii.game.getPlayer(1).cursor.active);
  check('departed controllers stop cutting and hide their own point');
  const unsupported=await(await makeContext(true)).newPage();
  await unsupported.goto(origin+'/controller?room=capabilitycheck123456789&slot=0');
  await unsupported.evaluate(()=>{for(const name of ['DeviceOrientationEvent','DeviceMotionEvent','AbsoluteOrientationSensor','RelativeOrientationSensor'])Object.defineProperty(window,name,{value:undefined,configurable:true});});await unsupported.click('#enable');
  assert.match(await unsupported.locator('#message').textContent(),/no motion sensor API/);
  const denied=await(await makeContext(true)).newPage();
  await denied.goto(origin+'/controller?room=permissioncheck123456789&slot=0');
  await denied.evaluate(()=>{DeviceOrientationEvent.requestPermission=DeviceMotionEvent.requestPermission=()=>Promise.resolve('denied');window.AbsoluteOrientationSensor=window.RelativeOrientationSensor=undefined;});await denied.click('#enable');
  assert.match(await denied.locator('#message').textContent(),/denied/);assert.equal(await denied.locator('#enable').isEnabled(),true);
  const noGL=await(await makeContext()).newPage();
  await noGL.addInitScript(()=>{const original=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(type,...args){return type.includes('webgl')?null:original.call(this,type,...args);};});
  await noGL.goto(origin+'/host?room=webglcheck1234567890');await noGL.waitForFunction(()=>document.getElementById('serverNote').textContent.includes('WebGL 2'));
  assert.equal(await noGL.locator('#startPractice').isDisabled(),true);
  check('unsupported sensors, denied permissions and unavailable WebGL explain recovery instead of silently failing');
  assert.equal(errors.length,0,errors.join('\n'));
  await fs.writeFile(path.join(output,'measurements.json'),JSON.stringify({engine,simulatedSensors:true,checks,reports,errors},null,2));
  console.log(`Saved measurements and traces to ${output}`);
} finally {await browser?.close();await new Promise(resolve=>server.io.close(resolve));}
