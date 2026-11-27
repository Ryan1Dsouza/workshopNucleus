import { stage, features } from '../stage.mjs';
import { ControllerState } from '../core/controller-state.js';
import { BluetoothLink } from '../core/bluetooth-link.js';
import { BUTTON_IDS, BUTTON_BITS, ButtonStore, validateProfile } from '../core/controller-contract.js';
import { staticSite } from './online-config.js';
import { downloadOrigins } from './download-origin.js';

const $=id=>document.getElementById(id);
document.documentElement.dataset.stage=stage;
$('stageLabel').textContent='Workshop · Stage '+stage;
$('controlsButton').hidden=$('previewButton').hidden=!features.buttons;
$('extensionCard').hidden=!features.extension;
$('onlineTab').hidden=!features.fruit;
const [motionMod,registryMod,catalogMod,lobbyMod]=await Promise.all([
  features.motion?import('../core/motion-input.js'):null,
  features.profiles?import('../core/game-registry.js'):null,
  features.profiles?import('../games/catalog.mjs'):null,
  features.fruit?import('./lobby.mjs'):null,
]);
const MotionInput=motionMod?.MotionInput||null;
// Smooth presentation once, using capture timestamps; keep measured aim direct.
const controllers=new ControllerState({createMotion:MotionInput?()=>new MotionInput({smoothing:false}):undefined});
let splitAim=false, online=null;
function resizePointers() {
  const stage=$('gameStage');
  for(const player of controllers.players)player.motion?.pointer.setViewport(stage.clientWidth/(splitAim?2:1),stage.clientHeight);
}
function centerFruit(split) {
  splitAim=split;resizePointers();
  for(const player of controllers.players)controllers.center(player.slot,{freshGrip:true});
}
if(MotionInput)new ResizeObserver(resizePointers).observe($('gameStage'));
let profile={id:'remote',title:'Controller Lab',orientation:'portrait',motion:features.motion?'aim':'none',
  controls:features.buttons?BUTTON_IDS.map(id=>({id,label:id.toUpperCase(),action:id})):[],
  instruction:features.motion?'Center your grip, then turn your wrist.':'Press a button and watch the laptop.',centerLabel:'Center motion'};
