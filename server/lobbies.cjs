const {LobbyError, roomCode, newRoom, listing, joinRoom, leaveRoom, changeRoom, requireRemovableGuest, idleDeadline, idle} = require('./lobby-room.cjs');

function installLobbies(io) {
  const service = io.of('/lobbies'), rooms = new Map();
  const origins = (process.env.LOBBY_ORIGINS || '').split(',').map(s=>s.trim()).filter(Boolean);
  service.use((socket,next)=>{
    const origin = socket.handshake.headers.origin;
    next(origins.length && !origins.includes(origin) ? new Error('Frontend origin is not configured.') : undefined);
  });
  const directory = () => Array.from(rooms.values()).filter(s=>idleDeadline(s)>Date.now()).map(listing).filter(Boolean);
  function closeRoom(state, message) {
    const {code,players}=state.room;
    clearTimeout(state.timer);
    rooms.delete(code);
    service.to(code).emit('closed',message);
    for(const {id} of players){
      const member=service.sockets.get(id);
      if(member?.data.code===code){member.leave(code);delete member.data.code;}
    }
    service.emit('directory',directory());
  }
  function liveRoom(code) {
    const state=rooms.get(code);
    if(!state || Date.now()<idleDeadline(state))return state;
    closeRoom(state,idle.message);
  }
  function armExpiry(state) {
    clearTimeout(state.timer);
    if(!state.room.match){
      state.timer=setTimeout(()=>{
        if(liveRoom(state.room.code)===state)armExpiry(state);
      },Math.max(0,idleDeadline(state)-Date.now()));
      state.timer.unref();
    }
  }
  function publish(state) {
    armExpiry(state);
    service.to(state.room.code).emit('room',state.room);
  }
  function leave(socket) {
    const state = liveRoom(socket.data.code);
    if (!state) return;
    const {code} = state.room;
    socket.leave(code);
    delete socket.data.code;
    if (leaveRoom(state, socket.id)) {
      publish(state);
      service.emit('directory',directory());
    } else {
      closeRoom(state,'Host left the lobby.');
    }
  }
  service.on('connection', socket => {
    socket.emit('directory',directory());
    socket.on('clock',ack=>{if(typeof ack==='function')ack(Date.now());});
    socket.on('lobby',(request,ack)=>{
      if (typeof ack !== 'function' || !request || typeof request !== 'object') return;
      const code=socket.data.code;
      const state = liveRoom(code);
      if(code && !state)return ack({error:idle.message});
      try {
        if (request.action === 'create' || request.action === 'join') {
          if (state) throw new LobbyError('Leave your current lobby first.');
          let next;
          if (request.action === 'create') {
            let code;
            do { code = roomCode(); } while (rooms.has(code));
            next = newRoom(code, request);
          } else {
            next = liveRoom(String(request.code).trim().toUpperCase());
            if (!next) throw new LobbyError('Lobby is unavailable or full.');
          }
          joinRoom(next, socket.id, request);
          rooms.set(next.room.code, next);
          socket.data.code = next.room.code;
          socket.join(next.room.code);
          publish(next);
          service.emit('directory', directory());
        } else {
          if (!state) throw new LobbyError('Join a lobby first.');
          if (request.action === 'leave') leave(socket);
          else if (request.action === 'remove') {
            requireRemovableGuest(state,socket.id,request.player);
            const guest=service.sockets.get(request.player);
            leave(guest);
            guest.emit('closed','The host removed you from the lobby.');
          }
          else {
            const before = JSON.stringify(listing(state));
            changeRoom(state, socket.id, request);
            if(request.action==='activity')armExpiry(state);
            else publish(state);
            if (before !== JSON.stringify(listing(state))) service.emit('directory', directory());
          }
        }
        ack({ok:true});
      } catch (error) {
        if (!(error instanceof LobbyError)) throw error;
        ack({error:error.message});
      }
    });
    socket.on('signal',packet=>{
      const state = liveRoom(socket.data.code);
      const other = state?.room.players.find(p=>p.id!==socket.id && p.id===packet?.to);
      if(other && (packet.description || packet.candidate || packet.retry===true))
        service.to(other.id).emit('signal',{from:socket.id,description:packet.description,candidate:packet.candidate,
          generation:packet.generation,retry:packet.retry===true});
    });
    socket.on('disconnect',()=>leave(socket));
  });
}
module.exports = {installLobbies};
