import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {installFakeBluetooth} from '../../tests/helpers/fake-bluetooth.mjs';
import presets from '../../native/android/app/src/main/assets/profiles.json' with {type:'json'};

const browser=await chromium.launch({channel:'chrome'});
try {
  const page=await browser.newPage({viewport:{width:1366,height:900}});
  const errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
  await page.addInitScript(installFakeBluetooth);
  await page.addInitScript(()=>localStorage.setItem('openwii.chargeInvert2','1'));
  await page.goto((process.env.HOST_URL||'http://localhost:3000')+'/host/');
  await page.locator('[data-game="kart-racing"]').click();
  await page.frameLocator('#gameStage iframe').locator('[data-steering="gyro"]').click();
  await page.waitForFunction(()=>__controllerkit.profile().layout==='kart-gyro');
  await page.evaluate(()=>{
    const phone=__fakeBle.phones[0], control=phone.control;
    const write=control.writeValueWithResponse.bind(control);
    phone.failedWrites=0;
    control.writeValueWithResponse=async packet=>{
      await write(packet);
      if(packet[0]===0x41 && !phone.allowWrites){
        phone.failedWrites++;
        throw new DOMException('GATT operation already in progress.','NetworkError');
      }
    };
  });
  await page.locator('#pair0').click();
  await page.locator('#retryControls0').waitFor({state:'visible'});
  assert.equal(await page.evaluate(()=>__fakeBle.phones[0].failedWrites),3);
  assert.match(await page.locator('#playerDetail0').innerText(),/GATT operation/);
  await page.evaluate(()=>{__fakeBle.phones[0].allowWrites=true;});
  await page.locator('#retryControls0').click();
  await page.waitForFunction(()=>__controllerkit.controllers.player(0).ready && __fakeBle.phones[0].profile.layout==='kart-gyro');
  assert.equal(await page.evaluate(()=>__fakeBle.phones[0].gatt.connects),1);

  await page.evaluate(()=>{
    const phone=__fakeBle.phones[0], start=performance.now(), base=phone.time;
    phone.bank=0;
    phone.setRotation=rotation=>{
      const epoch=phone.profile.profileEpoch;
      phone.rotation=rotation;
      phone.control.emit([0x44,rotation,epoch&255,epoch>>>8]);
    };
    phone.setRotation(1);
    setInterval(()=>{
      // Android's +Y edge is the displayed left edge in ROTATION_90 and
      // the right edge in ROTATION_270. Positive bank lowers the right edge.
      const halfAngle=(phone.rotation===1?1:-1)*phone.bank*Math.PI/360;
      const packet=new DataView(new ArrayBuffer(20));
      packet.setUint8(0,1);packet.setUint8(1,3);
      packet.setUint16(2,phone.sequence++,true);
      packet.setUint32(4,base+Math.round(performance.now()-start),true);
      packet.setInt16(8,Math.round(32767*Math.sin(halfAngle)),true);
      packet.setInt16(14,Math.round(32767*Math.cos(halfAngle)),true);
      packet.setUint16(18,phone.epoch,true);phone.motion.emit(packet);
    },20);
  });
  await page.locator('#startGame').click();
  await page.waitForFunction(()=>__controllerkit.adapter()?.api?.race.state==='racing');
  await page.locator('#gameStage iframe').focus();
  await page.keyboard.down('w');
  for(const rotation of [1,3]){
    await page.evaluate(r=>__fakeBle.phones[0].setRotation(r),rotation);
    for(const [key,bank] of [['ArrowLeft',-25],['ArrowRight',25]]){
      const sign=Math.sign(bank);
      await page.keyboard.down(key);
      await page.waitForFunction(s=>__controllerkit.adapter().api.race.player.lastInput.steer===s,sign);
      await page.keyboard.up(key);
      await page.evaluate(degrees=>{__fakeBle.phones[0].bank=degrees;},bank);
      await page.waitForFunction(s=>{
        const p=__controllerkit.adapter().api.race.player;
        return p.lastInput.measuredWheel && p.lastInput.steer*s>.5 && p.steer*s>.5;
      },sign);
      console.log('Surface rotation '+rotation+', '+bank+'° bank matches '+key);
      await page.evaluate(()=>{__fakeBle.phones[0].bank=0;});
      await page.waitForFunction(()=>__controllerkit.adapter().api.race.player.lastInput.steer===0);
    }
  }
  await page.keyboard.up('w');
  assert.deepEqual(errors,[]);
  console.log('Same-connection retry passed; zero console or page errors.');

  // Hold the Three.js module and the profile transfer independently. Phone
  // taps must reach the visible menu even when either one is still loading.
  for(const fast of [false,true]){
    let loadCourse;
    const gate=new Promise(resolve=>{loadCourse=resolve;});
    await page.route('**/games/mario-kart/game.js',async route=>{await gate;await route.continue();});
    await page.goto((process.env.HOST_URL||'http://localhost:3000')+'/host/');
    await page.waitForFunction(()=>window.__controllerkit);
    await page.evaluate(p=>{const d=__fakeBle.phones[0];d.presets=p;d.writeDelay=5;},fast?presets:null);
    await page.click('#pair0');
    await page.waitForFunction(()=>__controllerkit.controllers.player(0).ready);
    await page.click('[data-game="kart-racing"]');
    const menu=page.frameLocator('#gameStage iframe');
    await menu.locator('[data-driver]').first().waitFor();
    await page.waitForFunction(()=>__fakeBle.phones[0].profile?.id==='kart-racing' && __controllerkit.controllers.player(0).ready);
    const result=await page.evaluate(()=>{
      const d=__fakeBle.phones[0], w=document.querySelector('#gameStage iframe').contentWindow;
      const intro=w.document.getElementById('intro'), step=()=>intro.dataset.menuStep;
      const tap=mask=>{d.buttons(mask);d.buttons(0);};
      const before=d.control.writes.length;
      tap(2);tap(16);const laps=step();
      tap(8);tap(16);const steering=step(),duringLaps=d.control.writes.length-before;
      d.writeDelay=30;
      tap(2);tap(8);tap(2); // last selection wins, still on the confirmed menu epoch
      const layout=__controllerkit.profile().layout;
      tap(16);
      return {laps,steering,duringLaps,layout,pending:w.document.getElementById('start').getAttribute('aria-busy')};
    });
    assert.deepEqual(result,{laps:'laps',steering:'steering',duringLaps:0,layout:'kart-gyro',pending:'true'});
    // Check one isolated mode change's actual acknowledgement and write count.
    await page.waitForFunction(()=>__controllerkit.controllers.player(0).ready && __fakeBle.phones[0].profile.layout==='kart-gyro');
    loadCourse();
    await page.waitForFunction(()=>__controllerkit.adapter()?.api?.race.state==='countdown');
    await page.unroute('**/games/mario-kart/game.js');
    const timing=await page.evaluate(async()=>{
      const d=__fakeBle.phones[0];
      __controllerkit.adapter().api.resetGame();
      await __controllerkit.ble.devices.get(0).profileTask;
      const before=d.control.writes.length,start=performance.now();
      document.querySelector('#gameStage iframe').contentDocument.querySelector('[data-steering="gyro"]').click();
      await __controllerkit.ble.devices.get(0).profileTask;
      if(d.profile.layout!=='kart-gyro')throw Error('Phone did not apply the selected layout');
      return {writes:d.control.writes.length-before,ms:Math.round(performance.now()-start)};
    });
    assert.ok(fast?timing.writes===1:timing.writes>40);
    console.log((fast?'Preset APK':'Legacy APK')+' at 30 ms/write: '+JSON.stringify(timing)+'; phone-only menu and queued Start passed.');
  }
  assert.deepEqual(errors,[]);
} finally {await browser.close();}
