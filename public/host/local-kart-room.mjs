import drivers from '../core/kart-roster.json' with {type:'json'};
import idle from '../core/lobby-idle.json' with {type:'json'};
import {MARIO_KART_PROFILE, kartRaceProfile} from '../core/controller-profiles.js';

const $=id=>document.getElementById(id);
const setText=(el,text)=>{if(el.textContent!==text)el.textContent=text;};

export function localKartRoom({ble,controllers,adapter,setCurrentProfile,syncController,status,onExpire}) {
  let active=false, playing=false, capacity=2, finished=false;
  let entries=[];
  let deadline=0, idleTimer;
  const panel=$('localKartRoom'), grid=$('localDrivers'), bar=$('localMatchBar');
  function expireIfIdle(){
    if(!deadline || Date.now()<deadline)return false;
    if(playing)back();
    close();
    onExpire(idle.message);
    $('createLocalRoom').focus();
    return true;
  }
  function startIdleTimer(){
    clearTimeout(idleTimer);
    deadline=Date.now()+idle.timeoutMs;
    idleTimer=setTimeout(expireIfIdle,idle.timeoutMs);
  }
  function stopIdleTimer(){clearTimeout(idleTimer);deadline=0;}
  function interact(event){
    if(expireIfIdle()){event.stopPropagation();return;}
    if(active && !playing && event.target.closest('button,select'))startIdleTimer();
  }
  panel.addEventListener('click',interact,true);
  panel.addEventListener('change',interact,true);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)expireIfIdle();});
  for(let n=2;n<=drivers.length;n++)$('localCapacity').add(new Option(String(n),String(n)));
  function screen(){
    document.body.classList.toggle('local-room',active);
    document.body.classList.toggle('local-racing',playing);
    panel.hidden=!active || playing; bar.hidden=!playing;
    $('gameStage').inert=active && !playing;
  }
  function field(row,title,options){
    const label=document.createElement('label'),select=document.createElement('select');
    label.className='online-field';label.append(title,select);row.append(label);
    for(const [value,text] of options)select.add(new Option(text,value));
    return select;
  }
  function button(row,title,action){
    const b=document.createElement('button');b.type='button';b.textContent=title;b.className='secondary-button';b.onclick=action;row.append(b);return b;
  }
  function addSeat(slot){
    const row=document.createElement('section'), heading=document.createElement('h3'), detail=document.createElement('p');
    row.className='local-seat';heading.textContent='Player '+(slot+1);row.append(heading,detail);
    const driver=field(row,'Driver',drivers.map(d=>[d.id,d.name]));
    const steering=field(row,'Phone steering',[['dpad','D-pad'],['gyro','Gyro']]);
    const seat={driver,steering,row,detail,ready:false,pairing:false,session:null,message:''};
    driver.value=drivers.find(d=>!entries.some(e=>e.driver.value===d.id)).id;
    seat.character=driver.value;
    driver.onchange=()=>{
      const other=entries.find(e=>e!==seat && e.character===driver.value);
      if(other){other.driver.value=other.character=seat.character;other.ready=false;}
      seat.character=driver.value;seat.ready=false;render();
    };
    steering.onchange=()=>{seat.ready=false;render();};
    seat.pair=button(row,'Pair phone',async()=>{
      if(seat.pairing)return;
      seat.pairing=true;seat.ready=false;seat.message='';
      render();
      try{
        if(ble.has(slot))ble.disconnect(slot);
        else{
          await ble.connect(slot,{chooseNew:true});
          if(entries[slot]!==seat && !entries[slot])ble.disconnect(slot);
        }
      }catch(err){seat.message=err.name==='NotFoundError'?'Pairing cancelled.':err.message;}
      finally{seat.pairing=false;render();}
    });
    seat.retry=button(row,'Retry controls',()=>syncController(slot));
    seat.readyButton=button(row,'Ready',()=>{seat.ready=!seat.ready;render();});
    entries.push(seat);grid.append(row);
  }
  function resize(n){
    for(let i=entries.length-1;i>=n;i--){entries.pop().row.remove();ble.disconnect(i);}
    while(entries.length<n)addSeat(entries.length);
    capacity=n;$('localCapacity').value=String(n);render();
  }
  function render(){
    if(!active || playing)return;
    entries.forEach((seat,i)=>{
      const player=controllers.player(i), paired=ble.connected(i), available=paired&&player.ready;
      if(!available || seat.session!==player.session)seat.ready=false;
      seat.session=player.session;
      const failed=status(i);
      setText(seat.detail,failed || seat.message || (available?'BLE paired · '+player.name:ble.has(i)?'Preparing phone controls…':'Waiting for phone'));
      setText(seat.pair,ble.has(i)?'Disconnect':'Pair phone');
      seat.pair.disabled=seat.pairing;
      seat.retry.hidden=!failed || !paired;
      seat.readyButton.disabled=!available;
      seat.readyButton.setAttribute('aria-pressed',String(seat.ready));
      setText(seat.readyButton,seat.ready?'Ready ✓':'Ready');
    });
    const ready=entries.filter(e=>e.ready).length;
    $('startLocalMatch').disabled=entries.length!==capacity || ready!==capacity;
    setText($('localStatus'),ready+' / '+capacity+' ready');
    setText($('startLocalMatch'),finished?'Rematch':'Start race');
  }
  function open(){
    if(!adapter()?.api?.startLocalRoom || active)return;
    if(adapter().api.race.state!=='ready')adapter().api.endLocalRoom();
    adapter().api.audio.unlock();
    active=true;finished=false;setText($('backLocalRoom'),'Return to room');screen();resize(2);$('localCapacity').focus();
    startIdleTimer();
  }
  function back(){
    if(!playing)return;
    playing=false;adapter().frame.removeEventListener('kart-local-results',results);
    adapter().api.endLocalRoom();
    for(const seat of entries)seat.ready=false;
    setCurrentProfile(MARIO_KART_PROFILE);screen();render();$('localCapacity').focus();
    startIdleTimer();
  }
  function close(){
    if(!active)return;
    stopIdleTimer();
    active=playing=false;screen();
    entries=[];grid.replaceChildren();
    for(const slot of [...ble.devices.keys()])if(slot>=2)ble.disconnect(slot);
  }
  function start(){
    render();
    if(!active || playing || $('startLocalMatch').disabled)return;
    const modes=entries.map(seat=>seat.steering.value);
    stopIdleTimer();
    playing=true;screen();
    adapter().api.startLocalRoom({drivers:entries.map(seat=>seat.driver.value),modes,
      names:entries.map((_,i)=>'P'+(i+1)),laps:Number($('localLaps').value),bots:$('localBots').value==='true'});
    setCurrentProfile(kartRaceProfile(modes[0]),modes.map(kartRaceProfile));
    adapter().frame.addEventListener('kart-local-results',results,{once:true});
    $('backLocalRoom').focus();
  }
  function results(){
    finished=true;setCurrentProfile(MARIO_KART_PROFILE);setText($('backLocalRoom'),'Return for rematch');
    startIdleTimer();
  }
  function input(slot,state){
    if(playing){adapter()?.api?.setControllerState(slot,state);return;}
    const seat=entries[slot];
    if(!seat || !state.ready || !ble.connected(slot))return;
    if(state.pressed.a || state.pressed.two){
      if(expireIfIdle())return;
      startIdleTimer();seat.ready=!seat.ready;render();
    }
  }
  $('localCapacity').onchange=e=>resize(Number(e.target.value));
  $('createLocalRoom').onclick=open;$('startLocalMatch').onclick=start;
  $('backLocalRoom').onclick=()=>{back();setText($('backLocalRoom'),'Return to room');};
  $('leaveLocalRoom').onclick=()=>{close();$('createLocalRoom').focus();};
  $('localFullscreen').onclick=()=>document.fullscreenElement?document.exitFullscreen():document.documentElement.requestFullscreen?.().catch(()=>{});
  return {get active(){return active;},get capacity(){return capacity;},close,render,input};
}
