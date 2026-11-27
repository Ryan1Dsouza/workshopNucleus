const {LobbyError, roomCode, newRoom, listing, joinRoom, leaveRoom, changeRoom} = require('./lobby-room.cjs');

function installLobbies(io) {
  const service = io.of('/lobbies'), rooms = new Map();
  const origins = (process.env.LOBBY_ORIGINS || '').split(',').map(s=>s.trim()).filter(Boolean);
  service.use((socket,next)=>{
    const origin = socket.handshake.headers.origin;
    next(origins.length && !origins.includes(origin) ? new Error('Frontend origin is not configured.') : undefined);
  });
  const directory = () => Array.from(rooms.values(), listing).filter(Boolean);
  const publish = state => service.to(state.room.code).emit('room', state.room);
  function leave(socket) {
    const state = rooms.get(socket.data.code);
    if (!state) return;
    const {code, players} = state.room;
    socket.leave(code);
    delete socket.data.code;
    if (leaveRoom(state, socket.id)) publish(state);
    else {
      rooms.delete(code);
      service.to(code).emit('closed', 'Host left the lobby.');
      for (const player of players.slice(1)) {
        const guest = service.sockets.get(player.id);
        if (guest) { guest.leave(code); delete guest.data.code; }
      }
    }
    service.emit('directory',directory());
  }
  service.on('connection', socket => {
    socket.emit('directory',directory());
    socket.on('clock',ack=>{if(typeof ack==='function')ack(Date.now());});
    socket.on('lobby',(request,ack)=>{
      if (typeof ack !== 'function' || !request || typeof request !== 'object') return;
      const state = rooms.get(socket.data.code);
      try {
        if (request.action === 'create' || request.action === 'join') {
          if (state) throw new LobbyError('Leave your current lobby first.');
          let next;
          if (request.action === 'create') {
            let code;
            do { code = roomCode(); } while (rooms.has(code));
            next = newRoom(code, request);
          } else {
            next = rooms.get(String(request.code).trim().toUpperCase());
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
          else {
            const before = JSON.stringify(listing(state));
            changeRoom(state, socket.id, request);
            publish(state);
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
      const state = rooms.get(socket.data.code);
      const other = state?.room.players.find(p=>p.id!==socket.id && p.id===packet?.to);
      if(other && (packet.description || packet.candidate || packet.retry===true))
        service.to(other.id).emit('signal',{from:socket.id,description:packet.description,candidate:packet.candidate,
          generation:packet.generation,retry:packet.retry===true});
    });
    socket.on('disconnect',()=>leave(socket));
  });
}
module.exports = {installLobbies};
