import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
import {installFakeBluetooth} from '../../tests/helpers/fake-bluetooth.mjs';

const base=process.env.HOST_URL || 'http://localhost:3000';
const output='test-results/kart-party';
await mkdir(output,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true});
const results={chrome:browser.version(),errors:[]};
const pages=[];
async function tab(i,code){
  const context=await browser.newContext({viewport:i===0?{width:1366,height:900}:{width:800,height:600}});
  await context.addInitScript(installFakeBluetooth);
  const page=await context.newPage();pages.push(page);
  page.on('console',msg=>{if(msg.type()==='error')results.errors.push(msg.text());});
  page.on('pageerror',err=>results.errors.push(err.message));
  await page.goto(base+'/host/');
  await page.locator('#onlineTab').click();await page.locator('#onlineName').fill('Racer '+(i+1));
  if(i===0){
    await page.locator('#createGame').selectOption('kart-racing');await page.locator('#createRoom').click();
  }else{
    await page.locator('#joinCode').fill(code);await page.locator('#joinForm button').click();
  }
  return page;
}
try{
  const host=await tab(0);
  await host.waitForFunction(()=>__controllerkit.online.room?.capacity===8);
  const code=await host.locator('#roomCode').innerText();
  // Pair one simulated phone through the normal host picker.
  await host.locator('#pair0').click();
  for(let i=1;i<8;i++){
    const page=await tab(i,code);
    await page.waitForFunction(()=>__controllerkit.online.room && __controllerkit.adapter()?.api?.race);
  }
  await Promise.all(pages.map(page=>page.waitForFunction(()=>__controllerkit.online.room?.players.length===8 &&
    __controllerkit.online.room.players.every(p=>p.linked),null,{timeout:60000})));
  const rejected=await tab(8,code);await rejected.getByText('Lobby is unavailable or full.').waitFor();pages.pop();
  await rejected.context().close();
  assert.equal(await host.locator('#roomDrivers select').count(),8);
  await host.locator('#roomSteering').selectOption('gyro');
  assert.equal(await pages[1].locator('#roomSteering').inputValue(),'dpad');
  await host.locator('#driver7').selectOption('mario');
  await host.waitForFunction(()=>__controllerkit.online.room.options.drivers[7]==='mario' && __controllerkit.online.room.options.drivers[0]==='koopa');
  await host.screenshot({path:output+'/lobby-desktop.png',fullPage:true});
  await host.setViewportSize({width:390,height:844});
  assert.ok(await host.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await host.screenshot({path:output+'/lobby-mobile.png',fullPage:true});
  await host.setViewportSize({width:1366,height:900});
  await Promise.all(pages.map(p=>p.locator('#readyPlayer').click({timeout:60000})));
  await host.locator('#startMatch').click();
  await Promise.all(pages.map(p=>p.waitForFunction(()=>__controllerkit.adapter().api.race?.state==='racing',null,{timeout:60000})));
  const readings=()=>Promise.all(pages.map(p=>p.evaluate(async()=>{
    const race=__controllerkit.adapter().api.race, protocols=[];
    for(const peer of __controllerkit.online.peers.values()){
      const stats=await peer.pc.getStats(), transport=[...stats.values()].find(s=>s.type==='transport' && s.selectedCandidatePairId);
      const pair=stats.get(transport.selectedCandidatePairId);
      protocols.push([stats.get(pair.localCandidateId).protocol,peer.channel.ordered,peer.channel.maxRetransmits,peer.lastSequence]);
    }
    return {driver:race.player.character.id,time:race.time,owned:race.racers.filter(r=>!r.remote).length,
      peers:protocols,paused:!document.querySelector('#gameStage iframe').contentDocument.querySelector('#pause').hidden};
  })));
  const before=await readings();
  assert.equal(await host.evaluate(()=>__controllerkit.profile().layout),'kart-gyro');
  assert.equal(await pages[1].evaluate(()=>__controllerkit.profile().layout),'kart-dpad');
  for(const i of [0,7]){
    const p=pages[i];await p.locator('#gameStage iframe').focus();await p.keyboard.press('Escape');
    await p.evaluate(()=>{__controllerkit.togglePause();__controllerkit.adapter().api.pause();});
  }
  await host.evaluate(()=>{const d=__fakeBle.phones[0];d.buttons(1<<8);setTimeout(()=>d.buttons(0),60);});
  await host.waitForTimeout(900);
  const after=await readings();assert.equal(new Set(after.map(p=>p.driver)).size,8);
  for(const [i,p] of after.entries()){
    assert.equal(p.owned,1);assert.equal(p.peers.length,7);assert.equal(p.paused,false);assert.ok(p.time>before[i].time);
    for(const [j,link] of p.peers.entries()){
      assert.deepEqual(link.slice(0,3),['udp',false,0]);assert.ok(link[3]>before[i].peers[j][3]);
    }
  }
  results.drivers=after.map(p=>p.driver);
  results.peerConnections=after.reduce((n,p)=>n+p.peers.length,0)/2;
  results.advanceDuringPauseMs=after.map((p,i)=>Math.round(1000*(p.time-before[i].time)));
  await Promise.all(pages.slice(1).map(p=>p.evaluate(driver=>{
    const proxy=__controllerkit.adapter().api.race.racers.find(r=>r.character.id===driver && r.remote);
    window.observeHost={left:0,right:0};
    window.observeTimer=setInterval(()=>{
      observeHost.left=Math.min(observeHost.left,proxy.steer);
      observeHost.right=Math.max(observeHost.right,proxy.steer);
    },35);
  },results.drivers[0])));
  results.gyro=await host.evaluate(async()=>{
    const d=__fakeBle.phones[0],race=__controllerkit.adapter().api.race;
    const epoch=d.profile.profileEpoch;d.control.emit([0x44,1,epoch&255,epoch>>>8]);
    const started=performance.now(), base=d.time, neutral=[], left=[], right=[], progress=race.player.progress;
    const mul=([x,y,z,w],[X,Y,Z,W])=>[w*X+x*W+y*Z-z*Y,w*Y-x*Z+y*W+z*X,w*Z+x*Y-y*X+z*W,w*W-x*X-y*Y-z*Z];
    const axis=(i,a)=>{const h=a*Math.PI/360,q=[0,0,0,Math.cos(h)];q[i]=Math.sin(h);return q;};
    while(performance.now()-started<2400){
      const t=performance.now()-started;
      const bank=t<1000?4.2*Math.sin(t/90):t<1600?-20:t<1800?0:20;
      const q=mul(axis(2,30*Math.sin(t/230)),mul(axis(1,bank),mul(axis(0,45+10*Math.sin(t/130)),axis(2,90))));
      const v=new DataView(new ArrayBuffer(20));v.setUint8(0,1);v.setUint8(1,3);
      v.setUint16(2,d.sequence++,true);v.setUint32(4,d.time=base+Math.round(t),true);
      q.forEach((n,i)=>v.setInt16(8+i*2,Math.round(n*32767),true));
      v.setUint16(16,10000,true);v.setUint16(18,d.epoch,true);d.motion.emit(v);d.buttons(1<<7);
      if(t>250 && t<1000)neutral.push(Math.abs(race.player.steer));
      if(t>1250 && t<1580)left.push(race.player.steer);
      if(t>2050)right.push(race.player.steer);
      await new Promise(r=>setTimeout(r,24));
    }
    d.buttons(0);
    return {straightPeak:Math.max(...neutral),left:Math.min(...left),right:Math.max(...right),progress:race.player.progress-progress};
  });
  assert.ok(results.gyro.straightPeak<.001 && results.gyro.left<-.3 && results.gyro.right>.3 && results.gyro.progress>0,JSON.stringify(results.gyro));
  results.remoteSteering=await Promise.all(pages.slice(1).map(async p=>{
    await p.waitForFunction(()=>observeHost.left<-.25 && observeHost.right>.25,null,{timeout:12000});
    return p.evaluate(()=>{clearInterval(observeTimer);return observeHost;});
  }));
  assert.deepEqual(results.errors,[]);
  console.log(JSON.stringify(results));
}finally{
  await writeFile(output+'/report.json',JSON.stringify(results,null,2));
  await browser.close();
}
