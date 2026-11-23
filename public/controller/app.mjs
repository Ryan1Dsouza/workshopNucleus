import { MotionLink } from '/core/phone-link.js';
import { SensorStream } from './sensors.mjs';
import { features } from '../stage.mjs';
for (const element of document.querySelectorAll('[data-feature]')) if (!features[element.dataset.feature]) element.hidden = true;
const $ = id=>document.getElementById(id), query = new URLSearchParams(location.search);
const room = query.get('room'), slot = Number(query.get('slot') ?? 0), sensors = new SensorStream();
let enabled = false, paused = false, waiting = false, wakeLock = null, wakeRequest = false;
let lastSend = 0, sendTimer = null, sentAtMark = 0, lastMark = performance.now(), stopped = true;
let generic = null, flashTimer = null, active = true, trackingSmoothing = false;
// Match OpenWii's event-driven ceiling: higher-rate phones needn't wait an
// extra 16 ms before sending their newest pose. Slower sensors aren't upsampled.
const MIN_SEND_MS = 6;
const valid = features.phone && /^[\w-]{16,64}$/.test(room || '') && Number.isInteger(slot) && slot >= 0 && slot < features.players;
$('player').textContent = `Player 0${slot+1}`;
const link = valid ? new MotionLink({ role:'phone',room,slot,
  onStatus: s => {
    $('status').textContent = s.mode === 'direct' ? `${s.text} · ${s.rtt ?? '…'} ms RTT` : s.text;
    if (s.mode === 'replaced') { active = false; stop(); $('enable').disabled = true; }
  },
  onPresence: p=>{ if (!p.host) { stop(); $('tracking').textContent = 'Waiting for the host'; } },
  onReset: ()=>{ link?.clearMotion();sensors.suspend(); stopped=true; },
  onFeedback: d=>{
    if(d.type==='tracking-mode'){trackingSmoothing=!!d.smoothing;return;}
    if (document.hidden || !enabled || paused) return;
    if (d.type === 'slice' || d.type === 'bomb') {
      $('message').textContent = d.type === 'bomb' ? 'Bomb!' : d.combo >= 3 ? `${d.combo} fruit combo!` : 'Sliced!';
      $('flash').classList.add('hit'); clearTimeout(flashTimer); flashTimer=setTimeout(()=>$('flash').classList.remove('hit'),120);
      try { navigator.vibrate?.(d.type === 'bomb' ? [45,25,45] : 15); } catch {}
    }
  }
}) : null;
if (!valid) { $('tracking').textContent='Scan the host QR code'; $('message').textContent='This link is missing its pairing code.'; $('enable').disabled=true; }
async function wake() {
  if (!enabled || !active || document.hidden || wakeRequest || wakeLock && !wakeLock.released || !navigator.wakeLock) return;
  wakeRequest=true;
  try { const lock=await navigator.wakeLock.request('screen'); if (document.hidden || !active) await lock.release(); else { wakeLock=lock; lock.addEventListener('release',()=>{if(wakeLock===lock)wakeLock=null;}); } } catch {} finally { wakeRequest=false; }
}
function stop() { link?.clearMotion();if (!stopped) link?.command({type:'suspend'}); stopped=true; clearTimeout(sendTimer); sendTimer=null; }
function flush() {
  sendTimer=null;
  if (!enabled || paused || !active || document.hidden) return;
  const now=performance.now(), sample=sensors.sample(now);
  if (!sample) { stop(); return; }
  lastSend=now; stopped=false; link.sample(sample);
}
function changed() {
  if (!enabled || paused || document.hidden) return;
  const delay=MIN_SEND_MS-(performance.now()-lastSend);
  if (delay<=0) { clearTimeout(sendTimer); flush(); }
  else if (!sendTimer) sendTimer=setTimeout(flush,delay);
}
function orient(e) { if(enabled && !document.hidden && sensors.orient(e,performance.now()))changed(); }
function motion(e) { if(enabled && !document.hidden && sensors.motion(e,performance.now()))changed(); }
function permission(Type) { try { return Type ? typeof Type.requestPermission==='function' ? Type.requestPermission() : Promise.resolve('granted') : Promise.resolve('unavailable'); } catch(e) {return Promise.reject(e);} }
function genericFallback() {
  if (generic || !enabled || sensors.mode !== 'waiting') return;
  const Type=window.AbsoluteOrientationSensor || window.RelativeOrientationSensor;
  if(!Type)return;
  try {
    generic=new Type({frequency:120,referenceFrame:'device'});
    generic.addEventListener('reading',()=>{if(!document.hidden && sensors.quaternion(Array.from(generic.quaternion || []),performance.now()))changed();});
    generic.addEventListener('error',()=>$('message').textContent='Check motion permissions in your browser settings.');
    generic.start();
  } catch {generic=null;}
}
$('enable').addEventListener('click',async()=>{
  if (enabled || waiting || !valid) return;
  if (!isSecureContext) { $('message').textContent='Open the host through HTTPS and scan its QR code. Motion is blocked on HTTP.'; return; }
  waiting=true; $('enable').disabled=true;
  const result=await Promise.allSettled([permission(window.DeviceOrientationEvent),permission(window.DeviceMotionEvent)]);
  waiting=false;
  const allowed=result.map(r=>r.status==='fulfilled'&&r.value==='granted');
  const genericAvailable=!!(window.AbsoluteOrientationSensor||window.RelativeOrientationSensor);
  if(!allowed.some(Boolean)&&!genericAvailable){ $('enable').disabled=false; $('message').textContent=result.every(r=>r.status==='fulfilled'&&r.value==='unavailable')?'This browser has no motion sensor API. Try Safari on iPhone or Chrome on Android.':'Motion access was denied. Allow it in browser settings and try again.'; return; }
  enabled=true; sensors.suspend();
  if(allowed[0]){window.addEventListener('deviceorientation',orient,true);window.addEventListener('deviceorientationabsolute',orient,true);}
  if(allowed[1])window.addEventListener('devicemotion',motion,true);
  $('enable').hidden=true; $('controls').hidden=false; $('tracking').textContent='Waiting for sensor readings';
  $('message').textContent='Point at the screen and tap Center blade.'; link.command({type:'calibrate'}); void wake();
  setTimeout(genericFallback,1500);
});
$('recenter').addEventListener('click',()=>{
  stop();
  const calibration = sensors.recenter(performance.now());
  link.command({ type:'recentre', ...calibration });
  $('message').textContent = calibration.pose ? 'Centered. Sweep through the fruit.' : 'Waiting for a sensor reading to center the blade.';
  flush();
});
$('play').addEventListener('click',()=>{link.command({type:'start'});});
$('pause').addEventListener('click',()=>{ paused=!paused; stop();sensors.suspend();$('pause').textContent=paused?'Resume motion':'Pause motion';if(!paused)link.command({type:'recentre'});$('tracking').textContent=paused?'Motion paused':'Waiting for readings'; });
$('resetConnection').addEventListener('click',()=>{if(link?.reconnect())$('message').textContent='Resetting the connection. Tap Center blade once it reconnects.';});
$('sensitivity').addEventListener('input',e=>{const value=Number(e.target.value);$('sensitivityValue').textContent=(value/100).toFixed(1)+'×';stop();const calibration=sensors.recenter(performance.now());link?.command({type:'sensitivity',value:value/100,...calibration});flush();});
document.addEventListener('visibilitychange',()=>{stop();sensors.suspend();if(document.hidden){if(wakeLock)void wakeLock.release().catch(()=>{});}else{void wake();genericFallback();}});
window.addEventListener('pagehide',stop);
setInterval(()=>{
  const now=performance.now(), fresh=now-sensors.lastReading<150;
  if(enabled&&!paused){$('tracking').textContent=fresh?(sensors.mode==='gyro-only'?'Live gyro · recenter if drifting':trackingSmoothing?'Light smoothing':'Direct angle tracking'):sensors.pose?'Idle · holding blade position':'Waiting for sensor readings'; if(!fresh)stop();}
    if(now-lastMark>=1000){const d=sensors.diagnostics(now),sent=link?.sent||0;$('metrics').textContent=`Orientation ${Math.round(d.orientationHz)} Hz · Gyro ${Math.round(d.gyroHz)} Hz · Sent ${Math.round((sent-sentAtMark)*1000/(now-lastMark))} Hz`;sentAtMark=sent;lastMark=now;}
},250);
window.__airRemote = { sensors, link, diagnostics:()=>({ sensors:sensors.diagnostics(performance.now()),transport:link?.diagnostics(),secure:isSecureContext,orientation:!!window.DeviceOrientationEvent,motion:!!window.DeviceMotionEvent,generic:!!(window.AbsoluteOrientationSensor||window.RelativeOrientationSensor),wakeLock:!!navigator.wakeLock }) };
