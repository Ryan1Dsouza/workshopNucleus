import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {installFakeBluetooth} from '../../tests/helpers/fake-bluetooth.mjs';

const base=process.env.HOST_URL||'http://localhost:3000';
const guestBase=process.env.GUEST_URL||base;
const out='test-results/multiplayer';
await mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true});
const report={chrome:browser.version(),viewport:[1366,900],consoleErrors:[],pageErrors:[],channels:[],rtcFrames:0};
const sockets=[];
async function session(origin) {
  const ctx=await browser.newContext({viewport:{width:1366,height:900},ignoreHTTPSErrors:true});
  await ctx.addInitScript(installFakeBluetooth);
  const p=await ctx.newPage();
  p.on('pageerror',e=>report.pageErrors.push(e.message));
  p.on('console',e=>{if(e.type()==='error')report.consoleErrors.push(e.text()+' '+e.location().url);});
  p.on('websocket',s=>{
    sockets.push(s.url());s.on('framesent',e=>{
      const msg=String(e.payload);
      if(msg.startsWith('42/lobbies,')){
        const event=JSON.parse(msg.slice(msg.indexOf('[')))[0];
        assert.ok(['lobby','clock','signal'].includes(event),'unexpected server message '+event);
      }
    });
  });
  await p.goto(origin+'/host/');await p.waitForFunction(()=>!!window.__controllerkit?.online);
  return p;
}
async function pair(p,slot){
  await p.evaluate(slot=>{__fakeBle.next=slot;},slot);
  await p.locator('#pair'+slot).click();
  await p.waitForFunction(slot=>__controllerkit.controllers.player(slot).ready,slot);
}
async function ready(a,b){
  for(const p of [a,b])await p.locator('#readyPlayer').click({timeout:35000});
  await a.locator('#startMatch').click();
  await Promise.all([a,b].map(p=>p.waitForFunction(()=>__controllerkit.online.playing)));
}
async function channel(p,visibility){
  await p.waitForFunction(()=>__controllerkit.online.room?.players.every(p=>p.linked)&&__controllerkit.online.room.players.length===2);
  const stats=await p.evaluate(async()=>{
    const {pc,channel}=__controllerkit.online.peer,stats=await pc.getStats();
    const transport=[...stats.values()].find(s=>s.type==='transport');
    const pair=stats.get(transport.selectedCandidatePairId);
    const candidate=stats.get(pair.localCandidateId);
    return {state:pc.connectionState,type:candidate.candidateType,protocol:candidate.protocol,ordered:channel.ordered,maxRetransmits:channel.maxRetransmits,latencyMs:Math.round(pair.currentRoundTripTime*1000)};
  });
  assert.equal(stats.protocol,'udp');assert.equal(stats.ordered,false);assert.equal(stats.maxRetransmits,0);
  report.channels.push({visibility,...stats});
}
async function captureSweep(p){
  return p.evaluate(async()=>{
    const api=__controllerkit.adapter().api, phones=__fakeBle.phones, wait=()=>new Promise(requestAnimationFrame);
    function pose(phone,yaw,pitch,speed=100){
      const z=yaw*Math.PI/360,x=pitch*Math.PI/360;
      const q=[Math.cos(z)*Math.sin(x),Math.sin(z)*Math.sin(x),Math.sin(z)*Math.cos(x),Math.cos(z)*Math.cos(x)];
      const v=new DataView(new ArrayBuffer(20));
      v.setUint8(0,1);v.setUint8(1,3);v.setUint16(2,phone.sequence++,true);v.setUint32(4,phone.time+=16,true);
      q.forEach((n,i)=>v.setInt16(8+i*2,Math.round(n*32767),true));
      v.setUint16(16,speed*100,true);v.setUint16(18,phone.epoch,true);phone.motion.emit(v);
    }
    const feed=async(y,p)=>{phones.forEach((phone,i)=>pose(phone,y+10,p+(i?8:-8)));await wait();await wait();};
    await feed(0,0);__controllerkit.play();await feed(0,0);
    const aims=()=>[0,1].map(i=>{
      const cursor=api.game.getPlayer(i).cursor;
      return [cursor.x/api.game.w+.5,.5-cursor.y/api.game.h];
    });
    const center=aims(), vertical=[],horizontal=[];
    const ptr=__controllerkit.controllers.player(0).motion.pointer;
    const span=ptr.degPerScreen*Math.min(1.25,Math.max(.55,ptr.aspect));
    for(let i=0;i<=20;i++){await feed(0,span*(.5-i/20));vertical.push(aims());}
    await feed(0,-span*.4);const reversed=aims();
    for(let i=0;i<=20;i++){await feed(37-i*3.7,0);horizontal.push(aims());}
    return {center,span,top:vertical[0],bottom:vertical.at(-1),reversed,left:horizontal[0],right:horizontal.at(-1),vertical,horizontal};
  });
}
try{
  const a=await session(base);
  await a.route('**/*',route=>new URL(route.request().url()).origin===new URL(base).origin?route.continue():route.abort());
  await a.locator('[data-game="fruit-ninja"]').click();
  await a.waitForFunction(()=>__controllerkit.current()?.id==='fruit-ninja');
  await pair(a,0);await pair(a,1);
  await a.locator('#roundMode').selectOption('practice');
  report.sweep=await captureSweep(a);
  for(const i of [0,1]){
    const s=report.sweep;
    assert.ok(Math.abs(s.center[i][1]-.5)<.002 && Math.abs(s.center[i][0]-(i*.5+.25))<.002);
    assert.ok(s.top[i][1]<.002 && s.bottom[i][1]>.998 && s.reversed[i][1]<.92);
    assert.ok(s.left[i][0]<=i*.5+.002 && s.right[i][0]>=(i+1)*.5-.002);
    for(let j=1;j<s.vertical.length;j++)assert.ok(s.vertical[j][i][1]>s.vertical[j-1][i][1]+.035);
  }
  assert.equal(sockets.length,0);
  await a.screenshot({path:out+'/local-split.png'});
  await a.locator('#pair1').click();
  await a.unroute('**/*');
  const b=await session(guestBase);await pair(b,0);
  for(const [p,name] of [[a,'Alex'],[b,'Sam']]){await p.locator('#onlineTab').click();await p.locator('#onlineName').fill(name);}
  await a.locator('#createRoom').click();
  const listed=b.locator('.directory-room',{hasText:'Alex'});
  await listed.waitFor();assert.match(await listed.innerText(),/Fruit Ninja.*1\/2/);
  await listed.click();await channel(a,'public');await channel(b,'public');
  await a.locator('#roomDuration').selectOption('30');
  await a.waitForFunction(()=>__controllerkit.online.room.options.duration===30);
  await b.waitForFunction(()=>__controllerkit.online.room.players.every(p=>p.ble));
  assert.equal(await b.locator('#roomGame').isDisabled(),true);
  await a.waitForFunction(()=>!document.getElementById('readyPlayer').disabled && /\d+ ms/.test(document.getElementById('peerLatency').textContent));
  await a.screenshot({path:out+'/public-room.png'});
  await ready(a,b);
  const af=a.frames().find(f=>f.url().includes('/fruit-ninja/')),bf=b.frames().find(f=>f.url().includes('/fruit-ninja/'));
  await af.waitForFunction(()=>__openwii.game.fruits.length>0);
  const wave=await af.evaluate(()=>__openwii.game.fruits.map(f=>[f.id,f.kind.name]));
  await b.waitForFunction(()=>__controllerkit.adapter().api.game.fruits.length>0);
  const peerWave=await bf.evaluate(()=>__openwii.game.fruits.map(f=>[f.id,f.kind.name]));
  assert.ok(wave.some(([id,name])=>peerWave.some(([other,kind])=>id===other && name===kind)));
  // Cross real fruit with the host's mouse, then check that the guest received the cut.
  const box=await a.locator('#gameStage iframe').boundingBox();
  for(let attempt=0;attempt<30;attempt++){
    const target=await af.evaluate(()=>{
      const g=__openwii.game,f=g.fruits.find(f=>f.lane===0&&!f.bomb&&Math.abs(f.y)<g.h*.38);
      return f?__openwii.toScreen(f.x,f.y):null;
    });
    if(target){
      await a.mouse.move(box.x+target.x-45,box.y+target.y);await a.mouse.down();await a.waitForTimeout(30);
      await a.mouse.move(box.x+target.x+45,box.y+target.y,{steps:5});await a.waitForTimeout(50);
      const received=await bf.evaluate(()=>__openwii.game.network.remoteAim);
      await a.mouse.up();
      if(received && await af.evaluate(()=>__openwii.game.getPlayer(0).score>0))break;
    }
    await a.waitForTimeout(100);
  }
  await bf.waitForFunction(()=>__openwii.game.getPlayer(0).score>0);
  report.fruit={score:await bf.evaluate(()=>__openwii.game.getPlayer(0).score),wave,seed:await a.evaluate(()=>__controllerkit.online.room.match.seed)};
  await a.screenshot({path:out+'/online-fruit.png'});
  await a.waitForFunction(()=>!__controllerkit.online.room.match,null,{timeout:45000});
  await b.waitForFunction(()=>!__controllerkit.online.room.match);
  assert.equal(await af.evaluate(()=>__openwii.game.state.score),await bf.evaluate(()=>__openwii.game.state.score));
  await ready(a,b);assert.notEqual(await a.evaluate(()=>__controllerkit.online.room.match.seed),report.fruit.seed);
  await a.locator('#leaveRoom').click();await b.waitForFunction(()=>!__controllerkit.online.room);
  await a.locator('#visibility').selectOption('private');await a.locator('#createGame').selectOption('kart-racing');
  await a.locator('#createRoom').click();
  await a.waitForFunction(()=>__controllerkit.online.room?.public===false);
  const code=await a.locator('#roomCode').textContent();
  await b.waitForFunction(()=>!document.querySelector('.directory-room'));
  assert.match(code,/^[0-9A-F]{10}$/);
  await b.locator('#joinCode').fill(code.toLowerCase());
  await b.locator('#joinForm button').click();
  await channel(b,'private-code');
  await b.locator('#leaveRoom').click();
  await a.waitForFunction(()=>__controllerkit.online.room.players.length===1);
  const invite=await a.locator('#inviteLink').getAttribute('href');
  assert.equal(new URL(invite).searchParams.get('join'),code);
  await b.goto(invite);
  await channel(a,'private');await channel(b,'private');
  await b.waitForFunction(()=>__controllerkit.current()?.id==='kart-racing');
  await pair(b,0);await a.locator('#driver0').selectOption('yoshi');await a.locator('#driver1').selectOption('peach');
  await ready(a,b);
  const k=a.frames().find(f=>f.url().includes('/mario-kart/')),other=b.frames().find(f=>f.url().includes('/mario-kart/'));
  await k.waitForFunction(()=>__openwii.race.state==='racing');await other.waitForFunction(()=>__openwii.race.state==='racing');
  await a.locator('#gameStage iframe').focus();await a.keyboard.down('w');
  await k.waitForFunction(()=>__openwii.race.player.speed>10);
  await a.keyboard.down('d');await a.waitForTimeout(120);await a.keyboard.up('d');
  await other.waitForFunction(()=>__openwii.race.racers[1].speed>10);
  await a.keyboard.up('w');
  report.kart=await other.evaluate(()=>{const r=__openwii.race;return {driver:r.player.character.id,remote:r.racers[1].character.id,s:r.racers[1].s,speed:r.racers[1].speed,lateral:r.racers[1].lateral,steer:r.racers[1].steer,racers:r.racers.length,laps:r.laps};});
  assert.equal(report.kart.driver,'peach');assert.equal(report.kart.remote,'yoshi');
  await b.screenshot({path:out+'/online-kart.png'});
  // Drive both full laps through the ordinary input handlers. The guest holds
  // throttle on its own simulated BLE controller and steers with its orientation.
  await b.evaluate(()=>{
    const d=__fakeBle.phones[0];d.pose(0);
    d.captureOrigin=performance.now()-d.time;
  });
  const drive=async(page,frame,bleThrottle)=>{
    await page.locator('#gameStage iframe').focus();
    await frame.evaluate(async()=>{
      const {surfaceAt}=await import('./track.js');
      window.driveReading=()=>{
        const race=__openwii.race,r=race.player,p=surfaceAt(r.s+10+Math.abs(r.speed)*.35,0);
        const turn=Math.atan2(p.x-r.x,-(p.z-r.z))-r.heading;
        return {angle:Math.atan2(Math.sin(turn),Math.cos(turn)),finish:r.finishTime,item:r.item,peerItem:race.racers[1].item,
          objects:race.objects.filter(o=>o.remote).map(o=>o.type)};
      };
    });
    const keys=new Set(),seenItems=new Set(),seenObjects=new Set();
    const until=Date.now()+150000;
    try{
      while(Date.now()<until){
        const r=await frame.evaluate(()=>driveReading());
        if(r.finish!==null)return {time:r.finish,peerHeld:[...seenItems],remoteObjects:[...seenObjects]};
        if(bleThrottle)await page.evaluate(turn=>{
          const d=__fakeBle.phones[0],v=new DataView(new ArrayBuffer(20));
          const pitch=Math.max(-38,Math.min(38,turn*120))*Math.PI/360;
          v.setUint8(0,1);v.setUint8(1,3);v.setUint16(2,d.sequence++,true);v.setUint32(4,d.time=Math.round(performance.now()-d.captureOrigin),true);
          [Math.sin(pitch),0,0,Math.cos(pitch)].forEach((n,i)=>v.setInt16(8+2*i,Math.round(n*32767),true));
          v.setUint16(16,4000,true);v.setUint16(18,d.epoch,true);
          d.motion.emit(v);d.buttons(1<<7);
        },r.angle);
        const wanted=new Set(bleThrottle?[]:['w']);
        if(!bleThrottle){if(r.angle>.07)wanted.add('d');else if(r.angle<-.07)wanted.add('a');}
        for(const key of [...keys])if(!wanted.has(key)){await page.keyboard.up(key);keys.delete(key);}
        for(const key of wanted)if(!keys.has(key)){await page.keyboard.down(key);keys.add(key);}
        if(r.peerItem)seenItems.add(r.peerItem);
        for(const type of r.objects)seenObjects.add(type);
        if(r.item){await page.waitForTimeout(95);await page.keyboard.press('Space');}
        await page.waitForTimeout(55);
      }
      const diagnostic=await page.evaluate(()=>{
        const {player}=__controllerkit.adapter().api.race;
        const motion=__controllerkit.controllers.player(0).motion;
        return {s:player.s,speed:player.speed,steer:player.steer,live:motion.pointer.live,capture:motion.lastSensorTime,age:performance.now()-motion.lastSampleAt};
      });
      throw Error('Online lap did not finish: '+JSON.stringify(diagnostic));
    }finally{
      for(const key of keys)await page.keyboard.up(key);
      if(bleThrottle)await page.evaluate(()=>__fakeBle.phones[0].buttons(0));
    }
  };
  report.races=await Promise.all([drive(a,k,false),drive(b,other,true)]);
  await a.waitForFunction(()=>!__controllerkit.online.room.match,null,{timeout:30000});
  await b.waitForFunction(()=>!__controllerkit.online.room.match);
  const finalOrder=frame=>frame.locator('#standings .standing').allTextContents();
  await Promise.all([k,other].map(f=>f.waitForFunction(()=>__openwii.race.state==='results' && !document.getElementById('results').hidden)));
  await a.waitForTimeout(1600);
  const [hostRows,guestRows]=await Promise.all([finalOrder(k),finalOrder(other)]);
  assert.equal(hostRows.length,8);assert.deepEqual(hostRows,guestRows);report.standings=hostRows;
  await a.screenshot({path:out+'/kart-results.png'});
  report.rtcFrames=await a.evaluate(()=>__controllerkit.online.peer.pc.getStats().then(stats=>[...stats.values()].find(s=>s.type==='data-channel')?.messagesSent));
  await ready(a,b);
  await b.locator('#leaveRoom').click();await a.waitForFunction(()=>__controllerkit.online.room.players.length===1 && !__controllerkit.online.playing);
  await a.locator('#playTab').click();await a.waitForFunction(()=>__controllerkit.current()?.id==='fruit-ninja' && !__controllerkit.online.active);
  await a.locator('#roundPlayers').selectOption('1');
  await a.locator('#startGame').click();
  await a.waitForFunction(()=>{const g=__controllerkit.adapter().api.game;return g.state.phase==='playing' && !g.splitScreen && !g.network;});
  assert.equal(await a.evaluate(()=>__controllerkit.ble.connected(0)),true);
  assert.deepEqual(report.consoleErrors,[]);assert.deepEqual(report.pageErrors,[]);
  console.log('Verified split sweeps, BLE status, both UDP lobbies, live Fruit and Kart, rematch and return to local play.');
}catch(err){
  for(const page of browser.contexts().flatMap(ctx=>ctx.pages()))console.error(page.url(),await page.locator('#lobbyStatus').textContent({timeout:1000}).catch(()=>''),await page.evaluate(()=>({room:window.__controllerkit?.online?.room,detail:document.getElementById('playerDetail0')?.textContent,notice:document.getElementById('notice')?.textContent,phoneProfile:window.__fakeBle?.phones[0].profile?.profileEpoch,hostProfile:window.__controllerkit?.controllers.profileEpoch,ready:window.__controllerkit?.controllers.player(0).ready})));
  throw err;
}finally{
  await writeFile(out+'/report.json',JSON.stringify(report,null,2));await browser.close();
}
