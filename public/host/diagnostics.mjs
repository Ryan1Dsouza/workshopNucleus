const $=id=>document.getElementById(id), ms=v=>Number.isFinite(v)?v.toFixed(1):'—', hz=v=>Number.isFinite(v)?Math.round(v):'—';
import { PeerMetrics } from '/core/diagnostics.js';
export function report() {
  const api=window.__openwii;if(!api)return null;
  const gl=api.renderer.getContext(), ext=gl.getExtension('WEBGL_debug_renderer_info');
  const transport=api.link.diagnostics();transport.peers=transport.peers.filter(p=>!api.bluetooth.has(p.slot)).concat(api.bluetooth.diagnostics());
  return {schema:1,recordedAt:new Date().toISOString(),browser:navigator.userAgent,viewport:{width:innerWidth,height:innerHeight,dpr:devicePixelRatio,renderScale:api.renderer.getPixelRatio()},renderer:ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER),tracking:api.smoothing()?'one-euro':'direct',bladeDisplay:api.smoothBlade()?'interpolated':'raw',displayBufferMs:Object.fromEntries([...api.inputs].map(([slot,input])=>[slot,api.smoothBlade()?input.display.delay:0])),bladeOnly:api.bladeOnly(),filterParameters:{minCutoff:8,beta:.2,derivativeCutoff:1},frames:api.frameMetrics.snapshot(),transport,note:'Bluetooth uses 20-byte native pose notifications directly to the laptop. Smooth dot motion interpolates captured poses with an 8–32 ms display buffer, automatically enabled for Bluetooth unless manually disabled. Collisions use immediate measured input. Echo RTT includes endpoint scheduling; it does not measure physical motion-to-screen latency. CPU measurements exclude GPU completion. Sequence gaps include deliberately dropped samples.'};
}
function describe(r) {
  const f=r.frames;
  const lines=[`Display ${hz(f.fps)} FPS · frame p95 ${ms(f.frameMs.p95)} ms`,`Frame CPU p95 ${ms(f.cpuWorkMs.p95)} ms · render call p95 ${ms(f.renderCallMs.p95)} ms`];
  lines.push(r.bladeDisplay==='interpolated'?`Smooth dot · display buffer ${Object.entries(r.displayBufferMs).map(([slot,delay])=>`P${Number(slot)+1} ${ms(delay)} ms`).join(' · ')}`:'Raw dot · no display buffer');
  for(const p of r.transport.peers){
    if(p.path==='bluetooth'){
      lines.push(`P${p.slot+1} Bluetooth · ${p.name} · ${p.connected?'connected':'disconnected'} · echo RTT ${ms(p.rttMs?.median)} ms`,`  Delivered capture ${hz(p.deliveredCaptureHz)} Hz · received ${hz(p.receivedHz)} Hz · arrival p95 ${ms(p.gapMs?.p95)} ms`);continue;
    }
    lines.push(`P${p.slot+1} ${p.path}${p.idle?' · idle':''} · RTT median/p95 ${ms(p.rttMs.median)}/${ms(p.rttMs.p95)} ms`,
      `  ICE network RTT ${ms(p.ice?.rttMs)} ms · protocol ${p.ice?.protocol || '—'}`,
      `  Phone orientation/gyro ${hz(p.sensors?.orientationHz)}/${hz(p.sensors?.gyroHz)} Hz · received ${hz(p.receivedHz)} Hz · distinct poses ${hz(p.poseHz)} Hz`,
      `  Arrival gap p95/max ${ms(p.gapMs.p95)}/${ms(p.gapMs.max)} ms · capture-to-send p95 ${ms(p.captureToSendMs.p95)} ms · sequence gaps ${p.sequenceGaps} · old packets discarded ${p.staleDropped}`);
  }
  if(!r.transport.peers.length)lines.push('Pair a phone and enable motion to measure its connection.');
  return lines.join('\n');
}
function advice(r) {
  const peers=r.transport.peers;
  if(peers.some(p=>p.path==='bluetooth'&&!p.connected))return 'Bluetooth disconnected. Check that the Android controller service is running, then reconnect from its player button.';
  if(peers.some(p=>p.path==='relay'))return 'Motion is using the server relay. Try a shared private Wi-Fi or laptop hotspot; guest Wi-Fi can isolate devices. Cloudflare relay adds an Internet hop.';
  if(peers.some(p=>p.path==='bluetooth' && !p.idle && (p.rttMs?.p95>40 || p.gapMs?.p95>50)))return 'Bluetooth delivery is uneven. Keep the phone near the laptop and compare with camera recording off or with Wi-Fi. Echo RTT includes endpoint scheduling; Bluetooth is not always faster.';
  if(peers.some(p=>p.path!=='bluetooth' && !p.idle && (p.rttMs.p95>40 || p.gapMs.p95>50)))return 'The connection is uneven. Move nearer the router or compare a laptop hotspot. RTT includes endpoint scheduling as well as network time.';
  if(r.frames.cpuWorkMs.p95>16.7)return 'Frame work exceeds a 60 FPS budget. Close busy apps and compare a smaller browser window or lower display resolution.';
  if(peers.some(p=>!p.idle && p.sensors?.orientationHz>0 && p.sensors.orientationHz<30))return 'Orientation readings are sparse. Keep the phone page visible and compare another browser. An optional native sensor stream is worth testing if this persists.';
  return 'Hold still for 5 seconds, turn slowly, then make 5 sweeps. Compare Direct and Light smoothing. These measurements do not establish physical sensor-to-screen latency.';
}
setInterval(()=>{
  const r=report();if(!r)return;
  if(r.bladeOnly)$('bladeCheckStats').textContent=`Blade-only · ${hz(r.frames.fps)} FPS · ${r.transport.peers.map(p=>p.path==='bluetooth'?`P${p.slot+1} Bluetooth · ${hz(p.receivedHz)} poses/s · ${ms(p.rttMs?.median)} ms echo RTT`:`P${p.slot+1} ${p.path} · ${hz(p.poseHz)} poses/s · ${ms(p.rttMs.median)} ms echo RTT · ${ms(p.ice?.rttMs)} ms network RTT`).join(' | ') || 'pair a phone'} · 3D rendering stopped`;
  if(!$('motionCheck').open)return;
  $('motionStats').textContent=describe(r);$('motionAdvice').textContent=advice(r);
},500);
$('smoothing').addEventListener('change',e=>{window.__openwii?.setSmoothing(e.target.value==='light');});
$('smoothBlade').addEventListener('change',e=>window.__openwii?.setSmoothBlade(e.target.checked));
$('smoothBlade').checked=window.__openwii?.smoothBlade()||false;
document.addEventListener('air-blade-display',e=>{$('smoothBlade').checked=e.detail.enabled;});
$('resetMotionReport').addEventListener('click',()=>{
  const api=window.__openwii;if(!api)return;api.frameMetrics.clear();api.link.rtt=null;
  for(const p of api.link.peers.values())p.metrics=new PeerMetrics();
  api.bluetooth.resetMetrics();
});
$('saveMotionReport').addEventListener('click',()=>{
  const r=report();if(!r)return;
  const url=URL.createObjectURL(new Blob([JSON.stringify(r,null,2)],{type:'application/json'}));
  const a=document.createElement('a');a.href=url;a.download=`air-slice-${r.tracking}-${Date.now()}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
});
window.__airDiagnostics={report};
