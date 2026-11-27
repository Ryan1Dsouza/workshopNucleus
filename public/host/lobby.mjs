import drivers from '../core/kart-roster.json' with {type:'json'};
import { MatchPeer } from '../core/transport.js';
import { iceServers } from './online-config.js';
import { lobbyClient } from './lobby-client.mjs';

const $=id=>document.getElementById(id);
const gameNames={'fruit-ninja':'Fruit Ninja','kart-racing':'Mario Kart'};

export function onlineLobby({select,inviteOrigin,adapter,current,paired,centerFruit,phonesReady}) {
  const peers=new Map(), finishedPeers=new Set();
  let socket=null,room=null,active=false,slot=-1,playing=false;
  let gameId=null,mount=null,loaded=false,round=null,started=null,startTimer,pump;
  let reported=false,played=false,offset=0,localGame,returnTimer=null;
  let epoch=0,invite=new URL(location.href).searchParams.get('join'),notice='';
  const inviteOnly=Boolean(invite && invite.trim());
  if(inviteOnly)$('joinCode').value=invite.trim();
  let outage=null;
  let linkTimer;
  const clearReturn=()=>{clearTimeout(returnTimer);returnTimer=null;};
  const exitNativeFullscreen=()=>{if(document.fullscreenElement)void document.exitFullscreen?.().catch(()=>{});};
  function returnToLobby(){
    clearReturn();
    played=false;
    exitNativeFullscreen();
    if(room)prepare(room.options.game);
    render();
  }
  function reportLinks(delay=80) {
    clearTimeout(linkTimer);
    if (!room || outage) return;
    const code=room.code;
    linkTimer=setTimeout(async()=>{
      if(room?.code!==code)return;
      const linked=[...peers].filter(([,peer])=>peer.linked).map(([id])=>id);
      if(!await emit('links',{peers:linked}) && room?.code===code)reportLinks(1500);
    },delay);
  }
  function unavailable(error){
    outage=error?.status===429?'The lobby service reached a usage limit.':'We lost contact with the lobby service.';
    render();
  }
  const status=text=>{$('lobbyStatus').textContent=text;};
  async function emit(action,payload={}) {
    const client=socket;
    if(!client?.connected)return false;
    try {
      const result=await client.command({action,...payload});
      if(result.error)throw new Error(result.error);
      return true;
    }catch(error){
      if(socket===client){notice=error.message||'Lobby server timed out.';render();}
      return false;
    }
  }
  function clearMatch() {
    clearReturn();
    clearTimeout(startTimer);clearInterval(pump);started=round=null;playing=reported=false;
    finishedPeers.clear();
    for(const peer of peers.values())peer.begin(null);
  }
  function clearRoom() {
    clearTimeout(linkTimer);
    clearMatch();
    exitNativeFullscreen();
    for(const peer of peers.values())peer.close();
    peers.clear();room=null;slot=-1;gameId=null;mount=null;loaded=played=false;
    const url=new URL(location.href);url.searchParams.delete('join');history.replaceState(null,'',url);
    // Dispose the old iframe, including any running game loop and audio.
    if(active)void select('remote');
  }
  function prepare(game) {
    gameId=game;loaded=false;
    const pending=select(game);
    mount=pending;
    pending.then(()=>{
      if(mount!==pending)return;
      loaded=!!adapter()?.api?.startMatch && current()?.id===game;
      if(!loaded)notice='Game failed to load. Leave and rejoin to retry.';
      render();
    }).catch(err=>{if(mount===pending){notice=err.message;render();}});
  }
  function syncPeers() {
    const guests=room.players.filter(p=>p.id!==socket.id);
    for(const [id,peer] of peers){
      if(!guests.some(p=>p.id===id)){peers.delete(id);peer.close();}
    }
    for(const {id} of guests){
      if(peers.has(id))continue;
      const senderSlot=()=>room?.players.findIndex(p=>p.id===id)??-1;
      const initiator=slot<senderSlot();
      const peer=new MatchPeer({initiator,iceServers:[...iceServers,...(socket.iceServers||[])],
        onStatus:render,
        signal:packet=>socket?.signal({...packet,to:id}),
        onLink:value=>{
          if(peers.get(id)!==peer || !room || peer.linked===value)return;
          peer.linked=value;
          reportLinks();
        },
        onLatency:ms=>{peer.latency=ms;renderLatency();},
        onFrame:frame=>{
          if(!playing || peers.get(id)!==peer || !frame)return;
          adapter()?.api?.receiveMatch(frame,senderSlot());
          if(frame.done===true)finishedPeers.add(id);
        }});
      peers.set(id,peer);
      if(initiator)peer.describe(true).catch(()=>peer.negotiationFailed());
    }
  }
  function signalError(err){notice='Peer connection failed. '+err.message;render();}
  function schedule(match) {
    clearMatch();round=match.id;
    for(const peer of peers.values())peer.begin(round);
    const options=room.options;
    async function start() {
      await mount;
      if(round!==match.id || !loaded)return;
      const api=adapter().api;
      playing=played=true;render();
      if(options.game==='fruit-ninja')centerFruit(true);
      api.startMatch({slot,seed:match.seed,options:{...options,names:room.players.map(p=>p.name)},elapsed:Math.max(0,Date.now()+offset-match.at)});
      if(document.hasFocus()&&!document.hidden)adapter()?.frame?.contentWindow?.focus?.();
      started=match.id;
      pump=setInterval(()=>{
        if(started!==match.id)return;
        const frame=api.matchFrame();if(!frame)return;
        for(const peer of peers.values())peer.frame(frame);
        if(frame.done && finishedPeers.size===peers.size && !reported && !outage){
          reported=true;void emit('finish',{match:match.id}).then(ok=>{if(!ok && round===match.id)reported=false;});
        }
      },50);
    }
    startTimer=setTimeout(()=>{start().catch(signalError);},Math.max(0,match.at-Date.now()-offset));
  }
  function applyRoom(next) {
    notice='';room=next;slot=next.players.findIndex(p=>p.id===socket.id);
    try{syncPeers();}catch(err){signalError(err);}
    if(gameId!==next.options.game){played=false;prepare(next.options.game);}
    if(next.match && next.match.id!==round && peers.size)schedule(next.match);
    if(!next.match && round){
      const complete=reported;
      clearMatch();
      if(!complete){played=false;exitNativeFullscreen();prepare(next.options.game);}
      else{
        returnTimer=setTimeout(returnToLobby,3000);
      }
    }
    render();
  }
  function renderLatency() {
    const times=Array.from(peers.values(),peer=>peer.latency).filter(Number.isFinite);
    const label=peers.size>1?'Highest peer latency':'Peer latency';
    $('peerLatency').textContent=times.length?label+' '+Math.max(...times)+' ms':'Peer latency pending';
  }
  function renderDrivers() {
    const fields=$('roomDrivers');
    while(fields.childElementCount>room.players.length)fields.lastElementChild.remove();
    room.players.forEach((player,i)=>{
      let label=fields.children[i];
      if(!label){
        label=document.createElement('label');label.className='online-field';
        const select=document.createElement('select');select.id='driver'+i;
        for(const driver of drivers)select.add(new Option(driver.name,driver.id));
        label.append(document.createElement('span'),select);fields.append(label);
      }
      label.firstChild.textContent='P'+(i+1)+' · '+player.name+'’s driver';
      label.lastChild.value=room.options.drivers[i];
    });
  }
  function renderPlayers() {
    const list=$('roomPlayers');
    while(list.children.length>room.players.length)list.lastElementChild.remove();
    room.players.forEach((p,i)=>{
      let row=list.children[i];
      if(!row){
        row=document.createElement('li');
        const info=document.createElement('div');
        info.append(document.createElement('strong'),document.createElement('small'));
        row.append(info);list.append(row);
      }
      const info=row.firstElementChild;
      info.firstElementChild.textContent=p.name+(i===slot?' (you)':'')+(i===0?' · Host':'');
      info.lastElementChild.textContent=(p.ble?'Phone BLE paired':'Phone BLE unpaired')+' · '+(p.ready?'Ready':playing?'Playing':'Not ready');
      let button=row.querySelector('button');
      if(slot!==0 || i===0){button?.remove();return;}
      if(!button){
        button=document.createElement('button');button.type='button';button.className='text-button remove-player';
        button.textContent='Remove';row.append(button);
        button.onclick=()=>{
          const guest=room?.players.find(player=>player.id===button.dataset.player);
          if(!guest)return;
          if(room.match && !window.confirm('Remove '+guest.name+' and end this match for everyone?'))return;
          void emit('remove',{player:guest.id});
        };
      }
      button.dataset.player=p.id;button.disabled=!!outage;
      button.setAttribute('aria-label','Remove '+p.name+' from lobby');
    });
  }
  function render() {
    const theater=active && (playing || !!returnTimer);
    document.body.classList.toggle('online-mode',active);
    document.body.classList.toggle('online-game',active && played);
    document.body.classList.toggle('online-playing',theater);
    $('gameStage').inert=active&&!playing;
    $('onlinePanel').hidden=!active;
    $('onlineMatchBar').hidden=!theater;
    $('lobbyOutage').hidden=!active||!outage;
    if(outage)$('outageDetail').textContent=outage+' '+(playing?'Your connected match can continue.':'We’ll retry automatically. Local play is available.');
    $('onlineTitle').textContent='Online multiplayer';
    for(const [id,selected] of [['playTab',!active],['onlineTab',active]]){
      $(id).classList.toggle('active',selected);
      if(selected)$(id).setAttribute('aria-current','page');else $(id).removeAttribute('aria-current');
    }
    $('roomSetup').hidden=$('leaveRoom').hidden=!room;
    $('lobbyBrowser').hidden=!!room;
    $('createLobbyGroup').hidden=inviteOnly;
    $('joinRoomButton').className=inviteOnly?'primary-button':'secondary-button';
    syncCreateOptions();
    $('createRoom').disabled=inviteOnly||!!outage||!socket?.connected;
    $('joinRoomButton').disabled=!!outage||!socket?.connected;
    $('directory').inert=!!outage;
    if(!room){status(outage?'':notice || (socket?.connected?'Lobby server connected.':'Connecting to lobby server…'));return;}
    const cap=room.capacity??2, o=room.options, kart=o.game==='kart-racing';
    const withBots=kart && o.bots!==false;
    const bots=withBots?Math.max(0,8-room.players.length):0;
    const botLabel=bots?` · ${bots} bots`:withBots?'':' · No bots';
    if(theater){
      $('matchBarTitle').textContent=gameNames[o.game];
      $('matchBarMeta').textContent='Room '+room.code+' · '+room.players.map(p=>p.name).join(', ')+(kart?botLabel:'');
      $('matchBarStatus').textContent=returnTimer?'Match complete · Returning to lobby…':'';
      $('returnLobby').hidden=!returnTimer;
      $('matchFullscreen').textContent=document.fullscreenElement?'Exit fullscreen':'Fullscreen';
    }
    $('roomCode').textContent=room.code;
    $('roomVisibility').textContent=(room.public?'Public lobby':'Private lobby')+' · '+room.players.length+'/'+cap+' players'+(kart?(withBots?(bots?` · ${bots} bots in race`:''):' · No bots'):'');
    const url=new URL(location.pathname+location.search,inviteOrigin());url.searchParams.set('join',room.code);$('inviteLink').href=url.href;
    renderPlayers();
    renderLatency();
    updateCapacityLabels($('roomCapacity'),kart,withBots);
    for(const [id,value] of Object.entries({roomGame:o.game,roomCapacity:cap,roomBots:withBots,roomDuration:o.duration,roomPractice:o.practice,roomLaps:o.laps}))$(id).value=String(value);
    for(const opt of $('roomCapacity').options)opt.disabled=Number(opt.value)<room.players.length;
    for(const el of document.querySelectorAll('.fruit-option'))el.hidden=kart;
    for(const el of document.querySelectorAll('.kart-option'))el.hidden=!kart;
    if(kart){
      renderDrivers();
      $('roomSteering').disabled=!loaded || !!room.match;
      $('roomSteering').value=adapter()?.api?.steeringMode || 'dpad';
    }
    $('roomGame').querySelector('[value="fruit-ninja"]').disabled=room.players.length>2;
    $('matchOptions').disabled=!!outage||slot!==0||!!room.match;
    const me=room.players[slot];
    const waiting=[...peers.values()].filter(peer=>peer.status!=='connected');
    const blocked=waiting.some(peer=>peer.status==='blocked');
    const retrying=waiting.some(peer=>peer.status==='retrying');
    $('retryPeer').hidden=!waiting.length || !!room.match || !!outage;
    const urls=[...iceServers,...(socket.iceServers||[])].flatMap(s=>s.urls);
    const hasRelay=urls.some(url=>/^turns?:/i.test(url));
    const hasSecureRelay=urls.some(url=>/^turns:/i.test(url));
    const pendingLink=blocked ? (hasRelay?'The laptops couldn’t connect—the shared cross-network relay quota may be full or blocked on this network. Select Retry laptop connection, or try the same home Wi-Fi, a hotspot, or Local play.':
      'No direct connection between laptops. Try the same home Wi-Fi, a hotspot, or Local play.')
      : retrying?(hasSecureRelay?'Trying a secure relay…':'Retrying the connection between laptops…'):'Connecting laptops over WebRTC…';
    $('readyPlayer').textContent=me?.ready?'Cancel ready':'Ready';
    $('readyPlayer').setAttribute('aria-pressed',String(!!me?.ready));
    $('readyPlayer').disabled=!!outage||!!room.match||!me?.linked||!loaded||!phonesReady();
    $('startMatch').hidden=slot!==0;$('startMatch').textContent=played?'Rematch':'Start match';
    $('startMatch').disabled=!!outage||!!room.match||room.players.length<2||!room.players.every(p=>p.ready&&p.linked);
    status(notice || (room.match?(playing?'':'Starting together…'):!loaded?'Loading game…':room.players.length===1?'Invite a player to start.':!me?.linked?pendingLink:!phonesReady()?'Preparing phone controls…':'Choose Ready when you’re set.'));
  }
  function directory(rooms) {
    $('directory').replaceChildren();
    if(!rooms.length){$('directory').textContent='No open public lobbies.';return;}
    for(const r of rooms){
      const b=document.createElement('button'),info=document.createElement('small');
      const bots=r.game==='kart-racing'?(r.bots===false?' · No bots':r.capacity<8?' (+bots)':''):'';
      b.className='directory-room';b.textContent=r.name;info.textContent=gameNames[r.game]+' · '+r.count+'/'+(r.capacity??2)+bots+' · Join';
      b.append(info);b.onclick=()=>join(r.code);$('directory').append(b);
    }
  }
  try{$('onlineName').value=localStorage.getItem('controllerkit.lobby.name')||'';}catch{}
  function requireName(){
    const name=$('onlineName').value.trim().slice(0,32);
    if(!name){
      notice='Enter your name first.';
      render();
      $('onlineName').focus();
      return null;
    }
    try{localStorage.setItem('controllerkit.lobby.name',name);}catch{}
    return name;
  }
  function join(code){
    const name=requireName();
    if(name)void emit('join',{code,name,ble:paired()});
  }
  async function open(){
    if(active)return;
    active=true;localGame=current()?.id||'remote';const token=++epoch;
    if(current()?.id!=='remote')void select('remote');
    render();directory([]);
    try{
      const client=await lobbyClient();
      if(token!==epoch)return;
      socket=client;
      client.on('connect',()=>{
        outage=null;notice='';const before=Date.now();
        void client.clock().then(time=>{offset=time-(Date.now()+before)/2;}).catch(()=>{});
        render();
        if(invite){
          const pending=invite;invite=null;
          if($('onlineName').value.trim())join(pending);
          else{
            $('joinCode').value=pending;
            notice='Enter your name to join lobby '+pending+'.';
            render();
            $('onlineName').focus();
          }
        }
      });
      client.on('directory',directory);client.on('room',applyRoom);
      client.on('signal',p=>{void peers.get(p.from)?.receive(p).catch(signalError);});
      client.on('closed',msg=>{clearRoom();notice=msg;render();});
      client.on('available',()=>{outage=null;notice='';render();reportLinks();});
      client.on('disconnect',()=>{clearRoom();unavailable();});
      client.on('connect_error',unavailable);
      client.connect();
    }catch(err){unavailable(err);}
  }
  function close(){
    ++epoch;active=false;
    socket?.disconnect();socket=null;clearRoom();outage=null;notice='';render();
    void select(localGame||'remote');
  }
  $('onlineTab').hidden=false;$('onlineTab').onclick=open;
  $('retryLobby').onclick=()=>{if(socket)socket.retry();else {active=false;void open();}};
  $('retryPeer').onclick=()=>{notice='';for(const peer of peers.values())peer.retry();};
  $('outageLocal').onclick=close;
  let lastKartCapacity='8', lastKartBots='true';
  function updateCapacityLabels(select,kart,withBots) {
    for(const opt of select.options){
      const n=Number(opt.value);
      if(!kart)opt.textContent=n===2?'2 players (split-screen)':n+' players';
      else if(!withBots)opt.textContent=n+' players';
      else opt.textContent=n===8?(select.id==='createCapacity'?'8 players (all human)':'8 players (no bots)'):`${n} players (${8-n} ${8-n===1?'bot':'bots'})`;
    }
  }
  function syncCreateOptions() {
    const kart=$('createGame').value==='kart-racing';
    const withBots=kart && $('createBots').value!=='false';
    updateCapacityLabels($('createCapacity'),kart,withBots);
    $('createCapacity').disabled=$('createBots').disabled=!kart;
    if(!kart){$('createCapacity').value='2';$('createBots').value='false';}
  }
  $('createGame').onchange=()=>{
    const kart=$('createGame').value==='kart-racing';
    if(kart){$('createCapacity').value=lastKartCapacity;$('createBots').value=lastKartBots;}
    else{
      if(['2','3','4','5','6','7','8'].includes($('createCapacity').value) && !$('createCapacity').disabled)lastKartCapacity=$('createCapacity').value;
      if(!$('createBots').disabled)lastKartBots=$('createBots').value;
    }
    syncCreateOptions();
  };
  $('createCapacity').onchange=()=>{if($('createGame').value==='kart-racing')lastKartCapacity=$('createCapacity').value;};
  $('createBots').onchange=()=>{if($('createGame').value==='kart-racing')lastKartBots=$('createBots').value;syncCreateOptions();};
  $('createRoom').onclick=()=>{
    if(inviteOnly)return;
    const name=requireName();
    if(!name)return;
    void emit('create',{public:$('visibility').value==='public',game:$('createGame').value,
      capacity:$('createGame').value==='kart-racing'?+$('createCapacity').value:2,
      bots:$('createGame').value==='kart-racing'?$('createBots').value!=='false':false,name,ble:paired()});
  };
  $('joinForm').onsubmit=e=>{e.preventDefault();join($('joinCode').value);};
  $('onlineName').addEventListener('keydown',e=>{
    if(e.key==='Enter' && inviteOnly && !room){e.preventDefault();join($('joinCode').value);}
  });
  $('leaveRoom').onclick=async()=>{if(await emit('leave')){clearRoom();notice='Left lobby.';render();}};
  $('matchFullscreen').onclick=()=>{
    const stage=document.querySelector('.play-area');
    if(document.fullscreenElement)void document.exitFullscreen?.().catch(()=>{});
    else void stage?.requestFullscreen?.().catch(()=>{});
  };
  document.addEventListener('fullscreenchange',()=>{if(active)render();});
  $('returnLobby').onclick=()=>returnToLobby();
  $('readyPlayer').onclick=()=>{
    const audio=adapter()?.api?.audio;
    void (audio?.engine||audio)?.unlock?.();
    void emit('ready',{value:!room.players[slot].ready});
  };
  $('startMatch').onclick=()=>emit('start');
  $('roomSteering').onchange=event=>adapter()?.api?.setSteeringMode(event.target.value);
  $('copyInvite').onclick=async()=>{
    try{await navigator.clipboard.writeText($('inviteLink').href);status('Invite link copied.');}
    catch{status('Copy the address from Join link.');}
  };
  $('matchOptions').onchange=async e=>{
    const chosen=room.options.drivers.slice();
    if(e.target.closest('#roomDrivers')){
      const index=Number(e.target.id.slice('driver'.length)), other=chosen.indexOf(e.target.value);
      if(other>=0)chosen[other]=chosen[index];
      chosen[index]=e.target.value;
    }
    const nextGame=$('roomGame').value;
    if(e.target===$('roomGame') && nextGame==='kart-racing')$('roomBots').value=lastKartBots;
    if(e.target===$('roomBots') && nextGame==='kart-racing')lastKartBots=$('roomBots').value;
    const nextCapacity=nextGame==='kart-racing'?Math.max(room.players.length,+$('roomCapacity').value):2;
    const nextBots=nextGame==='kart-racing'?$('roomBots').value!=='false':false;
    await emit('options',{options:{game:nextGame,capacity:nextCapacity,bots:nextBots,duration:+$('roomDuration').value,practice:$('roomPractice').value==='true',laps:+$('roomLaps').value,drivers:chosen}});
  };
  return {open,close,render,get active(){return active;},get room(){return room;},get slot(){return slot;},get playing(){return playing;},get peer(){return peers.values().next().value;},get peers(){return peers;},
    bluetoothChanged(){if(room && room.players[slot]?.ble!==paired())void emit('ble',{value:paired()});if(active)render();}};
}
