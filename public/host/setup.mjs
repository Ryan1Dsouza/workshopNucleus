import { roomCode } from '/core/room.js';
import { features } from '../stage.mjs';
const $=id=>document.getElementById(id), room=roomCode();
let health=false, api=null;
try {
  const response=await fetch('/api/health',{cache:'no-store'}), data=await response.json();
  health=data.app==='air-slice';
} catch {}
if(!health) {
  $('serverNote').textContent='The previous server is still running. Stop it in its terminal, then run npm start and reload both screens.';
} else $('serverNote').textContent=features.bluetooth?'Bluetooth: install Android app → Start Bluetooth → Connect below → Center blade':features.phone?'Scan the QR code, enable motion and center the blade.':'Hold the mouse button and drag through fruit.';
let origin=location.origin;
if(features.phone && ['localhost','127.0.0.1','[::1]'].includes(location.hostname)) {
  try {
    const info=await fetch('/connection-info').then(r=>r.json());
    if(info.httpsPort && info.addresses?.length) {
      for(const address of info.addresses){const option=document.createElement('option');option.value=`https://${address}:${info.httpsPort}`;option.textContent=option.value;$('joinOrigin').appendChild(option);}
      origin=$('joinOrigin').value; $('addressChooser').hidden=false;
    }
  }catch{}
  $('networkNote').textContent='These QR codes use local HTTPS. Accept the development certificate on your phone. For your tunnel, open this screen through the Cloudflare HTTPS link before scanning.';
}
function drawCodes() {
  $('androidApp').href=origin+'/downloads/air-slice-ble.apk';
  for(const slot of [0,1]) {
    const url=`${origin}/controller?room=${room}&slot=${slot}`; $('join'+slot).href=url;
    $('qr'+slot).replaceChildren();
    if(typeof QRCode==='function')new QRCode($('qr'+slot),{text:url,width:128,height:128,colorDark:'#171916',colorLight:'#fff9e9',correctLevel:QRCode.CorrectLevel.M});
  }
}
if(features.phone)drawCodes(); $('joinOrigin').addEventListener('change',e=>{origin=e.target.value;drawCodes();});
function start(practice,bladeOnly=false) {api??=window.__openwii;if(!api)return;api.setBladeOnly(bladeOnly);api.game.infiniteLives=practice;api.audio.unlock();api.startGame();}
$('startPractice').addEventListener('click',()=>start(true));
$('startClassic').addEventListener('click',()=>start(false));
$('startBladeCheck').addEventListener('click',()=>start(true,true));
$('bladeOnlyToggle').addEventListener('click',()=>api?.setBladeOnly(!api.bladeOnly()));
$('back').addEventListener('click',()=>api?.pauseGame());
for(const slot of [0,1])$('bluetooth'+slot).addEventListener('click',async()=>{
  api??=window.__openwii;if(!api)return;
  const button=$('bluetooth'+slot);button.disabled=true;$('bleState'+slot).textContent='Choose the phone running Air Slice Bluetooth.';
  try {if(api.bluetooth.has(slot))api.bluetooth.disconnect(slot);else await api.bluetooth.connect(slot);}
  catch(error){$('bleState'+slot).textContent=error.name==='NotFoundError'?'Pairing cancelled. Start Bluetooth in the Android app and try again.':error.message;}
  finally{button.disabled=false;}
});
$('fullscreen').addEventListener('click',()=>{if(!document.fullscreenElement)void document.documentElement.requestFullscreen?.().catch(()=>{});else void document.exitFullscreen?.();});
document.addEventListener('air-bluetooth',e=>{$('bleState'+e.detail.slot).textContent=e.detail.text;});
document.addEventListener('air-link',e=>{
  const s=e.detail;
  if(!features.direct){$('networkNote').textContent=s.mode==='offline'?'Server connection lost. Waiting to reconnect.':'Phone motion uses the server relay.';return;}
  if(api?.bluetooth.devices.size){$('networkNote').textContent='Bluetooth motion goes directly from the Android app to this laptop. Wi-Fi is only used by any QR-paired players.';return;}
  if(s.mode==='direct')$('networkNote').textContent=`${s.directPeers}/${s.peers} phones direct · ${s.rtt ?? '…'} ms round trip · ${Math.round(s.rate) || '…'} samples/s`;
  else if(health)$('networkNote').textContent=s.mode==='offline'?'Server connection lost. Waiting to reconnect.':'Negotiating a direct connection. If it fails, motion uses the server relay; guest Wi-Fi can block direct links.';
});
setInterval(()=>{
  api=window.__openwii;if(!api)return;
  for(const slot of [0,1]){
    const peer=api.link.slots.find(p=>p.slot===slot&&p.occupied),input=api.inputs.get(slot);
    const fresh=input&&performance.now()-input.lastSampleAt<150;
    const transport=peer&&api.link.peers.get(peer.id),direct=transport?.motion?.readyState==='open';
    const ble=api.bluetooth.devices.get(slot);
    if(ble){$('phone'+slot).textContent=ble.connected?'Bluetooth connected':'Bluetooth waiting';$('bleState'+slot).textContent=ble.text||'';}
    else $('phone'+slot).textContent=!peer?'Scan to connect':fresh?(direct?'Motion ready · direct':'Motion ready · relay'):input?.session?'Connected · idle':'Connected · enable motion';
    $('bluetooth'+slot).textContent=ble?'Disconnect Bluetooth':'Connect Bluetooth · Player '+(slot+1);
    if(input){const p=input.pointer.position;$('aim'+slot).style.left=p.x*100+'%';$('aim'+slot).style.top=p.y*100+'%';}
  }
},200);
