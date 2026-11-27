const {randomBytes, randomInt, randomUUID} = require('node:crypto');
const drivers = require('../public/core/kart-roster.json').map(driver=>driver.id);
const capacity = game => game==='kart-racing' ? drivers.length : 2;
const defaults = {game:'fruit-ninja', duration:60, practice:true, laps:1, drivers:['mario','luigi']};

function installLobbies(io) {
  const service = io.of('/lobbies'), rooms = new Map();
  const origins = (process.env.LOBBY_ORIGINS || '').split(',').map(s=>s.trim()).filter(Boolean);
  service.use((socket,next)=>{
    const origin = socket.handshake.headers.origin;
    next(origins.length && !origins.includes(origin) ? new Error('Frontend origin is not configured.') : undefined);
  });
  const directory = () => Array.from(rooms.values()).filter(r=>r.public && !r.match && r.players.length<r.capacity)
    .map(r=>({code:r.code, name:r.players[0].name, game:r.options.game, count:r.players.length,capacity:r.capacity}));
  function updateLinks(room) {
    for(const p of room.players){
      const links=service.sockets.get(p.id)?.data.links;
      p.linked=room.players.length>1 && room.players.every(other=>other===p || links?.has(other.id));
    }
  }
  const publish = room => service.to(room.code).emit('room', room);
  function leave(socket) {
    const room = rooms.get(socket.data.code);
    if (!room) return;
    const host = room.players[0].id===socket.id;
    socket.leave(room.code);
    delete socket.data.code;
    if (host) {
      rooms.delete(room.code);
      service.to(room.code).emit('closed','Host left the lobby.');
      for (const player of room.players.slice(1)) {
        const guest=service.sockets.get(player.id);
        if(guest){guest.leave(room.code);delete guest.data.code;}
      }
    } else {
      const index=room.players.findIndex(p=>p.id===socket.id);
      room.players.splice(index,1);
      const [driver]=room.options.drivers.splice(index,1);
      if(room.options.drivers.length<2)room.options.drivers.push(driver);
      room.match=null;
      for(const p of room.players){
        Object.assign(p,{ready:false,finished:false});
        service.sockets.get(p.id)?.data.links?.delete(socket.id);
      }
      updateLinks(room);
      publish(room);
    }
    service.emit('directory',directory());
  }
  service.on('connection',socket=>{
    socket.emit('directory',directory());
    socket.on('clock',ack=>{if(typeof ack==='function')ack(Date.now());});
    socket.on('lobby',(request,ack)=>{
      if(typeof ack!=='function' || !request || typeof request!=='object')return;
      const room=rooms.get(socket.data.code), player=room?.players.find(p=>p.id===socket.id);
      const fail=error=>ack({error});
      const name=String(request.name || 'Player').trim().slice(0,32) || 'Player';
      if(request.action==='create' || request.action==='join'){
        if(room)return fail('Leave your current lobby first.');
        let next;
        if(request.action==='create'){
          let code;
          do {code=randomBytes(5).toString('hex').toUpperCase();} while(rooms.has(code));
          const game=request.game==='kart-racing'?'kart-racing':'fruit-ninja';
          next={code,public:request.public===true,capacity:capacity(game),options:{...defaults,drivers:defaults.drivers.slice(),game},players:[],match:null};
          rooms.set(code,next);
        }else{
          next=rooms.get(String(request.code).trim().toUpperCase());
          if(!next || next.match || next.players.length>=next.capacity)return fail('Lobby is unavailable or full.');
        }
        if(next.players.length===next.options.drivers.length)
          next.options.drivers.push(drivers.find(d=>!next.options.drivers.includes(d)));
        socket.data.code=next.code;socket.data.links=new Set();socket.join(next.code);
        next.players.forEach(p=>{p.ready=false;});
        next.players.push({id:socket.id,name,ble:!!request.ble,linked:false,ready:false,finished:false});
        updateLinks(next);publish(next);service.emit('directory',directory());return ack({ok:true});
      }
      if(!player)return fail('Join a lobby first.');
      const host=room.players[0]===player;
      switch(request.action){
        case 'leave': leave(socket);return ack({ok:true});
        case 'ble': player.ble=!!request.value;break;
        case 'linked': {
          const others=room.players.filter(p=>p!==player);
          const other=others.find(p=>p.id===request.peer) || (!request.peer && others.length===1 && others[0]);
          if(!other)return fail('Peer left the lobby.');
          if(request.value)socket.data.links.add(other.id);else socket.data.links.delete(other.id);
          updateLinks(room);
          if(!request.value){
            room.players.forEach(p=>p.ready=false);
            if(room.match){room.match=null;if(room.public)service.emit('directory',directory());}
          }
          break;
        }
        case 'options': {
          if(!host || room.match)return fail('Only the host can change setup between matches.');
          const o=request.options;
          if(!o || !['fruit-ninja','kart-racing'].includes(o.game) || ![30,60,120].includes(o.duration)
            || ![1,3].includes(o.laps) || room.players.length>capacity(o.game)
            || !Array.isArray(o.drivers) || o.drivers.length!==Math.max(2,room.players.length)
            || new Set(o.drivers).size!==o.drivers.length || !o.drivers.every(d=>drivers.includes(d)))return fail('Choose distinct drivers and a game with enough seats.');
          room.capacity=capacity(o.game);
          room.options={game:o.game,duration:o.duration,practice:!!o.practice,laps:o.laps,drivers:o.drivers};
          room.players.forEach(p=>p.ready=false);service.emit('directory',directory());break;
        }
        case 'ready':
          if(room.match || !player.linked || room.players.length<2)return fail('Wait for the peer connection.');
          player.ready=!!request.value;break;
        case 'start':
          if(!host || room.match || room.players.length<2 || !room.players.every(p=>p.ready && p.linked))return fail('Every player must be ready.');
          room.match={id:randomUUID(),seed:randomInt(0x7fffffff),at:Date.now()+900};
          room.players.forEach(p=>{p.finished=false;p.ready=false;});if(room.public)service.emit('directory',directory());break;
        case 'finish':
          if(!room.match || request.match!==room.match.id)return fail('Match has changed.');
          player.finished=true;
          if(room.players.every(p=>p.finished)){room.match=null;if(room.public)service.emit('directory',directory());}
          break;
        default:return fail('Unknown lobby action.');
      }
      publish(room);ack({ok:true});
    });
    socket.on('signal',packet=>{
      const room=rooms.get(socket.data.code), other=room?.players.find(p=>p.id!==socket.id && p.id===packet?.to);
      if(other && (packet.description || packet.candidate))
        service.to(other.id).emit('signal',{from:socket.id,description:packet.description,candidate:packet.candidate});
    });
    socket.on('disconnect',()=>leave(socket));
  });
}
module.exports={installLobbies};
