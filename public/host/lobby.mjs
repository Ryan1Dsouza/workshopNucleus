import drivers from '../core/kart-roster.json' with {type:'json'};
import { MatchPeer } from '../core/transport.js';
import { SIGNAL_URL, iceServers } from './online-config.js';

const $=id=>document.getElementById(id);
const gameNames={'fruit-ninja':'Fruit Ninja','kart-racing':'Mario Kart'};

export function onlineLobby({select,inviteOrigin,adapter,current,paired,centerFruit,phonesReady}) {
  const peers=new Map(), finishedPeers=new Set();
  let socket=null,room=null,active=false,slot=-1,playing=false;
  let gameId=null,mount=null,loaded=false,round=null,started=null,startTimer,pump;
  let reported=false,played=false,offset=0,localGame;
  let epoch=0,notice='',invite=new URL(location.href).searchParams.get('join');
  const status=text=>{$('lobbyStatus').textContent=text;};
  function emit(action,payload={}) {
    const client=socket;
    if(!client?.connected)return Promise.resolve(false);
    return new Promise(resolve=>client.timeout(5000).emit('lobby',{action,...payload},(error,result)=>{
      if(error || result?.error){
        if(socket===client){notice=result?.error||'Lobby server timed out.';render();}
        resolve(false);
      }else resolve(true);
    }));
  }
  function clearMatch() {
    clearTimeout(startTimer);clearInterval(pump);started=round=null;playing=reported=false;
    finishedPeers.clear();
    for(const peer of peers.values())peer.begin(null);
  }
  function clearRoom() {
    clearMatch();
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
      const peer=new MatchPeer({initiator,iceServers,
        signal:packet=>socket?.emit('signal',{...packet,to:id}),
        onLink:value=>{
          if(peers.get(id)!==peer || !room || peer.linked===value)return;
          peer.linked=value;
          void emit('linked',{peer:id,value});
        },
        onLatency:ms=>{peer.latency=ms;renderLatency();},
        onFrame:frame=>{
          if(!playing || peers.get(id)!==peer || !frame)return;
          adapter()?.api?.receiveMatch(frame,senderSlot());
          if(frame.done===true)finishedPeers.add(id);
        }});
      peers.set(id,peer);
      if(initiator)peer.describe(true).catch(signalError);
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
      api.startMatch({slot,seed:match.seed,options,elapsed:Math.max(0,Date.now()+offset-match.at)});
      started=match.id;
      pump=setInterval(()=>{
        if(started!==match.id)return;
        const frame=api.matchFrame();if(!frame)return;
        for(const peer of peers.values())peer.frame(frame);
        if(frame.done && finishedPeers.size===peers.size && !reported){
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
      if(!complete){played=false;prepare(next.options.game);}
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
  function render() {
    document.body.classList.toggle('online-mode',active);
    document.body.classList.toggle('online-game',active && played);
    document.body.classList.toggle('online-playing',active && playing);
    $('gameStage').inert=active&&!playing;
    $('onlinePanel').hidden=!active;
    $('onlineTitle').textContent=playing?gameNames[room.options.game]:'Online multiplayer';
    for(const [id,selected] of [['playTab',!active],['onlineTab',active]]){
      $(id).classList.toggle('active',selected);
      if(selected)$(id).setAttribute('aria-current','page');else $(id).removeAttribute('aria-current');
    }
    $('roomSetup').hidden=$('leaveRoom').hidden=!room;
    $('lobbyBrowser').hidden=!!room;
    $('createRoom').disabled=$('joinForm').querySelector('button').disabled=!socket?.connected;
    if(!room){status(notice || (socket?.connected?'Lobby server connected.':'Connecting to lobby server…'));return;}
    $('roomCode').textContent=room.code;$('roomVisibility').textContent=(room.public?'Public lobby':'Private lobby')+' · '+room.players.length+'/'+(room.capacity??2);
    const url=new URL(location.pathname+location.search,inviteOrigin());url.searchParams.set('join',room.code);$('inviteLink').href=url.href;
    const players=room.players.map((p,i)=>{
      const li=document.createElement('li'), strong=document.createElement('strong'), detail=document.createElement('small');
      strong.textContent=p.name+(i===slot?' (you)':'')+(i===0?' · Host':'');
      detail.textContent=(p.ble?'Phone BLE paired':'Phone BLE unpaired')+' · '+(p.ready?'Ready':playing?'Playing':'Not ready');
      li.append(strong,detail);return li;
    });
    $('roomPlayers').replaceChildren(...players);
    renderLatency();
    const o=room.options,kart=o.game==='kart-racing';
    for(const [id,value] of Object.entries({roomGame:o.game,roomDuration:o.duration,roomPractice:o.practice,roomLaps:o.laps}))$(id).value=String(value);
    for(const el of document.querySelectorAll('.fruit-option'))el.hidden=kart;
    for(const el of document.querySelectorAll('.kart-option'))el.hidden=!kart;
    if(kart){
      renderDrivers();
      $('roomSteering').disabled=!loaded || !!room.match;
      $('roomSteering').value=adapter()?.api?.steeringMode || 'dpad';
    }
    $('roomGame').querySelector('[value="fruit-ninja"]').disabled=room.players.length>2;
    $('matchOptions').disabled=slot!==0||!!room.match;
    const me=room.players[slot];
    $('readyPlayer').textContent=me?.ready?'Cancel ready':'Ready';
    $('readyPlayer').setAttribute('aria-pressed',String(!!me?.ready));
    $('readyPlayer').disabled=!!room.match||!me?.linked||!loaded||!phonesReady();
    $('startMatch').hidden=slot!==0;$('startMatch').textContent=played?'Rematch':'Start match';
    $('startMatch').disabled=!!room.match||room.players.length<2||!room.players.every(p=>p.ready&&p.linked);
    status(notice || (room.match?(playing?'':'Starting together…'):!loaded?'Loading game…':room.players.length===1?'Invite a player to start.':!me?.linked?'Connecting laptops over WebRTC…':!phonesReady()?'Preparing phone controls…':'Choose Ready when you’re set.'));
  }
  function directory(rooms) {
    $('directory').replaceChildren();
    if(!rooms.length){$('directory').textContent='No open public lobbies.';return;}
    for(const r of rooms){
      const b=document.createElement('button'),info=document.createElement('small');
      b.className='directory-room';b.textContent=r.name;info.textContent=gameNames[r.game]+' · '+r.count+'/'+(r.capacity??2)+' · Join';
      b.append(info);b.onclick=()=>join(r.code);$('directory').append(b);
    }
  }
  try{$('onlineName').value=localStorage.getItem('controllerkit.lobby.name')||'';}catch{}
  function identity(){
    const name=$('onlineName').value.trim();
    try{localStorage.setItem('controllerkit.lobby.name',name);}catch{}
    return {name:name||'Player',ble:paired()};
  }
  function join(code){void emit('join',{code,...identity()});}
  async function open(){
    if(active)return;
    active=true;localGame=current()?.id||'remote';const token=++epoch;
    if(current()?.id!=='remote')void select('remote');
    render();directory([]);
    try{
      const {io}=await import('/socket.io/socket.io.esm.min.js');
      if(token!==epoch)return;
      const client=io((SIGNAL_URL||location.origin).replace(/\/$/,'')+'/lobbies',{transports:['websocket'],autoConnect:false});
      socket=client;
      client.on('connect',()=>{
        notice='';const before=Date.now();
        client.emit('clock',time=>{offset=time-(Date.now()+before)/2;});
        render();
        if(invite){join(invite);invite=null;}
      });
      client.on('directory',directory);client.on('room',applyRoom);
      client.on('signal',p=>{void peers.get(p.from)?.receive(p).catch(signalError);});
      client.on('closed',msg=>{clearRoom();notice=msg;render();});
      client.on('disconnect',()=>{clearRoom();notice='Disconnected from lobby server.';render();});
      client.on('connect_error',err=>{notice='Cannot reach lobby server. '+err.message;render();});
      client.connect();
    }catch(err){notice=err.message;render();}
  }
  function close(){
    ++epoch;active=false;
    socket?.removeAllListeners();socket?.disconnect();socket=null;clearRoom();notice='';render();
    void select(localGame||'remote');
  }
  $('onlineTab').hidden=false;$('onlineTab').onclick=open;
  $('createRoom').onclick=()=>emit('create',{public:$('visibility').value==='public',game:$('createGame').value,...identity()});
  $('joinForm').onsubmit=e=>{e.preventDefault();join($('joinCode').value);};
  $('leaveRoom').onclick=async()=>{if(await emit('leave')){clearRoom();notice='Left lobby.';render();}};
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
    await emit('options',{options:{game:$('roomGame').value,duration:+$('roomDuration').value,practice:$('roomPractice').value==='true',laps:+$('roomLaps').value,drivers:chosen}});
  };
  return {open,close,render,get active(){return active;},get room(){return room;},get slot(){return slot;},get playing(){return playing;},get peer(){return peers.values().next().value;},get peers(){return peers;},
    bluetoothChanged(){if(room && room.players[slot]?.ble!==paired())void emit('ble',{value:paired()});if(active)render();}};
}
