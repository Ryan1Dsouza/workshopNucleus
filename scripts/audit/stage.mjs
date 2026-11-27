import { openChannel } from './channels.mjs';
import { checkFruitGame, checkPendingPhoneStart, usePhoneClocks } from './fruit-game.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import serverModule from '../../server/index.cjs';
import { stage, features } from '../../public/stage.mjs';
import { browserOptions } from './browser-options.mjs';
import { installFakeBluetooth } from '../../tests/helpers/fake-bluetooth.mjs';

const requested=process.argv[2]===undefined?stage:Number(process.argv[2]);
assert.equal(requested,stage,'Audit the current checkpoint');assert.ok(stage>=1&&stage<=7);
const output=path.resolve('test-results/stages');await fs.mkdir(output,{recursive:true});
const server=serverModule.createWorkshopServer();await new Promise(resolve=>server.servers[0].listen(0,'127.0.0.1',resolve));
const origin='http://127.0.0.1:'+server.servers[0].address().port;
const checks=[],errors=[];let browser,host;
const pass=text=>{checks.push(text);console.log('PASS '+text);};
try{
  assert.equal((await fetch(origin+'/api/health').then(response=>response.json())).app,'controllerkit');
  browser=await chromium.launch(browserOptions());const context=await browser.newContext({viewport:{width:1366,height:950}});
  await context.addInitScript(installFakeBluetooth);host=await context.newPage();host.on('pageerror',error=>errors.push(error.message));
  await host.goto(origin+'/host');await host.waitForFunction(()=>window.__controllerkit);
  await host.evaluate(usePhoneClocks);
  assert.equal(await host.evaluate(()=>Number(document.documentElement.dataset.stage)),stage);
  assert.equal(await host.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  for(const slot of [0,1]){
    await host.evaluate(slot=>{__fakeBle.next=slot;if(slot===0)__fakeBle.phones[0].connectFailures=[new DOMException('Connection attempt failed.','NetworkError')];},slot);await host.click('#pair'+slot);
    await host.waitForFunction(slot=>__controllerkit.controllers.player(slot).ready,slot);
  }
  assert.deepEqual(await host.evaluate(()=>({pickers:__fakeBle.requests.length,connections:__fakeBle.granted.map(p=>p.gatt.connects)})),{pickers:2,connections:[2,1]});
  pass('first-pairing transient failure retries once with the selected phone and no second picker');
  await host.evaluate(async()=>{__controllerkit.ble.disconnect(0);await __controllerkit.ble.connect(0);});
  await host.waitForFunction(()=>__controllerkit.controllers.player(0).ready);
  assert.deepEqual(await host.evaluate(()=>({pickers:__fakeBle.requests.length,connections:__fakeBle.granted.map(p=>p.gatt.connects)})),{pickers:2,connections:[3,1]});
  pass('reconnecting the saved phone reuses browser permission without reopening pairing');
  assert.deepEqual(await host.evaluate(()=>__fakeBle.granted.map(phone=>phone.profile.player)),[1,2]);
  assert.equal(await host.evaluate(()=>__fakeBle.granted.every(phone=>phone.profile.motion==='none')), !features.motion);
  assert.equal(await host.evaluate(()=>__fakeBle.granted.every(phone=>phone.profile.controls.length>0)),features.buttons);
  pass('neutral host and two isolated simulated BLE connections work at Stage '+stage);
  if(!features.buttons){assert.equal(await host.locator('.game-card').count(),0);assert.equal(await host.locator('#previewButton').isVisible(),false);}
  else{
    await openChannel(host,'remote');await host.locator('.lab-grid').waitFor();
    await host.evaluate(()=>{__fakeBle.phones[0].buttons(24);__fakeBle.phones[1].buttons(32);});
    await host.waitForFunction(()=>__controllerkit.controllers.player(0).mask===24&&__controllerkit.controllers.player(1).mask===32);
    await host.evaluate(()=>__fakeBle.phones[0].buttons(0));await host.waitForFunction(()=>__controllerkit.controllers.player(0).mask===0);
    assert.equal(await host.evaluate(()=>__controllerkit.controllers.player(1).mask),32);
    const phone=await context.newPage();phone.on('pageerror',error=>errors.push(error.message));
    await phone.setViewportSize({width:390,height:844});await phone.goto(origin+'/controller?preview=1');await phone.waitForFunction(()=>window.__controllerUi);
    assert.equal(await phone.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    const a=await phone.locator('[data-control="a"]').boundingBox(),b=await phone.locator('[data-control="b"]').boundingBox();
    const touch=await context.newCDPSession(phone);
    await touch.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:a.x+a.width/2,y:a.y+a.height/2,id:1},{x:b.x+b.width/2,y:b.y+b.height/2,id:2}]});
    await phone.waitForFunction(()=>__controllerUi.mask()===48);
    await touch.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await phone.waitForFunction(()=>__controllerUi.mask()===0);
    await phone.close();await host.bringToFront();pass('shared Wii UI handles real browser multi-touch presses and releases');
  }
  if(features.motion){
    await host.evaluate(()=>{__fakeBle.phones[0].pose(0,0);__fakeBle.phones[0].center(0);});await host.waitForTimeout(35);
    await host.evaluate(()=>__fakeBle.phones[0].pose(4,60));await host.waitForTimeout(35);
    await host.evaluate(()=>__fakeBle.phones[0].pose(8,60));
    await host.waitForFunction(()=>Math.abs(__controllerkit.controllers.player(0).motion.pointer.position.x-.5)>.01);
    await host.evaluate(()=>__fakeBle.phones[0].center(8,true));await host.waitForTimeout(35);
    assert.equal(await host.evaluate(()=>__controllerkit.controllers.player(0).motion.pointer.pending.cutting),false);
    const {checkMotionView}=await import('./motion-view.mjs');
    await host.evaluate(checkMotionView);
    pass('lab interpolates between packets, keeps idle aim visible and snaps safely on center');
    pass('measured wrist movement and captured-pose centering preserve stroke safety');
  }
  if(features.profiles){assert.equal(await host.evaluate(()=>typeof __controllerkit.registerGame),'function');pass('profile catalog and reusable adapter registry are available');}
  if(features.fruit){
    await openChannel(host,'fruit-ninja');await host.waitForFunction(()=>__controllerkit.adapter()?.api);
    await host.waitForFunction(()=>[0,1].every(slot=>__controllerkit.controllers.player(slot).ready)&&__fakeBle.granted.every(phone=>phone.profile.id==='fruit-ninja'));
    assert.deepEqual(await host.evaluate(()=>__fakeBle.granted.map(phone=>phone.gatt.connects)),[3,1]);
    await host.click('#enlargeGame');
    await host.waitForFunction(()=>document.querySelector('.play-area').classList.contains('is-expanded'));
    await host.evaluate(()=>__fakeBle.phones[0].buttons(16));await host.waitForFunction(()=>__controllerkit.adapter().api.game.paused===false);
    await host.evaluate(()=>__fakeBle.phones[0].buttons(0));
    const game=host.frames().find(frame=>frame.url().includes('/games/fruit-ninja/index.html'));
    await host.evaluate(()=>{__fakeBle.phones[0].pose(0,0);__fakeBle.phones[0].center(0);});await host.waitForTimeout(35);
    await host.evaluate(()=>__fakeBle.phones[0].pose(12,120));await host.waitForTimeout(35);
    await host.evaluate(()=>__fakeBle.phones[0].pose(12,0));await host.waitForTimeout(35);
    await game.evaluate(async()=>{const {FRUIT_TYPES}=await import('/games/fruit-ninja/logic.js');const game=__openwii.game;game.state.nextSpawn=Infinity;game.fruits=[{id:81001,x:-game.w/4,y:0,vx:0,vy:3,r:.62,rot:0,spin:0,spinAxis:{x:1,y:0,z:0},kind:FRUIT_TYPES[3],lane:0}];});
    const score=await game.evaluate(()=>__openwii.game.state.score);
    for(const angle of [8,4,0,-4,-8,-12]){await host.evaluate(angle=>__fakeBle.phones[0].pose(angle,250),angle);await host.waitForTimeout(25);}
    await game.waitForFunction(previous=>__openwii.game.state.score>previous,score);
    pass('BLE button starts enlarged Fruit Ninja and BLE motion slices a real rendered fruit through the adapter');
    for(const check of await checkPendingPhoneStart(host))pass(check);
    for(const check of await checkFruitGame(host))pass(check);
    if(!features.extension){await host.click('#enlargeGame');await host.waitForFunction(()=>!document.querySelector('.play-area').classList.contains('is-expanded'));}
  }else assert.equal(await host.locator('[data-game="fruit-ninja"]').count(),0);
  if(features.extension){
    await host.evaluate(async()=>{const {BUTTON_COUNTER_GAME}=await import('/games/extension-template/adapter.mjs');__controllerkit.registerGame(BUTTON_COUNTER_GAME);await __controllerkit.select('button-counter');});
    await host.waitForFunction(()=>[0,1].every(slot=>__controllerkit.controllers.player(slot).ready)&&__fakeBle.granted.every(phone=>phone.profile.id==='button-counter'));
    await host.evaluate(()=>__fakeBle.phones[0].buttons(16));await host.waitForFunction(()=>__controllerkit.adapter().value===1);
    await host.evaluate(()=>__fakeBle.phones[0].buttons(0));await openChannel(host,'remote');
    await host.waitForFunction(()=>__controllerkit.current().id==='remote'&&[0,1].every(slot=>__controllerkit.controllers.player(slot).ready));
    assert.equal(await host.locator('iframe[title="Fruit Ninja game"]').count(),0);
    pass('extension template changes phone orientation/actions and disposes the previous game');
  }
  await host.evaluate(()=>__fakeBle.phones[0].gatt.disconnect());await host.waitForFunction(()=>!__controllerkit.controllers.player(0).connected);
  assert.equal(await host.evaluate(()=>__controllerkit.controllers.player(1).connected),true);
  assert.deepEqual(errors,[]);pass('one disconnect preserves the other player; no browser runtime errors');
  await host.screenshot({path:path.join(output,'stage-'+stage+'.png'),fullPage:true});
  await fs.writeFile(path.join(output,'stage-'+stage+'.json'),JSON.stringify({stage,checks,errors,physicalBluetooth:'not tested'},null,2));
}catch(error){
  console.error('Browser errors:',errors);console.error('Host status:',await host?.locator('#notice').textContent().catch(()=>''));
  await host?.screenshot({path:path.join(output,'stage-'+stage+'-failure.png'),fullPage:true}).catch(()=>{});throw error;
}finally{await browser?.close();await new Promise(resolve=>server.io.close(resolve));}
