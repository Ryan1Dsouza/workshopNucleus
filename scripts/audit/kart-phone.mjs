import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {installFakeBluetooth} from '../../tests/helpers/fake-bluetooth.mjs';

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
} finally {await browser.close();}
