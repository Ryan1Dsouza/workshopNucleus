const { randomBytes, randomInt, randomUUID } = require('node:crypto');
const drivers = require('../public/core/kart-roster.json').map(driver => driver.id);
const capacity = game => game === 'kart-racing' ? drivers.length : 2;
const parseCapacity = (game, value) => {
  if (game !== 'kart-racing') return 2;
  if (value === undefined || value === null || value === '') return drivers.length;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 2 || n > drivers.length) {
    throw new LobbyError(`Choose between 2 and ${drivers.length} players.`);
  }
  return n;
};
const roomCode = () => randomBytes(5).toString('hex').toUpperCase();

class LobbyError extends Error {}
function requireRule(condition, message) {
  if (!condition) throw new LobbyError(message);
}

function newRoom(code, request) {
  const game = request.game === 'kart-racing' ? 'kart-racing' : 'fruit-ninja';
  return {
    room: { code, public: request.public === true, capacity: parseCapacity(game, request.capacity), players: [], match: null,
      options: { game, duration: 60, practice: true, laps: 1, bots: game === 'kart-racing' ? request.bots !== false : false, drivers: ['mario', 'luigi'] } },
    links: {}
  };
}

function listing({room}) {
  if (!room.public || room.match || room.players.length >= room.capacity) return null;
  const entry = { code: room.code, name: room.players[0].name, game: room.options.game, count: room.players.length, capacity: room.capacity };
  if (room.options.game === 'kart-racing' && room.options.bots === false) entry.bots = false;
  return entry;
}

function updateLinks({room, links}) {
  for (const p of room.players) {
    p.linked = room.players.length > 1 && room.players.every(other => other === p || links[p.id].includes(other.id));
  }
}

function joinRoom(state, id, request) {
  const {room, links} = state;
  requireRule(!room.match && room.players.length < room.capacity, 'Lobby is unavailable or full.');
  requireRule(!room.players.some(p => p.id === id), 'Already in this lobby.');
  if (room.players.length === room.options.drivers.length)
    room.options.drivers.push(drivers.find(d => !room.options.drivers.includes(d)));
  for (const p of room.players) p.ready = false;
  const name = String(request.name || '').trim().slice(0, 32);
  requireRule(name.length > 0, 'Enter your name first.');
  requireRule(!room.players.some(p => p.name.toLowerCase() === name.toLowerCase()), 'That name is already taken in this lobby.');
  room.players.push({id, name, ble: !!request.ble, linked: false, ready: false, finished: false});
  links[id] = [];
  updateLinks(state);
}

// Removing the host closes the room. Other departures preserve each remaining driver's seat.
function leaveRoom(state, id) {
  const {room, links} = state;
  const index = room.players.findIndex(p => p.id === id);
  if (index === 0) return null;
  if (index < 0) return state;
  room.players.splice(index, 1);
  const [driver] = room.options.drivers.splice(index, 1);
  if (room.options.drivers.length < 2) room.options.drivers.push(driver);
  delete links[id];
  room.match = null;
  for (const p of room.players) {
    p.ready = p.finished = false;
    links[p.id] = links[p.id].filter(other => other !== id);
  }
  updateLinks(state);
  return state;
}

function requireRemovableGuest({room}, hostId, guestId) {
  requireRule(room.players[0]?.id===hostId, 'Only the host can remove players.');
  requireRule(guestId!==hostId && room.players.some(p=>p.id===guestId), 'Choose a guest in this lobby.');
}

function changeRoom(state, id, request, now = Date.now()) {
  const {room, links} = state;
  const player = room.players.find(p => p.id === id);
  requireRule(player, 'Join a lobby first.');
  const host = room.players[0] === player;
  switch (request.action) {
    case 'ble':
      player.ble = !!request.value;
      break;
    case 'linked': {
      const others = room.players.filter(p => p !== player);
      const other = others.find(p => p.id === request.peer) || (!request.peer && others.length === 1 && others[0]);
      requireRule(other, 'Peer left the lobby.');
      const peers = new Set(links[id]);
      if (request.value) peers.add(other.id);
      else {
        peers.delete(other.id);
        for (const p of room.players) p.ready = false;
        room.match = null;
      }
      links[id] = [...peers];
      updateLinks(state);
      break;
    }
    case 'links': {
      requireRule(Array.isArray(request.peers) && request.peers.length<=room.capacity, 'Invalid peer list.');
      const next = room.players.filter(p=>p!==player && request.peers.includes(p.id)).map(p=>p.id);
      if (links[id].some(peer=>!next.includes(peer))) {
        for (const p of room.players) p.ready=false;
        room.match=null;
      }
      links[id]=next;
      updateLinks(state);
      break;
    }
    case 'options': {
      requireRule(host && !room.match, 'Only the host can change setup between matches.');
      const o = request.options;
      requireRule(o && ['fruit-ninja', 'kart-racing'].includes(o.game) && [30,60,120].includes(o.duration)
        && [1,3].includes(o.laps),
        'Choose valid match options.');
      const nextCapacity = parseCapacity(o.game, o.capacity !== undefined ? o.capacity : (o.game === room.options.game ? room.capacity : undefined));
      requireRule(room.players.length <= nextCapacity
        && Array.isArray(o.drivers) && o.drivers.length === Math.max(2, room.players.length)
        && new Set(o.drivers).size === o.drivers.length && o.drivers.every(d => drivers.includes(d)),
        'Choose distinct drivers and a game with enough seats.');
      room.capacity = nextCapacity;
      const bots = o.game === 'kart-racing' ? (o.bots !== undefined ? o.bots !== false : (room.options.game === 'kart-racing' ? room.options.bots !== false : true)) : false;
      room.options = {game:o.game, duration:o.duration, practice:!!o.practice, laps:o.laps, bots, drivers:[...o.drivers]};
      for (const p of room.players) p.ready = false;
      break;
    }
    case 'ready':
      requireRule(!room.match && player.linked && room.players.length > 1, 'Wait for the peer connection.');
      player.ready = !!request.value;
      break;
    case 'start':
      requireRule(host && !room.match && room.players.length > 1 && room.players.every(p => p.ready && p.linked), 'Every player must be ready.');
      room.match = {id:randomUUID(), seed:randomInt(0x7fffffff), at:now + 900};
      for (const p of room.players) p.finished = p.ready = false;
      break;
    case 'finish':
      requireRule(room.match && request.match === room.match.id, 'Match has changed.');
      player.finished = true;
      if (room.players.every(p => p.finished)) room.match = null;
      break;
    default:
      throw new LobbyError('Unknown lobby action.');
  }
}

module.exports = {LobbyError, roomCode, newRoom, listing, joinRoom, leaveRoom, changeRoom, requireRemovableGuest};
