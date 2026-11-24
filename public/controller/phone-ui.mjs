import { ButtonStore, BUTTON_IDS, BUTTON_BITS, validateProfile } from '../core/controller-contract.js';

const $ = id => document.getElementById(id);
const preview = new URLSearchParams(location.search).get('preview') === '1';
const defaultProfile = {id:'remote',title:'Controller Lab',orientation:'portrait',motion:'aim',centerLabel:'Center motion',
  instruction:'Press a button or turn your wrist. Your input appears on the laptop.',
  controls:BUTTON_IDS.map(id=>({id,label:({one:'1',two:'2',plus:'Plus',minus:'Minus',home:'Home'})[id]||id.toUpperCase(),action:id}))};
let native = {running:false,connected:false,motionAvailable:true,sensing:true,haptics:true,profile:defaultProfile};
let profile = defaultProfile, signature = '', lastMask = 0;
const available = () => !!(window.AndroidController?.post || window.webkit?.messageHandlers?.controller);
function send(payload) {
  const text = JSON.stringify(payload);
  if (window.AndroidController?.post) window.AndroidController.post(text);
  else if (window.webkit?.messageHandlers?.controller) window.webkit.messageHandlers.controller.postMessage(text);
  else if (preview) {
    if (payload.type === 'buttons') parent.postMessage({type:'controller-preview-buttons',mask:payload.mask}, location.origin);
    else if (payload.type === 'center') parent.postMessage({type:'controller-preview-center'}, location.origin);
  } else if (payload.type === 'start') location.href = '/downloads/';
}
const buttons = new ButtonStore(mask => {
  lastMask = mask;
  for (const button of document.querySelectorAll('[data-control]')) button.classList.toggle('is-held', !!(mask & BUTTON_BITS[button.dataset.control]));
  send({type:'buttons',mask});
});
function renderProfile(value) {
  profile = validateProfile(value); buttons.clear();
  const controls = new Map(profile.controls.map(control=>[control.id,control]));
  document.documentElement.dataset.orientation = profile.orientation;
  $('gameTitle').textContent = profile.title;
  $('centerLabel').textContent = profile.centerLabel;
  $('instruction').textContent = profile.instruction;
  $('motionZone').hidden = profile.motion === 'none';
  for (const button of document.querySelectorAll('[data-control]')) {
    const id = button.dataset.control, control = controls.get(id), wrap = button.closest('.control-wrap');
    button.hidden = !control;
    if (wrap) wrap.hidden = !control;
    button.setAttribute('aria-label', control ? id.toUpperCase() + ': ' + control.label : id);
    const label = document.querySelector('[data-label="'+id+'"]');
    if (label && control) {
      label.textContent = control.label;
      label.hidden = control.label === ({a:'A',b:'B',one:'1',two:'2'})[id];
    }
  }
  $('dpad').hidden = !['up','right','down','left'].some(id=>controls.has(id));
  for (const zone of document.querySelectorAll('.remote-body > section')) zone.hidden = ![...zone.querySelectorAll('[data-control]')].some(button=>!button.hidden);
  document.querySelector('.remote-shell').dataset.hasDpad = String(!$('dpad').hidden);
  document.querySelector('.remote-body').hidden = profile.controls.length === 0;
}
window.onNativeState = value => {
  try {
    const data = typeof value === 'string' ? JSON.parse(value) : value;
    const wasConnected = native.connected;
    native = {...native,...data};
    const next = native.connected ? native.profile || defaultProfile : defaultProfile;
    const nextSignature = JSON.stringify(next);
    if (signature !== nextSignature) { renderProfile(next); signature = nextSignature; }
    if(!native.connected){$('gameTitle').textContent='Your controller';$('instruction').textContent='Start Bluetooth, then choose your phone on the laptop.';}
    if (wasConnected && !native.connected) buttons.clear();
    const usable = native.connected && native.running;
    for (const button of document.querySelectorAll('[data-control]')) button.disabled = !usable;
    document.querySelector('.remote-shell').classList.toggle('is-preview', preview);
    document.querySelector('.remote-shell').classList.toggle('is-connected', !!native.connected);
    $('playerLabel').textContent = native.connected && next.player ? 'Player '+next.player : preview ? 'Demo' : 'No player';
    $('connectionLabel').textContent = preview ? 'Preview' : native.connected ? 'Connected' : native.running ? 'Pair on laptop' : 'Ready to pair';
    $('connectionPill').classList.toggle('connected', !!native.connected);
    $('connectionPill').classList.toggle('preview', preview);
    $('bluetoothLabel').textContent = preview ? 'Desktop preview' : native.running ? 'Stop Bluetooth' : available() ? 'Start Bluetooth' : 'Get the phone app';
    $('bluetoothButton').classList.toggle('connected', !!native.running);
    $('bluetoothButton').disabled = preview;
    // Keep the paired remote focused on gameplay; disconnection remains in options.
    const bluetoothParent = native.connected ? $('extras') : $('status').parentElement;
    if ($('bluetoothButton').parentElement !== bluetoothParent) {
      if (native.connected) bluetoothParent.append($('bluetoothButton'));
      else bluetoothParent.insertBefore($('bluetoothButton'), $('status'));
    }
    $('extras').hidden = !native.connected;
    $('motionToggle').checked = !!native.sensing;
    $('motionToggle').disabled = !native.running || !native.motionAvailable;
    $('centerButton').disabled = !usable || !native.motionAvailable || !native.sensing;
    $('motionHint').textContent = !native.motionAvailable ? 'Buttons work without a gyroscope' : native.sensing ? 'Center in your natural grip' : 'Enable when you are ready';
    $('status').textContent = native.status || (native.connected ? 'Input goes directly to your laptop over Bluetooth.' : 'Start here, then connect from the laptop.');
    $('recordButton').hidden = !native.camera;
    $('recordButton').disabled = !usable;
    $('hapticsToggle').checked = !!native.haptics;
    $('hapticsToggle').disabled = !native.running;
  } catch(error) { $('status').textContent = 'Could not load this controller profile.'; console.error(error); }
};
for (const button of document.querySelectorAll('[data-control]')) {
  button.addEventListener('pointerdown', event => {
    if (button.disabled || button.hidden) return;
    event.preventDefault(); button.setPointerCapture(event.pointerId);
    buttons.press(button.dataset.control, 'pointer:'+event.pointerId);
  });
  for (const type of ['pointerup','pointercancel','lostpointercapture']) button.addEventListener(type,event=>buttons.release('pointer:'+event.pointerId));
}
const keyControls = {ArrowUp:'up',ArrowRight:'right',ArrowDown:'down',ArrowLeft:'left',z:'a',x:'b','1':'one','2':'two','+':'plus','-':'minus',Escape:'home'};
window.addEventListener('keydown', event => {
  const id = keyControls[event.key];
  if (!id || event.repeat || !native.connected || /INPUT|TEXTAREA|SELECT/.test(event.target.tagName)) return;
  const button = document.querySelector('[data-control="'+id+'"]');
  if (!button || button.hidden || button.disabled) return;
  event.preventDefault(); buttons.press(id,'key:'+event.key);
});
window.addEventListener('keyup',event=>buttons.release('key:'+event.key));
for (const type of ['blur','pagehide']) window.addEventListener(type,()=>buttons.clear());
document.addEventListener('visibilitychange',()=>{if(document.hidden)buttons.clear();});
$('bluetoothButton').addEventListener('click',()=>send({type:native.running?'stop':'start'}));
$('centerButton').addEventListener('click',()=>send({type:'center'}));
$('motionToggle').addEventListener('change',event=>send({type:'motion',enabled:event.target.checked}));
$('hapticsToggle').addEventListener('change',event=>send({type:'haptics',enabled:event.target.checked}));
$('recordButton').addEventListener('click',()=>send({type:'camera'}));
window.addEventListener('message',event=>{
  if (preview && event.source === parent && event.origin === location.origin && event.data?.type === 'controller-preview-profile') {
    window.onNativeState({running:true,connected:true,sensing:true,motionAvailable:true,profile:event.data.profile,status:'Desktop UI preview. Pair a phone for Bluetooth gameplay.'});
  }
});
window.__controllerUi = {buttons,profile:()=>profile,mask:()=>lastMask};
window.onNativeState(preview ? {running:true,connected:true,status:'Desktop UI preview.'} : native);
send({type:'ready'});
