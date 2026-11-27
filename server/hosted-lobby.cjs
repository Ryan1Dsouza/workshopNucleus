const {createHash} = require('node:crypto');
const {LobbyError, newRoom, listing, joinRoom, leaveRoom, changeRoom} = require('./lobby-room.cjs');

const LEASE = 120_000;
const hash = value => createHash('sha256').update(value).digest('hex');
const isCode = code => typeof code === 'string' && /^[A-F0-9]{10}$/.test(code);

// Redis commits room state and its public listing together. Losing writers re-read
// the winning revision before applying their action (including the last free seat).
const commit = `
local rev = redis.call('HGET',KEYS[1],'rev') or '0'
if rev ~= ARGV[1] then return 0 end
if ARGV[2] ~= '' and ARGV[2] ~= ARGV[3] then redis.call('ZREM',KEYS[2],ARGV[2]) end
if ARGV[3] ~= '' then redis.call('ZADD',KEYS[2],ARGV[4],ARGV[3]) end
if ARGV[5] == '' then redis.call('DEL',KEYS[1]) else
  redis.call('HSET',KEYS[1],'rev',ARGV[6],'data',ARGV[5])
  redis.call('EXPIRE',KEYS[1],240)
end
return 1`;
const readDirectory = `
redis.call('ZREMRANGEBYSCORE',KEYS[1],'-inf',ARGV[1])
return redis.call('ZREVRANGE',KEYS[1],0,99)`;
function lobbyStore(command, prefix = 'ck:{lobbies-v1}:') {
  const directoryKey = prefix + 'directory';
  const summary = s => s && listing(s) ? JSON.stringify(listing(s)) : '';
  return {
    async directory(now) {
      return (await command(['EVAL',readDirectory,1,directoryKey,now])).map(row=>JSON.parse(row));
    },
    async load(code) {
      const json = await command(['HGET',prefix+code,'data']);
      return json ? JSON.parse(json) : null;
    },
    async save(code, previous, state) {
      if (state) state.rev = (previous?.rev || 0) + 1;
      return !!await command(['EVAL',commit,2,prefix+code,directoryKey,previous?.rev || 0,
        summary(previous),summary(state),state ? state.seen[state.room.players[0].id]+LEASE : 0,
        state ? JSON.stringify(state) : '',state?.rev || 0]);
    }
  };
}

async function redis(command) {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) throw new Error('Lobby storage is unconfigured.');
  const r = await fetch(url, {method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json'},
    body:JSON.stringify(command),signal:AbortSignal.timeout(4500)});
  const result = await r.json().catch(()=>({error:'Invalid storage response.'}));
  if (!r.ok || result.error) {
    const error=new Error('Lobby storage is unavailable.');
    if (r.status===429 || /quota|(?:command|request|bandwidth|rate)s? limit|monthly.*limit/i.test(result.error||'')) error.status=429;
    throw error;
  }
  return result.result;
}

function remove(state, id) {
  delete state.seen[id];
  delete state.last[id];
  state.signals = state.signals.filter(s=>s.from !== id && s.to !== id);
  return leaveRoom(state,id);
}
function acceptSignals(state, id, packets, now) {
  if (!Array.isArray(packets) || !packets.length || packets.length > 32) throw new LobbyError('Invalid signaling batch.');
  state.signals = state.signals.filter(s=>s.at > now - LEASE);
  for (const p of packets) {
    if (!p || p.to === id || !state.room.players.some(other=>other.id===p.to)) continue;
    const entry = {to:p.to, from:id, seq:++state.seq, at:now};
    if(Number.isSafeInteger(p.generation) && p.generation>0)entry.generation=p.generation;
    if (p.retry===true) entry.retry=true;
    else if (['offer','answer'].includes(p.description?.type) && typeof p.description.sdp === 'string' && p.description.sdp.length < 20000)
      entry.description = {type:p.description.type,sdp:p.description.sdp};
    else if (typeof p.candidate?.candidate === 'string' && p.candidate.candidate.length < 2048) {
      const {candidate,sdpMid,sdpMLineIndex,usernameFragment} = p.candidate;
      entry.candidate = {candidate,sdpMid,sdpMLineIndex,usernameFragment};
    } else throw new LobbyError('Invalid peer signal.');
    state.signals.push(entry);
  }
  if (state.signals.length > 512) throw new LobbyError('Too many pending peer signals.');
}

async function handleLobby(store, secret, q, now = Date.now()) {
  if (typeof secret !== 'string' || !/^[a-f0-9]{64}$/.test(secret)) throw new LobbyError('Invalid player session.');
  if (!q || typeof q !== 'object') throw new LobbyError('Invalid lobby request.');
  const id = hash(secret).slice(0,32);
  if (q.action === 'directory') return {id,time:now,directory:await store.directory(now)};
  const reads = q.action === 'poll';
  if (!reads && (typeof q.requestId !== 'string' || !/^[a-f0-9-]{36}$/.test(q.requestId))) throw new LobbyError('Invalid request ID.');
  const code = q.action === 'create' ? hash(secret+q.requestId).slice(0,10).toUpperCase() : String(q.code||'').trim().toUpperCase();
  if (!isCode(code)) throw new LobbyError('Invalid room code.');
  for (let attempt=0; attempt<12; attempt++) {
    const previous = await store.load(code);
    let state = previous && structuredClone(previous), dirty = false;
    for (const p of state?.room.players.slice() || []) {
      if (state.seen[p.id] + LEASE > now) continue;
      state = remove(state,p.id); dirty = true;
      if (!state) break;
    }
    if (!state && q.action === 'create' && !previous) {
      state = Object.assign(newRoom(code,q),{seen:{},last:{},signals:[],seq:0});
    } else if (!state) {
      if (dirty && !await store.save(code,previous,null)) continue;
      if (reads || q.action === 'leave') return {closed:true,time:now};
      throw new LobbyError('Lobby is unavailable or full.');
    }
    const member = state.room.players.some(p=>p.id===id);
    if (q.action === 'leave' && !member) return {closed:true,time:now};
    if (!reads && state.last[id] !== q.requestId) {
      if (q.action === 'create' || q.action === 'join') {
        if (q.action === 'create' && previous) throw new LobbyError('Room code is already in use. Create again.');
        joinRoom(state,id,q);
      } else {
        if (!member) throw new LobbyError('Join a lobby first.');
        if (q.action === 'leave') state=remove(state,id);
        else if (q.action === 'signals') acceptSignals(state,id,q.packets,now);
        else {
          changeRoom(state,id,q,now);
          if (q.action === 'start') state.room.match.at = now + 2200;
        }
      }
      dirty = true;
      if (state && q.action !== 'leave') state.last[id] = q.requestId;
    } else if (!member) return {closed:true,time:now};
    if (state && q.action !== 'leave' && (!state.seen[id] || now - state.seen[id] >= 25000)) {
      state.seen[id]=now; dirty=true;
    }
    if (dirty && !await store.save(code,previous,state)) {
      await new Promise(resolve=>setTimeout(resolve,8+Math.random()*18*attempt));
      continue;
    }
    if (q.action === 'leave') return {closed:true,time:now};
    const since = Number.isSafeInteger(q.since) ? q.since : 0;
    return {id,time:now,room:state.room,revision:state.rev,cursor:state.seq,
      signals:state.signals.filter(s=>s.to===id && s.seq>since).map(({seq,at,to,...signal})=>signal)};
  }
  throw new Error('Concurrent lobby update timed out.');
}
module.exports = {handleLobby,lobbyStore,redis,LobbyError};
