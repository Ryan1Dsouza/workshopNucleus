import assert from 'node:assert/strict';
import {chromium} from 'playwright';

const base = process.env.HOST_URL || 'http://localhost:3000';
const browser = await chromium.launch({channel:'chrome',headless:true});
try {
  for (const embedded of [false,true]) {
    const page = await browser.newPage({viewport:{width:1366,height:900}});
    const errors = [];
    page.on('pageerror',e=>errors.push(e.message));
    page.on('console',e=>{if(e.type()==='error')errors.push(e.text());});
    let release;
    const held = new Promise(resolve=>{release=resolve;});
    await page.route('**/games/mario-kart/game.js',async route=>{await held;await route.continue();});
    try {
      await page.goto(base+(embedded?'/host/':'/games/mario-kart/index.html'),{waitUntil:'commit'});
      if(embedded)await page.locator('.game-card[data-game="kart-racing"]').click();
      const menu=embedded?page.frameLocator('#gameStage iframe'):page;
      await menu.getByRole('button',{name:'Luigi',exact:true}).click();
      await menu.locator('[data-laps="1"]').click();
      await menu.locator('[data-steering="gyro"]').click();
      if(embedded)assert.equal(await page.evaluate(()=>__controllerkit.profile().layout),undefined);
      assert.equal(await menu.locator('#chosen').innerText(),'Luigi');
      for(const selector of ['[data-driver="luigi"]','[data-laps="1"]','[data-steering="gyro"]'])
        assert.equal(await menu.locator(selector).getAttribute('aria-pressed'),'true');
      await menu.locator('#start').click();
      if(embedded)assert.equal(await page.evaluate(()=>__controllerkit.profile().layout),undefined);
      assert.equal(await menu.locator('#intro').getAttribute('data-menu-step'),'start');
      assert.equal(await menu.locator('#start').getAttribute('aria-busy'),null);
      await page.keyboard.press('Enter');
      assert.equal(await menu.locator('#start').getAttribute('aria-busy'),'true');
      if(embedded)assert.equal(await page.evaluate(()=>__controllerkit.profile().layout),undefined);
      const frame=page.frames().find(f=>f.url().includes('/games/mario-kart/'));
      assert.equal(await frame.evaluate(()=>!!window.__openwii),false);
      release();
      await frame.waitForFunction(()=>window.__openwii?.race.state==='racing',null,{timeout:45000});
      assert.deepEqual(await frame.evaluate(()=>[__openwii.race.player.character.id,__openwii.race.laps,__openwii.steeringMode]),['luigi',1,'gyro']);
      if(embedded){
        assert.equal(await page.evaluate(()=>__controllerkit.profile().layout),'kart-gyro');
        assert.equal(await page.locator('#modeBadge').innerText(),'Playing');
      }
      assert.deepEqual(errors,[]);
      console.log((embedded?'Host':'Standalone')+' confirmed steering separately and started the selected race on Enter.');
    } finally {release();await page.close();}
  }
} finally {await browser.close();}