controllers.setProfile(profile);
let registry=null, current=null, adapter=null, selection=0, paused=true, demoSequence=0, previewMask=0;
let backgroundRound=null;
let focusLossTimer=null;
let pendingPlay=null;
function roundOptions(){return {practice:$('roundMode').value==='practice',splitScreen:$('roundPlayers').value==='2'||ble.connected(0)&&ble.connected(1),durationSeconds:Number($('roundDuration').value)};}
function showRoundOptions(options){$('roundPlayers').value=options.splitScreen?'2':'1';$('roundMode').value=options.practice?'practice':'classic';$('roundDuration').value=String(options.durationSeconds);}
const playArea=document.querySelector('.play-area');
let expanded=false,gameFullscreen=false;
function setExpanded(value){
  value=!!value&&!!current&&current.id!=='remote';
  if(value===expanded)return;
  expanded=value;playArea.classList.toggle('is-expanded',value);document.body.classList.toggle('game-expanded',value);
  for(const panel of document.querySelectorAll('.topbar,.library,.controllers-panel,.page-footer'))panel.inert=value;
  $('enlargeLabel').textContent=value?'Restore size':'Enlarge game';$('enlargeGame').setAttribute('aria-pressed',String(value));$('expandedHint').hidden=!value;
  if(value&&!document.fullscreenElement&&playArea.requestFullscreen)void playArea.requestFullscreen().catch(()=>{});
  if(!value&&document.fullscreenElement===playArea)void document.exitFullscreen?.().catch(()=>{});
  $('enlargeGame').focus({preventScroll:true});
}
function restoreWithEscape(event){
  if(event.key!=='Escape'||!expanded)return false;
  event.preventDefault();event.stopImmediatePropagation();setExpanded(false);return true;
}
document.addEventListener('fullscreenchange',()=>{const ours=document.fullscreenElement===playArea;if(gameFullscreen&&!ours)setExpanded(false);gameFullscreen=ours;});
const deviceText=['Start Bluetooth on your phone.','A second phone plays independently.'];
function notice(text,error=false){$('notice').textContent=text;$('notice').classList.remove('pending');$('notice').classList.toggle('error',error);}
function assignedProfile(slot){return {...profile,player:slot+1,profileEpoch:controllers.profileEpoch};}
async function syncController(slot){
  if(!ble.connected(slot))return;
  deviceText[slot]='Sending the game controls…';
  try{const ack=await ble.sendProfile(slot,assignedProfile(slot));controllers.markReady(slot,ack.profileEpoch);deviceText[slot]='Controls ready · '+profile.title;flushPendingPlay();if(online?.active)online.render();}
  catch(error){if(ble.connected(slot)){deviceText[slot]='Update the app or reconnect.';notice(error.message,true);}}
}
const ble=new BluetoothLink({
  onState:state=>{
    deviceText[state.slot]=state.text;
    if(state.connected){controllers.connect(state.slot,state.session,state.name);void syncController(state.slot);}
    else controllers.disconnect(state.slot);
    online?.bluetoothChanged();
    if(!online?.active && current?.id==='fruit-ninja'&&ble.connected(0)&&ble.connected(1))adapter?.configure?.({splitScreen:true});
    renderPlayers(performance.now());
  },
  onButtons:(frame,slot,session)=>{if(features.buttons)controllers.buttons(slot,frame,session);},
  onSample:(frame,slot)=>{if(features.motion)controllers.motion(slot,frame);},
  onCommand:(command,slot)=>{
    if(command.type==='recentre'&&features.motion)controllers.center(slot,command);
    else if(command.type==='wheel-rotation')controllers.setWheelRotation(slot,command);
    else if(command.type==='suspend')controllers.player(slot).motion?.suspend();
    else if(command.type==='disconnect')ble.disconnect(slot);
    else if(command.type==='start'&&features.fruit)play();
  }
});
const demoButtons=new ButtonStore(()=>submitDemo());
function enableDemo(){
  if(ble.has(0))return false;
  if(controllers.player(0).session!=='desktop')controllers.connect(0,'desktop','Keyboard / UI preview');
  controllers.markReady(0,controllers.profileEpoch);deviceText[0]='Desktop input · Z=A, X=B';return true;
}
function submitDemo(){if(enableDemo())controllers.buttons(0,{mask:demoButtons.mask|previewMask,sequence:(demoSequence++)&65535,profileEpoch:controllers.profileEpoch},'desktop');}
function releaseDemo(){previewMask=0;demoButtons.clear();if(controllers.player(0).session==='desktop')controllers.release(0);}
function previewProfile(){
  $('previewDialog').dataset.orientation=profile.orientation;
  if($('phonePreview').contentWindow&&$('phonePreview').getAttribute('src'))$('phonePreview').contentWindow.postMessage({type:'controller-preview-profile',profile:assignedProfile(0)},location.origin);
}
function setCurrentProfile(next){
  releaseDemo();profile=validateProfile({...next,motion:features.motion?next.motion:'none',controls:features.buttons?next.controls:[]});
  controllers.setProfile(profile);
  if(controllers.player(0).session==='desktop')controllers.markReady(0,controllers.profileEpoch);
  for(const slot of [0,1])void syncController(slot);
  previewProfile();
}
function renderCard(game){
  const button=document.createElement('button');button.className='game-card';button.dataset.game=game.id;
  button.type='button';button.setAttribute('aria-pressed','false');
  const art=document.createElement('div');art.className='game-art art-'+game.art;
  art.setAttribute('aria-hidden','true');
  if(game.art==='remote')art.innerHTML='<svg viewBox="0 0 80 80" aria-hidden="true"><rect x="27" y="8" width="27" height="64" rx="10"/><path d="M36 21h9m-4.5-4.5v9M35 43h11"/><circle cx="40.5" cy="34" r="4"/><circle cx="40.5" cy="53" r="3"/><circle cx="40.5" cy="62" r="3"/></svg>';
  button.append(art);
  const info=document.createElement('span');info.className='game-info';
  for(const [tag,className,text]of[['strong','',game.title||game.profile.title],['span','card-description',game.description||game.profile.instruction]]){const element=document.createElement(tag);element.className=className;element.textContent=text;info.append(element);}
  button.append(info);
  button.addEventListener('click',()=>{if(!online?.active)void select(game.id);});$('gameList').append(button);
}
async function select(id){
  const game=games.find(entry=>entry.id===id);if(!game)return;
  setExpanded(false);
  backgroundRound=null;
  pendingPlay=null;
  const version=++selection;paused=true;setCurrentProfile(game.profile);
  document.documentElement.dataset.game=id;
  $('selectedTitle').textContent=game.title;$('gameCategory').textContent=game.category?.toLowerCase().replace(/^./,letter=>letter.toUpperCase())||'Your game';$('selectedDescription').textContent=game.description;
  for(const card of document.querySelectorAll('.game-card')){const selected=card.dataset.game===id;card.classList.toggle('selected',selected);card.setAttribute('aria-pressed',String(selected));}
  $('modeBadge').textContent=id==='remote'?'Live input':'Ready to play';
  $('startGame').disabled=$('pauseGame').disabled=$('restartGame').disabled=true;
  $('enlargeGame').disabled=true;
  $('gameTools').hidden=true;
  $('roundOptions').hidden=true;
  splitAim=false;resizePointers();
  const context={container:$('gameStage'),centerFruit,setControllerProfile:next=>{
    if(version===selection && next.id===game.id && profile.layout!==next.layout) setCurrentProfile(next);
  },feedback:data=>{
    if (!online?.room)ble.feedback(data);
    else if(data.slot===undefined || current?.id!=='fruit-ninja' || data.slot===online.slot)ble.feedback({...data,slot:0});
  },notify:text=>notice(text),roundOptions,requestPlay:play,onOptions:showRoundOptions,onState:state=>{
    if(version!==selection)return;paused=!!state.paused;$('modeBadge').textContent=pendingPlay?'Preparing phones':paused?'Paused':'Playing';$('pauseGame').textContent=pendingPlay?'Cancel start':paused?'Resume':'Pause';
  }};
  try{
    if(registry){const result=await registry.select(id,context);if(!result||version!==selection)return;current=result.game;adapter=result.adapter;}
    else{adapter?.dispose();const next=await game.create(context);await next.mount(context.container);if(version!==selection){next.dispose();return;}adapter=next;current=game;}
    const playable=id!=='remote';$('startGame').disabled=!playable;$('pauseGame').disabled=!playable;$('restartGame').disabled=!playable;
    $('enlargeGame').disabled=!playable;
    $('gameTools').hidden=!playable;
    $('roundOptions').hidden=id!=='fruit-ninja';
    const frame=$('gameStage').querySelector('iframe');
    try{frame?.contentWindow?.addEventListener('keydown',restoreWithEscape,true);frame?.contentWindow?.addEventListener('focus',()=>{clearTimeout(focusLossTimer);resumeFromBackground();});}catch{/* Cross-origin games retain the visible Restore button. */}
    $('gameHint').textContent=id==='fruit-ninja'?'Choose a timer, then Play. Mouse: hold the left button and drag. Two phones get separate lanes.':id==='kart-racing'?'Choose D-pad or Gyro for your phone. On a keyboard, drive with WASD or arrows, drift with Shift and use items with Space.':playable?game.profile.instruction:'Z / X = A / B · Arrow keys = D-pad · C = Center. Pair a phone for wrist motion.';
    notice(playable?'Ready. Start a round from the laptop or press A on your phone.':'Test your controller here, then choose a game.');
  }catch(error){console.error(error);notice('Could not open this game: '+error.message,true);}
}
function preparingPhones(){return controllers.players.some(player=>ble.has(player.slot)&&!player.ready);}
function flushPendingPlay(){
  if(!pendingPlay||pendingPlay.selection!==selection||pendingPlay.required.some(slot=>!ble.connected(slot)||!controllers.player(slot).ready)||document.hidden||!document.hasFocus())return;
  const requested=pendingPlay;pendingPlay=null;play(requested.options);
}
function play(options={}){
  if(online?.active||!adapter||current?.id==='remote')return;backgroundRound=null;
  if(preparingPhones()){
    pendingPlay={selection,options,required:controllers.players.filter(p=>ble.has(p.slot)).map(p=>p.slot)};paused=true;
    if(!adapter.paused)adapter.pause(true);
    $('modeBadge').textContent='Preparing phones';$('pauseGame').textContent='Cancel start';notice('Preparing phone controls. Your round starts automatically when ready.');$('notice').classList.add('pending');return;
  }
  pendingPlay=null;adapter.reset(options);paused=false;$('modeBadge').textContent='Playing';$('pauseGame').textContent='Pause';notice('Round started.');
}
function togglePause(){
  if(online?.active)return;
  if(!adapter||current?.id==='remote')return;
  if(pendingPlay){pendingPlay=null;paused=true;const inRound=adapter.api?.race ? adapter.api.race.state!=='ready' : adapter.api?.game?.state.phase==='playing';$('modeBadge').textContent=inRound?'Paused':'Ready to play';$('pauseGame').textContent=inRound?'Resume':'Pause';notice('Start cancelled.');return;}
  backgroundRound=null;paused=!paused;adapter.pause(paused);$('modeBadge').textContent=paused?'Paused':'Playing';$('pauseGame').textContent=paused?'Resume':'Pause';
}
let games=[];
if(features.profiles){
  const {GameRegistry}=registryMod;const {registerGames}=catalogMod;
  registry=new GameRegistry();registerGames(registry,features);games=registry.list();
}else if(features.buttons){
  const {ControllerLab}=await import('../games/controller-lab/adapter.mjs');
  games=[{id:'remote',title:'Controller Lab',category:'INPUT LAB',art:'remote',badge:'Buttons'+(features.motion?' + motion':''),description:'Test every button'+(features.motion?' and wrist movement.':'.'),profile,create:()=>new ControllerLab()}];
}
function renderLibrary(){ $('gameList').replaceChildren();for(const game of games)renderCard(game);$('libraryCount').textContent=games.length;for(const card of document.querySelectorAll('.game-card')){const selected=card.dataset.game===current?.id;card.classList.toggle('selected',selected);card.setAttribute('aria-pressed',String(selected));} }
function registerGame(game){if(!registry)throw new Error('Game registration is available from Stage 4.');registry.register(game);games=registry.list();renderLibrary();return registry;}
renderLibrary();
for(const slot of [0,1]){
  $('pair'+slot).disabled=false;
  $('pair'+slot).addEventListener('click',async()=>{
    const button=$('pair'+slot);button.disabled=true;
    try{
      if(ble.has(slot))ble.disconnect(slot);
      else{if(slot===0){releaseDemo();controllers.disconnect(0);}await ble.connect(slot);}
    }catch(error){deviceText[slot]=error.name==='NotFoundError'?'Pairing cancelled. Try again.':error.message;notice(deviceText[slot],error.name!=='NotFoundError');}
    finally{button.disabled=false;renderPlayers(performance.now());}
  });
  $('choosePhone'+slot).addEventListener('click',async()=>{
    const button=$('pair'+slot),choose=$('choosePhone'+slot);button.disabled=choose.disabled=true;
    try{if(slot===0){releaseDemo();controllers.disconnect(0);}await ble.connect(slot,{chooseNew:true});}
    catch(error){deviceText[slot]=error.name==='NotFoundError'?'Pairing cancelled. Try again.':error.message;notice(deviceText[slot],error.name!=='NotFoundError');}
    finally{button.disabled=choose.disabled=false;renderPlayers(performance.now());}
  });
}
function renderPlayers(now){
  const diagnostics=ble.diagnostics(now);
  for(const slot of [0,1]){
    const player=controllers.player(slot),record=ble.devices.get(slot),metric=diagnostics.find(item=>item.slot===slot);
    $('playerName'+slot).textContent=player.connected?player.name:'No controller connected';
    $('playerStatus'+slot).classList.toggle('connected',player.connected);
    $('playerCard'+slot).classList.toggle('is-connected',player.connected);
    $('playerDetail'+slot).textContent=deviceText[slot];
    const button=$('pair'+slot);button.classList.toggle('connected',!!record);button.firstChild.textContent=record?'Disconnect ':'Connect phone ';button.lastElementChild.textContent=record?'−':'+';
    $('choosePhone'+slot).hidden=!!record||!ble.hasSavedPhone(slot);
    button.setAttribute('aria-label',(record?'Disconnect':'Connect phone for')+' Player '+(slot+1));
    $('reading'+slot).textContent=player.connected?(player.ready?(player.motion?.pointer.live?'Wrist motion live':'Buttons ready'):'Preparing controls'):'Waiting for input';
    $('latency'+slot).textContent=metric?.rtt?.median!==undefined?Math.round(metric.rtt.median)+' ms RTT':record?'BLE':player.connected?'Desktop':'—';
  }
  const count=controllers.players.filter(player=>player.connected).length;
  $('connectionCount').lastChild.textContent=count+' / 2 controllers';
  $('connectionCount').classList.toggle('has-controllers',count>0);
}
let last=performance.now(),lastUi=0,lastDemo=0;
function frame(now){
  if(controllers.player(0).session==='desktop'&&now-lastDemo>400){submitDemo();lastDemo=now;}
  for(const slot of [0,1]){
    const state=controllers.sample(slot,now);
    if(online?.active){
      if(slot===0 && online.playing)adapter?.api?.setControllerState(current.id==='fruit-ninja'?online.slot:0,state);
      if(slot===0 && !online.playing && current?.id==='kart-racing' && state.pressedActions['steering-mode']){
        const api=adapter.api;
        api.setSteeringMode(api.steeringMode==='gyro'?'dpad':'gyro');
        online.render();
      }
      continue;
    }
    if(current?.id!=='remote'&&state.pressedActions.home){void select('remote');continue;}
    if(current?.id!=='remote'&&state.pressedActions.pause)togglePause();
    adapter?.input(slot,state);
  }
  adapter?.tick?.(Math.min((now-last)/1000,.05),now);last=now;
  if(now-lastUi>250){renderPlayers(now);lastUi=now;}
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
const keyMap={ArrowUp:'up',ArrowRight:'right',ArrowDown:'down',ArrowLeft:'left',w:'up',a:'left',s:'down',d:'right',z:'a',x:'b','1':'one','2':'two','+':'plus','-':'minus'};
window.addEventListener('keydown',event=>{
  if(restoreWithEscape(event))return;
  if(event.target.closest('input,textarea,select')||online?.active&&(!online.playing||event.key==='Escape'))return;
  if(document.querySelector('dialog[open]'))return;
  if (adapter?.handleKey && !(['Enter','Space'].includes(event.code) && event.target.closest('button,a'))) {
    if (adapter.handleKey(event)) return;
  }
  if(event.repeat)return;
  if(event.key.toLowerCase()==='c'&&features.motion){controllers.center(0,{});return;}
  if(event.key==='Escape'){if(current?.id!=='remote')void select('remote');return;}
  const id=keyMap[event.key]||keyMap[event.key.toLowerCase()];if(!id||!features.buttons||!enableDemo())return;
  event.preventDefault();demoButtons.press(id,event.code);
});
window.addEventListener('keyup',event=>{adapter?.handleKey?.(event);demoButtons.release(event.code);});
function pauseInBackground(){
  releaseDemo();
  if(online?.active||!adapter||current?.id==='remote'||paused||backgroundRound)return;
  if(adapter.api?.game && adapter.api.game.state.phase!=='playing')return;
  backgroundRound={adapter,selection};adapter.pause(true);
}
function resumeFromBackground(){
  flushPendingPlay();
  if(document.hidden||!document.hasFocus()||!backgroundRound)return;
  const round=backgroundRound;backgroundRound=null;
  if(round.adapter===adapter&&round.selection===selection)adapter.pause(false);
}
// Parent blur can be the start of focusing the embedded game, not Alt+Tab.
window.addEventListener('blur',()=>{releaseDemo();adapter?.releaseKeys?.();clearTimeout(focusLossTimer);focusLossTimer=setTimeout(()=>{if(!document.hasFocus())pauseInBackground();},250);});
window.addEventListener('focus',()=>{clearTimeout(focusLossTimer);resumeFromBackground();});
document.addEventListener('visibilitychange',()=>{if(document.hidden)pauseInBackground();else resumeFromBackground();});
window.addEventListener('message',event=>{
  if(event.origin===location.origin && event.source===adapter?.frame?.contentWindow && current?.id==='kart-racing' && event.data?.type==='kart-center'){controllers.center(0,{});return;}
  if(event.origin===location.origin&&event.source===adapter?.frame?.contentWindow&&event.data?.type==='fruit-request-play'){play();return;}
  if(event.origin!==location.origin||event.source!==$('phonePreview').contentWindow)return;
  if(event.data?.type==='controller-preview-buttons'){previewMask=event.data.mask&2047;submitDemo();}
  else if(event.data?.type==='controller-preview-center'&&features.motion)controllers.center(0,{});
});
const CONTROLS_GUIDE={
  'kart-racing':{
    title:'Mario Kart controls',
    keyboard:{
      lead:'Play immediately with your keyboard across menus, solo races, and online lobbies.',
      items:[
        [['W','↑','Z'],'Accelerate (Gas)'],[['S','↓','X'],'Brake / Reverse'],
        [['A / ←','D / →'],'Steer left & right'],[['Shift'],'Drift (hold in turns, release for mini-turbo)'],
        [['Space'],'Use held item or confirm menu'],[['Enter','Esc'],'Confirm menu step / Pause & back'],
        [['R','I'],'Center phone steering / Invert wheel tilt']
      ],
      tip:'Keyboard works right away once Mario Kart is loaded.'
    },
    gyro:{
      lead:'Select Gyro on step 3 of the menu (Driver → Race length → Phone steering) to tilt-steer in landscape.',
      items:[
        [['Tilt sideways'],'Steer left & right'],[['Gas','2'],'Accelerate'],
        [['Brake','1'],'Brake / Reverse'],[['Drift','A'],'Hold through turns for mini-turbo'],
        [['Item','▶'],'Use held item (right-pad shortcut)'],[['Center wheel','-'],'Recalibrate straight ahead'],
        [['+','Home'],'Pause race / Exit to library']
      ],
      tip:'Level your phone sideways briefly when the countdown begins.'
    },
    dpad:{
      lead:'Select D-pad on step 3 of the menu for enlarged touch controls in landscape.',
      items:[
        [['◀','▶'],'Steer left & right'],[['Gas','2'],'Large right-thumb throttle'],
        [['Brake','1'],'Brake / Reverse'],[['Drift','A'],'Hold through turns for mini-turbo'],
        [['Item','B'],'Use held item'],[['+','Home'],'Pause race / Exit to library']
      ],
      tip:'In menus: D-pad moves selection, A confirms, and B steps back.'
    }
  },
  'fruit-ninja':{
    title:'Fruit Ninja controls',
    keyboard:{
      lead:'Start rounds or navigate modes from your keyboard while using a paired phone to slice.',
      items:[
        [['Z'],'Play (A)'],[['X'],'Practice mode (B)'],
        [['1'],'Classic mode'],[['2','-'],'Restart round'],
        [['+'],'Pause / Resume'],[['C'],'Center blade aim']
      ],
      tip:'Activate Player 1 virtual keys below to send Z / X / D-pad as a test controller.'
    },
    gyro:{
      lead:'Rotate your wrist naturally to sweep the blade across fruit; buttons sit beneath your thumb.',
      items:[
        [['Rotate wrist'],'Aim and slice fruit'],[['Center aim','C'],'Reset pointer to crosshair'],
        [['Play (A)','Practice (B)'],'Start Classic or Practice'],[['Restart','2 / -'],'Start a new round'],
        [['+','Home'],'Pause / Exit to library']
      ],
      tip:'Connecting two phones automatically enables 2-player split screen.'
    },
    dpad:{
      lead:'Fruit Ninja uses wrist motion for slicing rather than D-pad movement.',
      items:[
        [['A / B'],'Play / Practice'],[['1 / 2'],'Classic / Restart'],
        [['+','Home'],'Pause / Exit to library']
      ],
      tip:'Connect a phone with a gyroscope to slice cleanly over Bluetooth.'
    }
  },
  remote:{
    title:'Controller Lab controls',
    keyboard:{
      lead:'Test virtual Player 1 button inputs from your laptop keyboard without pairing a phone.',
      items:[
        [['Z','X'],'A / B buttons'],[['↑ ↓ ← →','WASD'],'Directional pad'],
        [['1','2'],'1 / 2 buttons'],[['+','-'],'Plus / Minus buttons'],
        [['C'],'Center motion pointer'],[['Esc'],'Back to Controller Lab']
      ],
      tip:'Press any mapped key or click below to attach virtual Player 1 controls.'
    },
    gyro:{
      lead:'Pair ControllerKit with Motion enabled to inspect real-time wrist tracking on the grid.',
      items:[
        [['Move wrist'],'Move Player 1 / 2 aim dot'],[['Center motion'],'Zero pointer to center'],
        [['Face buttons'],'Verify live press & release latency']
      ],
      tip:'Both Player 1 and Player 2 display live RTT latency in the dock below.'
    },
    dpad:{
      lead:'Press any touch button on ControllerKit to highlight matching live chips on screen.',
      items:[
        [['▲ ▼ ◀ ▶'],'Multi-touch D-pad'],[['A / B'],'Primary & secondary buttons'],
        [['- Home +'],'Utility row'],[['1 / 2'],'Number buttons']
      ],
      tip:'Open Controller options in the APK to toggle vibration or check app updates.'
    }
  }
};
let controlScheme='keyboard';
function syncActivateKeyboardButton(){
  const btn=$('activateKeyboardBtn');
  if(!btn)return;
  btn.hidden=controlScheme!=='keyboard'||!features.buttons;
  const active=controllers.player(0).session==='desktop';
  btn.disabled=active||ble.has(0);
  btn.textContent=ble.has(0)?'Phone paired to Player 1':active?'Virtual Player 1 active':'Activate Player 1 virtual keys';
}
function renderControlsGuide(scheme=controlScheme){
  controlScheme=scheme;
  const activeId=document.documentElement.dataset.game||current?.id;
  const gameId=CONTROLS_GUIDE[activeId]?activeId:'remote';
  const pack=CONTROLS_GUIDE[gameId], data=pack[scheme]||pack.keyboard;
  $('controlsSubtitle').textContent=pack.title;
  $('controlsLead').textContent=data.lead;
  $('controlsTip').textContent=data.tip;
  const list=$('controlsList');
  list.replaceChildren(...data.items.map(([keys,desc])=>{
    const item=document.createElement('div');item.className='controls-item';
    const dt=document.createElement('dt');
    keys.forEach((label,i)=>{if(i>0)dt.append(' ');const k=document.createElement('kbd');k.className='keycap';k.textContent=label;dt.append(k);});
    const dd=document.createElement('dd');dd.textContent=desc;
    item.append(dt,dd);return item;
  }));
  const tabs=[...document.querySelectorAll('.controls-tab')];
  for(const tab of tabs){
    const selected=tab.dataset.scheme===scheme;
    tab.classList.toggle('active',selected);
    tab.setAttribute('aria-selected',String(selected));
    tab.tabIndex=selected?0:-1;
    if(selected)$('controlsPanel').setAttribute('aria-labelledby',tab.id);
  }
  syncActivateKeyboardButton();
}
for(const tab of document.querySelectorAll('.controls-tab')){
  tab.addEventListener('click',()=>renderControlsGuide(tab.dataset.scheme));
  tab.addEventListener('keydown',event=>{
    const tabs=[...document.querySelectorAll('.controls-tab')];
    const index=tabs.indexOf(tab);
    if(event.key==='ArrowRight'||event.key==='ArrowLeft'){
      event.preventDefault();
      const next=tabs[(index+(event.key==='ArrowRight'?1:tabs.length-1))%tabs.length];
      next.focus();renderControlsGuide(next.dataset.scheme);
    }
  });
}
$('controlsButton').addEventListener('click',()=>{
  const activeId=document.documentElement.dataset.game||current?.id;
  const defaultScheme=activeId==='kart-racing'?(profile.layout==='kart-gyro'?'gyro':profile.layout==='kart-dpad'?'dpad':'keyboard'):'keyboard';
  renderControlsGuide(defaultScheme);
  $('controlsDialog').showModal();
});
$('activateKeyboardBtn').addEventListener('click',()=>{
  if(enableDemo())notice('Virtual Player 1 ready: Z=A, X=B, arrows=D-pad, C=Center.');
  syncActivateKeyboardButton();
});
$('startGame').addEventListener('click',()=>play());$('pauseGame').addEventListener('click',togglePause);$('restartGame').addEventListener('click',()=>play());
$('enlargeGame').addEventListener('click',()=>setExpanded(!expanded));
$('fullscreen').addEventListener('click',()=>{if(document.fullscreenElement)void document.exitFullscreen?.();else void document.documentElement.requestFullscreen?.().catch(()=>{});});
for(const id of ['controllersTab','appButton','emptyConnect','quickQrButton'])$(id)?.addEventListener('click',()=>$('connectionDialog').showModal());
$('roundPlayers').addEventListener('change',()=>{if(!online?.active && current?.id==='fruit-ninja')adapter.configure(roundOptions());});
$('playTab').addEventListener('click',()=>{if(online?.active)online.close();else $('gameStage').scrollIntoView({block:'center'});});
for(const id of ['workshopTab','extensionGuide'])$(id).addEventListener('click',()=>$('workshopDialog').showModal());
for(const button of document.querySelectorAll('[data-close]'))button.addEventListener('click',()=>$(button.dataset.close).close());
for(const dialog of document.querySelectorAll('dialog'))dialog.addEventListener('click',event=>{if(event.target!==dialog)return;const box=dialog.getBoundingClientRect();if(event.clientX<box.left||event.clientX>box.right||event.clientY<box.top||event.clientY>box.bottom)dialog.close();});
$('previewDialog').addEventListener('close',()=>{previewMask=0;submitDemo();});
$('phonePreview').addEventListener('load',previewProfile);
$('previewButton').addEventListener('click',()=>{if(!$('phonePreview').getAttribute('src'))$('phonePreview').src='/controller?preview=1';$('previewDialog').showModal();previewProfile();});
let inviteOrigin=location.origin;
if(lobbyMod) {
  online=lobbyMod.onlineLobby({select,inviteOrigin:()=>inviteOrigin,adapter:()=>adapter,current:()=>current,paired:()=>ble.connected(0),centerFruit,
    phonesReady:()=>!ble.has(0)||controllers.player(0).ready});
}
const joiningOnline=!!online && new URLSearchParams(location.search).has('join');
if(joiningOnline)void online.open();
else if(games.length)void select('remote');
else{notice('The Bluetooth host is ready. Install the app, then connect a player.');$('gameList').textContent='Connect your phone to get started.';}
window.__controllerkit={controllers,ble,online,registry,registerGame,profile:()=>profile,current:()=>current,adapter:()=>adapter,select,play,togglePause,enableDemo,stage,features};
try{
  const info=staticSite?{}:await fetch('/connection-info').then(response=>response.json()),origins=downloadOrigins(info,location);
  for(const origin of origins){const option=document.createElement('option');option.value=origin;option.textContent=origin;$('downloadAddress').append(option);}
  $('addressLabel').hidden=origins.length<2;
  const draw=()=>{
    if(!staticSite && info.httpsPort && origins[0]!==location.origin){
      const shared=new URL($('downloadAddress').value);
      shared.protocol='https:';shared.port=info.httpsPort;inviteOrigin=shared.origin;
      if(online?.active)online.render();
    }
    const url=$('downloadAddress').value+'/downloads/';$('downloadLink').href=$('quickDownloadLink').href=url;
    for(const [id,size]of [['downloadQr',146],['quickDownloadQr',84]]){
      $(id).replaceChildren();if(typeof QRCode==='function')new QRCode($(id),{text:url,width:size,height:size,colorDark:'#233044',colorLight:'#ffffff',correctLevel:QRCode.CorrectLevel.M});
    }
  };
  $('downloadAddress').addEventListener('change',draw);draw();
  if(origins[0]===location.origin&&['localhost','127.0.0.1'].includes(location.hostname))$('downloadCaption').textContent='Connect the laptop to your phone’s network to generate a reachable download QR.';
}catch(error){$('downloadCaption').textContent='Open /downloads/ on the laptop’s LAN address.';console.error(error);}
