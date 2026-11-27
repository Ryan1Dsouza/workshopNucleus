// Real browser regressions for mouse ownership, two BLE lanes and lifecycle.
// The caller supplies a page whose context has the simulated GATT fixture.
function usePhoneClocks(){
  const start=performance.now();
  for(const phone of __fakeBle.phones){
    const base=phone.time;
    phone.captureClock=now=>base+Math.round(now-start);
  }
}
export async function checkPendingPhoneStart(host,{screenshot}={}){
  const page=await host.context().newPage();
  try{
    await page.goto(new URL('/host/',host.url()).href);await page.waitForFunction(()=>window.__controllerkit);
    await page.evaluate(usePhoneClocks);
    await page.click('#pair0');await page.waitForFunction(()=>__controllerkit.controllers.player(0).ready);
    await page.evaluate(()=>{__fakeBle.phones[0].writeDelay=60;__setupMotion=setInterval(()=>__fakeBle.phones[0].pose(0,0),16);});
    await page.click('[data-game="fruit-ninja"]');await page.waitForFunction(()=>__controllerkit.adapter()?.api);
    const frame=page.frames().find(f=>f.url().includes('/games/fruit-ninja/index.html'));
    await page.click('#startGame');
    const waiting=await page.evaluate(()=>({ready:__controllerkit.controllers.player(0).ready,phase:__controllerkit.adapter().api.game.state.phase,badge:document.getElementById('modeBadge').textContent}));
    if(waiting.ready||waiting.phase==='playing'||waiting.badge!=='Preparing phones')throw Error('Play started before the slow phone profile was ready: '+JSON.stringify(waiting));
    if(screenshot)await page.screenshot({path:screenshot,fullPage:true});
    await page.waitForFunction(()=>__controllerkit.controllers.player(0).ready&&__controllerkit.adapter().api.game.state.phase==='playing');
    await page.evaluate(()=>{clearInterval(__setupMotion);__fakeBle.phones[0].pose(12,120);});await page.waitForTimeout(35);
    await frame.evaluate(async()=>{const {FRUIT_TYPES}=await import('/games/fruit-ninja/logic.js'),g=__openwii.game;g.state.nextSpawn=Infinity;g.fruits=[{id:93991,x:0,y:0,vx:0,vy:3,r:.62,rot:0,spin:0,spinAxis:{x:1,y:0,z:0},kind:FRUIT_TYPES[3]}];});
    for(const angle of [8,4,0,-4,-8,-12]){await page.evaluate(angle=>__fakeBle.phones[0].pose(angle,250),angle);await page.waitForTimeout(25);}
    await frame.waitForFunction(()=>__openwii.game.state.score>0&&!__openwii.game.paused);
    return ['Play waits for slow phone profile readiness without launching uncuttable fruit','the queued first Play starts automatically and the first gyro sweep cuts'];
  }finally{await page.close();await host.bringToFront();}
}

