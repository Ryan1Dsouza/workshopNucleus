import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {installFakeBluetooth} from '../../tests/helpers/fake-bluetooth.mjs';

const base=process.env.HOST_URL||'http://localhost:3000';
const blockDirect=process.env.TEST_BLOCK_DIRECT==='1';
const browser=await chromium.launch({channel:'chrome',headless:true});
const errors=[],pages=[];
try {
  for(const host of [true,false]){
    const ctx=await browser.newContext({viewport:{width:1366,height:900}});
    await ctx.addInitScript(installFakeBluetooth);
    await ctx.addInitScript(({host,blockDirect})=>{
      const NativePeer=window.RTCPeerConnection;
      let first=host && !blockDirect;
      window.blockDirect=blockDirect;
      window.RTCPeerConnection=class extends NativePeer{
        constructor(config){
          if(config.iceServers.some(s=>[s.urls].flat().some(url=>/^turns?:/i.test(url))))throw Error('Relay configured');
          // Suppress direct candidates on the simulated restrictive network.
          super({...config,iceTransportPolicy:window.blockDirect?'relay':'all'});
        }
        async createOffer(options){
          if(first){first=false;return new Promise(()=>{});}
          return super.createOffer(options);
        }
      };
    },{host,blockDirect});
    const page=await ctx.newPage();pages.push(page);
    page.on('pageerror',e=>errors.push(e.message));
    page.on('console',e=>{if(e.type()==='error')errors.push(e.text());});
    await page.goto(base+'/host/');
    await page.waitForFunction(()=>!!window.__controllerkit?.online);
    await page.locator('#pair0').click();
    await page.waitForFunction(()=>__controllerkit.controllers.player(0).ready);
    await page.locator('#onlineTab').click();
    await page.locator('#onlineName').fill(host?'Host':'Guest');
  }
  const [host,guest]=pages;
  await host.locator('#visibility').selectOption('private');
  await host.locator('#createGame').selectOption('kart-racing');
  await host.locator('#createRoom').click();
  await host.waitForFunction(()=>__controllerkit.online.room?.capacity===8);
  await guest.locator('#joinCode').fill(await host.locator('#roomCode').textContent());
  await guest.locator('#joinForm button').click();
  await guest.waitForFunction(()=>__controllerkit.online.room?.players.every(p=>p.ble));
  assert.ok(await guest.locator('#readyPlayer').isDisabled());
  for(const p of pages)await p.click('#confirmRoomSteering');
  if(blockDirect){
    await host.getByText('Direct UDP connection unavailable.',{exact:false}).waitFor({timeout:55000});
    assert.ok(await host.locator('#startMatch').isDisabled());
    assert.ok(await guest.locator('#readyPlayer').isDisabled());
    for(const p of pages)await p.evaluate(()=>{window.blockDirect=false;});
    await host.click('#retryPeer');
  }
  if(process.env.TEST_MANUAL_RETRY==='1')await guest.locator('#retryPeer').click();
  for(const p of pages)await p.locator('#readyPlayer').click({timeout:55000});
  await host.locator('#startMatch').click();
  const paths=[];
  for(const page of pages){
    await page.waitForFunction(()=>__controllerkit.adapter()?.api?.race?.state==='racing' &&
      __controllerkit.online.peer.lastSequence>1,null,{timeout:45000});
    const path=await page.evaluate(async()=>{
      const peer=__controllerkit.online.peer, stats=await peer.pc.getStats();
      const transport=[...stats.values()].find(s=>s.type==='transport'&&s.selectedCandidatePairId);
      const pair=stats.get(transport.selectedCandidatePairId), local=stats.get(pair.localCandidateId);
      return {attempt:peer.generation,local:local.candidateType,protocol:local.protocol,
        remote:stats.get(pair.remoteCandidateId).candidateType,
        ordered:peer.channel.ordered,retransmits:peer.channel.maxRetransmits};
    });
    assert.ok(path.attempt>=2);
    assert.equal(path.protocol,'udp');assert.equal(path.ordered,false);assert.equal(path.retransmits,0);
    assert.notEqual(path.local,'relay');assert.notEqual(path.remote,'relay');
    paths.push(path);
  }
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({paths,errors}));
}catch(error){
  console.log(errors);
  for(const page of pages)console.log(await page.evaluate(()=>({status:document.getElementById('lobbyStatus')?.textContent,
    step:window.__controllerkit?.adapter()?.api?.menuStep,current:window.__controllerkit.current()?.id,notice:document.querySelector('#notice')?.textContent,steering:document.querySelector('#roomSteering').disabled,players:window.__controllerkit.online.room?.players.map(p=>[p.linked,p.ready]),state:window.__controllerkit?.online?.peer?.pc?.connectionState,attempt:window.__controllerkit?.online?.peer?.generation})));
  throw error;
}finally{
  await Promise.allSettled(pages.map(p=>p.evaluate(()=>window.__controllerkit?.online?.close())));
  await browser.close();
}
