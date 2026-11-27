// Replay captured-time quaternions through the host's actual GATT listeners.
import {chromium} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {installFakeBluetooth} from '../../tests/helpers/fake-bluetooth.mjs';

const browser=await chromium.launch({channel:'chrome',headless:true});
const report={chrome:browser.version(),viewport:[1366,900],consoleErrors:[],pageErrors:[],games:{}};
const dir='test-results/ble-steering';
await mkdir(dir,{recursive:true});
try {
  for(const game of ['kart-racing','fruit-ninja']){
    const ctx=await browser.newContext({viewport:{width:1366,height:900}});
    await ctx.addInitScript(installFakeBluetooth);
    const page=await ctx.newPage();
    page.on('pageerror',e=>report.pageErrors.push(e.message));
    page.on('console',e=>{if(e.type()==='error')report.consoleErrors.push(e.text());});
    await page.goto((process.env.HOST_URL||'http://localhost:3000')+'/host/');
    await page.locator('[data-game="'+game+'"]').click();
    await page.waitForFunction(id=>__controllerkit.current()?.id===id&&__controllerkit.adapter()?.api,game);
    const count=game==='kart-racing'?1:2;
    if(game==='kart-racing')await page.frameLocator('#gameStage iframe').locator('[data-steering="gyro"]').click();
    for(let slot=0;slot<count;slot++){
      await page.evaluate(slot=>{__fakeBle.next=slot;},slot);
      await page.locator('#pair'+slot).click();
      await page.waitForFunction(slot=>__controllerkit.controllers.player(slot).ready,slot);
    }
    await page.evaluate(()=>{
      const handles=[];
      for(const d of __fakeBle.phones.slice(0,__controllerkit.current().id==='kart-racing'?1:2)){
        const base=d.time, start=performance.now();
        const neutral=()=>{d.time=base+Math.round(performance.now()-start);d.pose();};
        neutral();handles.push(setInterval(neutral,22));
      }
      window.stopWarmup=()=>handles.forEach(clearInterval);
    });
    if (count===2) await page.locator('#roundMode').selectOption('practice');
    await page.locator('#startGame').click();
    await page.waitForFunction(()=>{const api=__controllerkit.adapter().api;return api.race?.state==='racing'||api.game?.state.phase==='playing';});
    report.games[game]=await page.evaluate(async count=>{
      stopWarmup();
      const api=__controllerkit.adapter().api,kart=!!api.race;
      const phones=__fakeBle.phones.slice(0,count);
      if (kart) {
        const epoch=phones[0].profile.profileEpoch;
        phones[0].control.emit([0x44,1,epoch&255,epoch>>>8]);
      }
      const offset=phones.map(d=>d.time+40);
      const captures=[],arrivals=[],frames=[],readings=[],measured=[],live=[],batchSizes=[];
      const accepted=phones.map(()=>0);
      const pts=__controllerkit.controllers.player(0).motion.pointer;
      const span=pts.degPerScreen*Math.min(1.25,Math.max(.55,pts.aspect));
      const period=1000, duration=6800;
      // A neutral lead-in followed by six left/right cycles. Both axes of the
      // split-screen blade sweep beyond each edge and return to center.
      const phase=t=>2*Math.PI*Math.max(0,t-400)/period;
      const angle=t=>(kart?33:span*.55)*Math.sin(phase(t));
      const hzPattern=[17,40,17,25,33,17,40,20];
      const packets=[];
      for(let t=0,i=0;t<=duration;t+=hzPattern[i++%hzPattern.length])packets.push(t);
      function emit(d,slot,t,i){
        const a=(slot?-1:1)*angle(t)*Math.PI/360;
        const z=kart?0:35*Math.sin(phase(t))*Math.PI/360;
        const q=[Math.cos(z)*Math.sin(a),Math.sin(z)*Math.sin(a),Math.sin(z)*Math.cos(a),Math.cos(z)*Math.cos(a)];
        const v=new DataView(new ArrayBuffer(20));
        v.setUint8(0,1);v.setUint8(1,3);v.setUint16(2,d.sequence++,true);v.setUint32(4,d.time=offset[slot]+t,true);
        q.forEach((n,j)=>v.setInt16(8+2*j,Math.round(n*32767),true));
        const prev=packets[Math.max(0,i-1)];
        const speed=Math.abs(angle(t)-angle(prev))*1000/Math.max(1,t-prev);
        v.setUint16(16,Math.min(65535,Math.round(speed*100)),true);v.setUint16(18,d.epoch,true);
        d.motion.emit(v);
        if (__controllerkit.controllers.player(slot).motion.lastSensorTime===d.time) accepted[slot]++;
      }
      const start=performance.now(), lanes=phones.map(()=>({minX:1,maxX:0,minY:1,maxY:0}));
      let done=false;
      const sample=()=>{
        const t=performance.now()-start;
        frames.push(t);
        live.push(__controllerkit.controllers.player(0).motion.pointer.live);
        readings.push(kart?api.race.player.steer:.5-api.visuals.get(0).screen.position.y);
        if (!kart) measured.push(api.game.getPlayer(0).cursor.y/api.game.h);
        if(!kart)lanes.forEach((lane,i)=>{
          const {x,y}=api.visuals.get(i).screen.position;
          lane.minX=Math.min(lane.minX,x);lane.maxX=Math.max(lane.maxX,x);
          lane.minY=Math.min(lane.minY,y);lane.maxY=Math.max(lane.maxY,y);
        });
        if(!done)requestAnimationFrame(sample);
      };
      requestAnimationFrame(sample);
      const batchPattern=[1,2,1,3,1,1,2,1], jitter=[2,8,3,6];
      for(let i=0,b=0;i<packets.length;b++){
        const size=Math.min(batchPattern[b%batchPattern.length],packets.length-i);
        const due=packets[i+size-1]+jitter[b%jitter.length];
        await new Promise(r=>setTimeout(r,Math.max(0,start+due-performance.now())));
        batchSizes.push(size);
        for(let j=0;j<size;j++,i++){
          captures.push(packets[i]);arrivals.push(performance.now()-start);
          phones.forEach((d,slot)=>emit(d,slot,packets[i],i));
        }
        if(kart && b%8===0)phones[0].buttons(1<<7);
      }
      done=true;
      const pct=(arr,q)=>[...arr].sort((a,b)=>a-b)[Math.ceil(q*arr.length)-1];
      const round=n=>Number(n.toFixed(3));
      const gaps=frames.slice(1).map((t,i)=>t-frames[i]);
      const median=pct(gaps,.5);
      function crossingLags(values){
        const lag=[];
        // Interpolate the signed crossing between adjacent observed frames.
        // Skip the initial deadband and first warm-up cycle.
        for(let half=2;400+half*period/2<duration-200;half++){
          const cross=400+half*period/2,dir=half%2?-1:1;
          const k=values.findIndex((v,i)=>i>0 && frames[i]>=cross && frames[i]<cross+400 && v*dir>0 && values[i-1]*dir<=0);
          if(k>0)lag.push(frames[k-1]+(frames[k]-frames[k-1])*Math.abs(values[k-1]/(values[k]-values[k-1]))-cross);
        }
        return lag;
      }
      const lag=crossingLags(readings);
      const interarrival=arrivals.slice(1).map((t,i)=>t-arrivals[i]);
      return {packetsPerSlot:captures.length,accepted,slots:count,arrivalGapP95Ms:round(pct(interarrival,.95)),
        arrivalGapMaxMs:round(Math.max(...interarrival)),collisionCursorLagMs:kart?undefined:round(pct(crossingLags(measured),.5)),captureHz:round((captures.length-1)*1000/captures.at(-1)),
        deliveredHz:round((arrivals.length-1)*1000/(arrivals.at(-1)-arrivals[0])),batchMax:Math.max(...batchSizes),
        rAF:frames.length,fps:round(gaps.length*1000/(frames.at(-1)-frames[0])),medianFrameMs:round(median),
        frameJitterP95Ms:round(pct(gaps.map(v=>Math.abs(v-median)),.95)),
        medianLagMs:round(pct(lag,.5)),p95LagMs:round(pct(lag,.95)),crossings:lag.map(round),
        motionDropFrames:live.filter(v=>!v).length,range:[Math.min(...readings),Math.max(...readings)],lanes:kart?undefined:lanes,
        active:kart?api.race.state:api.game.state.phase};
    },count);
    const run=report.games[game];console.log(game,run);
    assert.equal(run.active,count===1?'racing':'playing');assert.ok(run.crossings.length>=10);
    if(run.lanes)for(const [i,lane] of run.lanes.entries()){
      assert.ok(lane.minX<=i*.5+.006&&lane.maxX>=(i+1)*.5-.006&&lane.minY<.01&&lane.maxY>.99,JSON.stringify(lane));
    }
    assert.equal(run.motionDropFrames,0);
    assert.ok(run.accepted.every(n=>n===run.packetsPerSlot));
    if(count===1){
      run.buttons=await page.evaluate(async()=>{
        const d=__fakeBle.phones[0], race=__controllerkit.adapter().api.race;
        const settle=ms=>new Promise(r=>setTimeout(r,ms));
        const controls={};
        for(const [name,bit] of [['two',7],['b',5],['one',6],['a',4]]){
          d.buttons(1<<bit);await settle(35);
          const {gas,brake,drift}=race.player.lastInput;controls[name]={gas,brake,drift};
        }
        d.buttons(0);await settle(520);
        d.buttons(1<<1);await settle(120);
        controls.itemWithIdleWheel={steer:race.player.lastInput.steer,live:__controllerkit.controllers.player(0).motion.pointer.live};
        d.buttons(0);return controls;
      });
      assert.ok(run.buttons.two.gas && run.buttons.b.gas && run.buttons.one.brake && run.buttons.a.drift);
      assert.deepEqual(run.buttons.itemWithIdleWheel,{steer:0,live:false});
    }
    if(count===2){
      run.burstCut=await page.evaluate(async()=>{
        // A stationary target displaced from the endpoints of a return slash.
        const game=__controllerkit.adapter().api.game,d=__fakeBle.phones[0];
        const wait=()=>new Promise(requestAnimationFrame);
        d.epoch++;d.control.emit([2,d.epoch&255,d.epoch>>>8]);d.pose();
        await wait();await wait();await wait();
        game.spawn(false,performance.now(),0);
        const f=game.fruits.at(-1);
        Object.assign(f,{x:-game.w*.34,y:0,r:.2,vx:0,vy:0});
        const initialScore=game.getPlayer(0).score;
        d.pose(12,240);d.pose(0,240);d.pose(0,0);
        await wait();await wait();await wait();
        return {removed:!game.fruits.includes(f),scoreChange:game.getPlayer(0).score-initialScore};
      });
      assert.ok(run.burstCut.removed && run.burstCut.scoreChange>0,JSON.stringify(run.burstCut));
    }
    await ctx.close();
  }
  assert.deepEqual(report.consoleErrors,[]);assert.deepEqual(report.pageErrors,[]);
}finally{
  await writeFile(dir+'/'+(process.argv[2]||'latest').replace(/[^a-z0-9_-]/gi,'')+'.json',JSON.stringify(report,null,2));
  await browser.close();
}
