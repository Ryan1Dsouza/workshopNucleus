function isTurnUrl(url) {
  return typeof url==='string' && (
    /^turn:[^/?#@\s]+(?:\?transport=udp)?$/i.test(url) ||
    /^turns:[^/?#@\s]+:443(?:\?transport=tcp)?$/i.test(url)
  );
}

// The provider URL contains an API key. Only its short client configuration is
// returned to a room member, and only when they create or join a room.
async function roomIceServers(endpoint=process.env.METERED_ICE_URL) {
  if(!endpoint)return [];
  try {
    const url=new URL(endpoint);
    if(url.protocol!=='https:' || !/\.metered\.(live|ca)$/.test(url.hostname) ||
      url.pathname!=='/api/v1/turn/credentials' || url.username || url.password)return [];
    const response=await fetch(url,{redirect:'error',cache:'no-store',signal:AbortSignal.timeout(3500)});
    if(!response.ok)return [];
    const servers=await response.json();
    return servers.flatMap(({urls,username,credential})=>{
      if(typeof username!=='string'||typeof credential!=='string')return [];
      const allowed=[urls].flat().filter(isTurnUrl);
      return allowed.length?[{urls:allowed,username,credential}]:[];
    });
  } catch {return [];}
}
module.exports={roomIceServers,isTurnUrl};
