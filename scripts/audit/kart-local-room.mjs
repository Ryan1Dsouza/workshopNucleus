import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';
import { installFakeBluetooth } from '../../tests/helpers/fake-bluetooth.mjs';
import presets from '../../native/android/app/src/main/assets/profiles.json' with {type:'json'};

const browser=await chromium.launch({channel:'chrome'});
const page=await browser.newPage({viewport:{width:1366,height:900}});
page.setDefaultTimeout(60000);
const errors=[],network=[];
page.on('console',m=>{if(m.type()==='error')errors.push(m.text()+' '+m.location().url);});
page.on('pageerror',e=>errors.push(e.message));
page.on('request',r=>{if(/\/api\/lobby|\/socket\.io\/\?|metered\./i.test(r.url()))network.push(r.url());});
page.on('websocket',s=>network.push(s.url()));
await page.addInitScript(installFakeBluetooth);
await page.addInitScript(()=>{window.RTCPeerConnection=class {constructor(){throw Error('Local room opened a peer connection');}};});
const out='test-results/local-room';await mkdir(out,{recursive:true});
try{
  await page.goto((process.env.HOST_URL||'http://localhost:3000')+'/host/');
  await page.locator('[data-game="kart-racing"]').click();
  await page.click('#createLocalRoom');
  await page.selectOption('#localCapacity','8');
  await page.evaluate(p=>__fakeBle.phones.forEach(d=>{d.presets=p;}),presets);
  const seats=page.locator('.local-seat');
  await seats.nth(0).getByLabel('Driver').selectOption('luigi');
  assert.equal(await seats.nth(1).getByLabel('Driver').inputValue(),'mario');
  for(let i=0;i<8;i++){
    const seat=seats.nth(i);
    if(i%2)await seat.getByLabel('Phone steering').selectOption('gyro');
    await page.evaluate(slot=>{__fakeBle.next=slot;},i);
    await seat.getByRole('button',{name:'Pair phone'}).click();
    await seat.getByRole('button',{name:'Ready',exact:true}).click();
  }
  const state=()=>page.evaluate(()=>__fakeBle.phones.map(d=>[d.profile.player,d.profile.layout||'menu']));
  assert.deepEqual(await state(),Array.from({length:8},(_,i)=>[i+1,'menu']));
  await page.screenshot({path:out+'/room.png',fullPage:true});
  await page.setViewportSize({width:390,height:844});
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.screenshot({path:out+'/room-mobile.png',fullPage:true});
  await page.setViewportSize({width:1366,height:900});
  // Optional voice clips continue downloading after the menu is ready.
  await page.waitForFunction(()=>{
    const audio=__controllerkit.adapter().api.audio.original;
    return audio.ready && audio.buffers.size+audio.failures.length===Object.keys(audio.manifest.cues).length;
  });
  // Disconnect after the static assets have loaded, including those clips.
  await page.context().setOffline(true);
  await page.click('#startLocalMatch');
  await page.waitForFunction(()=>__controllerkit.adapter().api.race.state==='racing',null,{timeout:45000});
  assert.deepEqual(await state(),Array.from({length:8},(_,i)=>[i+1,i%2?'kart-gyro':'kart-dpad']));
  const presses=await page.evaluate(async()=>{
    const race=__controllerkit.adapter().api.race;
    const before=race.localHumans.map(r=>r.progress);
    const gas=setInterval(()=>__fakeBle.phones.forEach((d,i)=>d.buttons(i===7?0:128)),60);
    await new Promise(r=>setTimeout(r,1600)); clearInterval(gas);
    const gasRead=race.localHumans.map(r=>r.lastInput.gas);
    __fakeBle.phones.forEach((d,i)=>d.buttons(i===7?128:0));
    await new Promise(r=>setTimeout(r,300));
    return {gasRead,swapped:race.localHumans.map(r=>r.lastInput.gas),moved:race.localHumans.some((r,i)=>r.progress>before[i]+.5),owned:race.racers.filter(r=>!r.remote).length};
  });
  assert.deepEqual(presses,{gasRead:[true,true,true,true,true,true,true,false],swapped:[false,false,false,false,false,false,false,true],moved:true,owned:8});
  assert.equal(await page.frameLocator('#gameStage iframe').locator('#local-views>div').count(),8);
  await page.screenshot({path:out+'/eight-racers.png'});
  await page.click('#backLocalRoom');await page.waitForFunction(()=>__fakeBle.phones.every(d=>!d.profile.layout));
  assert.ok(await page.locator('#startLocalMatch').isDisabled());
  await page.selectOption('#localCapacity','2');await page.selectOption('#localBots','false');
  await seats.nth(0).getByRole('button',{name:'Ready',exact:true}).click();
  await seats.nth(1).getByRole('button',{name:'Ready',exact:true}).click();
  await page.click('#startLocalMatch');
  await page.waitForFunction(()=>__controllerkit.adapter().api.race.state==='racing');
  assert.equal(await page.evaluate(()=>__controllerkit.adapter().api.race.racers.length),2);
  await page.click('#backLocalRoom');await page.click('#leaveLocalRoom');
  await page.waitForFunction(()=>!__controllerkit.couch.active && __controllerkit.adapter()?.api?.race.state==='ready');
  assert.deepEqual(network,[]);assert.deepEqual(errors,[]);
  console.log('8 simulated BLE controllers, independent gas and layouts, 8 views, offline rematch with 2 drivers. Zero lobby requests, WebSockets, peer connections or browser errors.');
}finally{await browser.close();}
