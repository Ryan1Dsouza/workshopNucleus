import {cp,mkdir,readdir,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {iceServers as defaults} from '../public/host/online-config.js';
import {stunServers} from '../public/core/direct-ice.js';

const root=fileURLToPath(new URL('../',import.meta.url)), out=path.join(root,'dist','web');
const signal=process.env.SIGNAL_URL ? new URL(process.env.SIGNAL_URL) : null;
if(signal && (!['http:','https:'].includes(signal.protocol)||signal.username||signal.password||signal.pathname!=='/'))throw Error('SIGNAL_URL must be an HTTP(S) origin.');
const servers=stunServers(JSON.parse(process.env.ICE_SERVERS || JSON.stringify(defaults)));

for(const [source,target] of [
  ['public','.'],['workshop','workshop'],['node_modules/three/build','vendor/three'],
  ['node_modules/three/examples/jsm','vendor/three-examples'],
  ['node_modules/socket.io/client-dist/socket.io.esm.min.js','socket.io/socket.io.esm.min.js'],
]){
  const dest=path.join(out,target);
  await mkdir(path.dirname(dest),{recursive:true});
  await cp(path.join(root,source),dest,{recursive:true});
}
const audioFiles=(await readdir(path.join(root,'public','audio')).catch(e=>{if(e.code==='ENOENT')return [];throw e;})).map(name=>'/audio/'+name);
await writeFile(path.join(out,'host/online-config.js'),[
  'export const SIGNAL_URL = '+JSON.stringify(signal?.origin||'')+';',
  'export const iceServers = '+JSON.stringify(servers)+';',
  'export const staticSite = true;',
  'export const audioFiles = '+JSON.stringify(audioFiles)+';',
].join('\n')+'\n');
console.log('Built static frontend in dist/web');