export async function checkFruitGame(host) {
  const page=await host.context().newPage(),checks=[];
  const check=(value,message)=>{if(!value)throw new Error(message);checks.push(message);};
  try {
    await page.goto(new URL('/host/',host.url()).href);await page.waitForFunction(()=>window.__controllerkit);
    await page.evaluate(usePhoneClocks);
    await page.click('[data-game="fruit-ninja"]');await page.waitForFunction(()=>__controllerkit.adapter()?.api);
    await page.selectOption('#roundDuration','120');
    let game=page.frames().find(frame=>frame.url().includes('/games/fruit-ninja/index.html'));
    check(await game.evaluate(()=>__openwii.rendererWarmup.programs>0&&__openwii.game.fruits.length===0&&__openwii.game.halves.length===0),'renderer warms materials before Play without spawning gameplay objects');
    await page.click('#startGame');
    check(await game.evaluate(()=>!__openwii.game.infiniteLives&&__openwii.game.durationMs===120000),'Classic and selected timer start from Play');
    let id=93000;
    const place=async(bomb=false,x=.5)=>{
      const fruitId=++id;
      await game.evaluate(async({fruitId,bomb,x})=>{
        const {FRUIT_TYPES}=await import('/games/fruit-ninja/logic.js'),g=__openwii.game,p=__openwii.toWorld(x,.5);
        g.state.nextSpawn=Infinity;g.fruits=[{id:fruitId,x:p.x,y:p.y,vx:0,vy:3,r:.62,rot:0,spin:0,spinAxis:{x:1,y:0,z:0},kind:FRUIT_TYPES[3],bomb,lane:g.splitScreen?(x<.5?0:1):undefined}];
      },{fruitId,bomb,x});
      await game.waitForFunction(fruitId=>__openwii.meshes.has(fruitId),fruitId);
      return fruitId;
    };
    const field=await page.locator('iframe[title="Fruit Ninja game"]').boundingBox();
    await page.mouse.move(field.x+field.width*.28,field.y+field.height*.55);
    await page.mouse.down();
    await game.evaluate(()=>{
      const canvas=document.querySelector('canvas');
      const ribbon=()=>__openwii.visuals.get(0).screen.paths[1].getAttribute('d');
      canvas.addEventListener('pointermove',e=>{
        window.firstDrag={path:!!ribbon(),ms:performance.now()-e.timeStamp};
      },{once:true});
      canvas.addEventListener('pointerup',()=>{window.releasedRibbon=!!ribbon();},{once:true});
    });
    await page.mouse.move(field.x+field.width*.38,field.y+field.height*.55);
    await page.mouse.up();
    const drag=await game.evaluate(()=>({first:window.firstDrag,release:window.releasedRibbon}));
    check(drag.first?.path && drag.release,'first pointermove draws the ribbon within the event ('+drag.first?.ms.toFixed(1)+' ms), and release preserves it');
    await game.waitForFunction(()=>!__openwii.visuals.get(0).screen.paths[1].getAttribute('d'));
    const sweep=async(fruitId,start=.3,end=.7,held=true)=>{
      const box=await page.locator('iframe[title="Fruit Ninja game"]').boundingBox();
      const target=()=>game.evaluate(fruitId=>{const f=__openwii.game.fruits.find(f=>f.id===fruitId);return f?__openwii.toScreen(f.x,f.y):null;},fruitId);
      const first=await target();await page.mouse.move(box.x+box.width*start,box.y+first.y);
      if(held){await page.mouse.down();await game.waitForFunction(()=>__openwii.game.getPlayer(0).cursor.active);}
      for(let step=1;step<=12;step++){
        const point=await target();if(!point)break;
        await page.mouse.move(box.x+box.width*(start+(end-start)*step/12),box.y+point.y);await page.waitForTimeout(20);
      }
      if(held)await page.mouse.up();
    };
    let fruitId=await place();await sweep(fruitId);
    check(await game.evaluate(()=>__openwii.game.state.score>0&&!__openwii.game.paused),'first Play immediately allows a held mouse slice');
    fruitId=await place();await sweep(fruitId,.3,.7,false);
    check(await game.evaluate(fruitId=>__openwii.game.fruits.some(f=>f.id===fruitId)&&!__openwii.game.getPlayer(0).cutting,fruitId),'hover shows the pointer without cutting');
    await page.click('#pair0');await page.waitForFunction(()=>__controllerkit.controllers.player(0).ready);
    await page.evaluate(()=>{__phoneStream=setInterval(()=>__fakeBle.phones[0].pose(0,0),16);});
    await page.waitForFunction(()=>__controllerkit.controllers.player(0).motion.pointer.live);
    await page.click('[data-game="remote"]');await page.waitForFunction(()=>__controllerkit.current().id==='remote'&&__controllerkit.controllers.player(0).ready);
    await page.click('[data-game="fruit-ninja"]');await page.waitForFunction(()=>__controllerkit.adapter()?.api&&__controllerkit.controllers.player(0).ready);
    game=page.frames().find(frame=>frame.url().includes('/games/fruit-ninja/index.html'));
    await page.click('#startGame');fruitId=await place();await sweep(fruitId);
    const firstPlayState=await game.evaluate(()=>({score:__openwii.game.state.score,paused:__openwii.game.paused,phase:__openwii.game.state.phase,cursor:__openwii.game.cursor}));
    check(firstPlayState.score>0&&!firstPlayState.paused,'first Play accepts mouse input while a phone is live: '+JSON.stringify(firstPlayState));
    await game.waitForFunction(()=>__openwii.pointer.live&&!__openwii.game.getPlayer(0).cutting);
    check(await game.evaluate(()=>__openwii.game.getPlayer(0).trail.points.length<=1),'mouse release returns to phone without a phantom stroke');
    const box=await page.locator('#gameStage iframe').boundingBox();
    await page.mouse.move(box.x+box.width*.15,box.y+box.height*.7);
    await page.evaluate(()=>clearInterval(__phoneStream));
    await game.waitForFunction(()=>!__openwii.pointer.live);
    const heldAim=await game.evaluate(()=>{
      __openwii.drawTrail();
      const screen=__openwii.visuals.get(0).screen;
      return {visible:screen.active,x:screen.position.x,y:screen.position.y};
    });
    check(heldAim.visible&&Math.abs(heldAim.x-.5)<.01&&Math.abs(heldAim.y-.5)<.01,'a parked mouse cannot move the phone dot when BLE packets pause');
    await page.click('#restartGame');fruitId=await place(true);await sweep(fruitId);
    check(await game.evaluate(()=>__openwii.game.state.phase==='playing'&&__openwii.game.state.lives===2&&document.querySelectorAll('#lives .lost').length===1),'Classic bomb costs one life and keeps the round running');
    await game.evaluate(async()=>{const {FRUIT_TYPES}=await import('/games/fruit-ninja/logic.js'),g=__openwii.game;g.fruits=[{id:93888,x:0,y:-g.h/2-3,vx:0,vy:-1,r:.62,rot:0,spin:0,spinAxis:{x:1,y:0,z:0},kind:FRUIT_TYPES[3]}];});
    await game.waitForFunction(()=>__openwii.game.fruits.length===0);
    check(await game.evaluate(()=>__openwii.game.state.lives===2&&__openwii.game.state.phase==='playing'),'missed fruit costs no life');
    await game.evaluate(()=>{__openwii.game.state.lives=1;});fruitId=await place(true);await sweep(fruitId);
    check(await game.evaluate(()=>__openwii.game.state.phase==='over'&&__openwii.game.state.lives===0),'last bomb life ends the round');
    await page.selectOption('#roundMode','practice');await page.click('#restartGame');
    await game.evaluate(()=>{__openwii.game.state.score=20;__openwii.game.getPlayer(0).score=20;});
    fruitId=await place(true);await sweep(fruitId);
    check(await game.evaluate(()=>__openwii.game.state.phase==='playing'&&__openwii.game.state.lives===3&&__openwii.game.state.score===10),'Practice bomb applies its point penalty and keeps unlimited lives');
    await page.evaluate(()=>{__fakeBle.next=1;});await page.click('#pair1');
    await page.waitForFunction(()=>__controllerkit.controllers.player(1).ready&&__controllerkit.adapter().api.game.splitScreen);
    check(await page.locator('#roundPlayers').inputValue()==='2','two Bluetooth phones automatically enable split-screen');
    await page.click('#restartGame');
    const boundaries=await game.evaluate(()=>{
      const api=__openwii,s=(slot,x)=>({slot,connected:true,ready:true,session:'boundary-'+slot,motionLive:true,axes:{x,y:.5},displayAxes:{x,y:.5},reset:false,cutting:false});
      const points=[];
      for(const x of [-1,0,.5,1,2]){for(const slot of [0,1]){api.setControllerState(slot,s(slot,x));api.drawTrail();points.push({slot,input:x,x:api.visuals.get(slot).screen.position.x});}}
      return points;
    });
    check(boundaries.every(p=>p.x===(p.slot+Math.max(0,Math.min(1,p.input)))/2),'both visible phone pointers reach the edges and center of their own lanes');
    await page.evaluate(()=>{for(const phone of __fakeBle.phones){phone.pose(0,0);phone.center(0);}});await page.waitForTimeout(50);
    for(const slot of [0,1]){
      await game.evaluate(()=>{__openwii.game.fruits=[];});
      await page.evaluate(slot=>{__fakeBle.phones[slot].pose(12,120);},slot);await page.waitForTimeout(30);
      fruitId=await place(false,slot===0?.25:.75);
      const before=await game.evaluate(slot=>__openwii.game.getPlayer(slot).score,slot);
      for(const angle of [8,4,0,-4,-8,-12]){await page.evaluate(({slot,angle})=>__fakeBle.phones[slot].pose(angle,250),{slot,angle});await page.waitForTimeout(25);}
      await game.waitForFunction(({slot,before})=>__openwii.game.getPlayer(slot).score>before,{slot,before});
    }
    checks.push('both simulated BLE phones slice fruit in their own lanes');
    fruitId=await place(false,.25);const before=await game.evaluate(()=>__openwii.game.getPlayer(0).score);await sweep(fruitId,.1,.4);
    check(await game.evaluate(before=>__openwii.game.getPlayer(0).score>before,before),'mouse slicing also works in Player 1 split lane');
    await page.click('#restartGame');await game.evaluate(()=>{__openwii.game.state.nextSpawn=Infinity;});
    const beforePause=await game.evaluate(()=>__openwii.game.state.startedAt);
    const background=async hidden=>page.evaluate(hidden=>{
      Object.defineProperty(document,'hidden',{configurable:true,value:hidden});
      Object.defineProperty(document,'hasFocus',{configurable:true,value:()=>!hidden});
      document.dispatchEvent(new Event('visibilitychange'));window.dispatchEvent(new Event(hidden?'blur':'focus'));
    },hidden);
    await background(true);await page.waitForFunction(()=>__controllerkit.adapter().api.game.paused&&document.getElementById('modeBadge').textContent==='Paused');
    const remaining=await game.evaluate(()=>__openwii.game.state.remainingMs);await page.waitForTimeout(180);
    check(await game.evaluate(remaining=>__openwii.game.state.remainingMs===remaining,remaining),'background pause freezes the selected timer');
    await background(false);await page.waitForFunction(()=>!__controllerkit.adapter().api.game.paused&&document.getElementById('modeBadge').textContent==='Playing');
    check(await game.evaluate(start=>__openwii.game.state.startedAt-start>=170&&__openwii.game.state.phase==='playing',beforePause),'returning resumes the same round and excludes background time');
    await page.click('#pauseGame');await background(true);await background(false);await page.waitForTimeout(40);
    check(await game.evaluate(()=>__openwii.game.paused),'manually paused rounds remain paused after switching away');
    await page.click('#pauseGame');await game.waitForFunction(()=>!__openwii.game.paused);
    await game.evaluate(()=>{const g=__openwii.game;g.fruits=[];g.state.nextSpawn=Infinity;g.state.startedAt=performance.now()-g.durationMs+80;});
    await game.waitForFunction(()=>__openwii.game.state.phase==='over');
    check(await game.evaluate(()=>document.getElementById('panel').textContent.includes('TIME UP')&&__openwii.game.state.remainingMs===0),'timer expiry ends the round with Time up');
    const endedAt=await game.evaluate(()=>__openwii.game.state.startedAt);
    await page.evaluate(()=>__fakeBle.phones[0].buttons(16));await page.waitForTimeout(60);await page.evaluate(()=>__fakeBle.phones[0].buttons(0));
    if(!await game.evaluate(start=>__openwii.game.state.phase==='over'&&__openwii.game.state.startedAt===start,endedAt))throw Error('A restarted the ended round');
    if(!await game.evaluate(()=>document.querySelector('#panel .cta').textContent.trim()==='Space to play again'))throw Error('Restart hint is not Space-only');
    await game.evaluate(()=>window.focus());await page.keyboard.press('Space');await game.waitForFunction(()=>__openwii.game.state.phase==='playing');
    checks.push('A cannot restart an ended round; Space restarts and is the only game-over hint');
    return checks;
  } finally {await page.close();await host.bringToFront();}
}
