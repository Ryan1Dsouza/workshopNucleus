import hosted from '../server/hosted-lobby.cjs';
import turn from '../server/turn-config.cjs';

const store = hosted.lobbyStore(hosted.redis);
export default async function lobby(req,res) {
  res.setHeader('Cache-Control','private, no-store');
  if (req.method !== 'POST') { res.setHeader('Allow','POST'); return res.status(405).end(); }
  if (req.headers.origin && !['https://','http://'].some(s=>req.headers.origin===s+req.headers.host)) return res.status(403).end();
  if (!req.headers['content-type']?.startsWith('application/json')) return res.status(415).end();
  if (Number(req.headers['content-length']) > 48000 || JSON.stringify(req.body || {}).length > 48000) return res.status(413).end();
  try {
    const result = await hosted.handleLobby(store,req.headers.authorization?.replace(/^Bearer /,''),req.body);
    if(result.room && ['create','join'].includes(req.body.action))result.iceServers=await turn.roomIceServers();
    res.status(200).json(result);
  } catch (error) {
    if (error instanceof hosted.LobbyError) return res.status(200).json({error:error.message});
    res.status(error.status===429 ? 429 : 503).json({error:'Lobby service is temporarily unavailable.'});
  }
}
