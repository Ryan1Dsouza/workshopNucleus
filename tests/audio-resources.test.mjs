import test from 'node:test';
import assert from 'node:assert/strict';
import { AudioEngine } from '../public/core/audio.js';
import { KartAudio } from '../public/games/mario-kart/audio.js';
const parameter=()=>({value:0,setValueAtTime(){},exponentialRampToValueAtTime(){}});
const node=()=>({connect(){return this;},disconnect(){this.disconnected=true;},start(){},stop(){},gain:parameter(),frequency:parameter(),detune:parameter(),Q:parameter()});
test('repeated effects share bounded noise buffers and release completed audio nodes', () => {
  const a=new AudioEngine(),nodes=[];let buffers=0;
  const make=()=>{const n=node();nodes.push(n);return n;};
  a.master=node();a.ctx={currentTime:0,sampleRate:1000,createBufferSource:make,createGain:make,createBiquadFilter:make,createOscillator:make,createBuffer(channels,frames){buffers++;return {getChannelData:()=>new Float32Array(frames)};}};
  for(let n=0;n<200;n++){const src=a.noise({dur:.2});src.onended();}
  assert.equal(buffers,1);assert(nodes.every(n=>n.disconnected));
  for(let n=0;n<20;n++)a.noise({dur:.2+n/100});assert(a.noiseBuffers.size<=8);
  const osc=a.tone({freq:440});osc.onended();assert(osc.disconnected);
});
test('simultaneous missing audio override requests share one fetch sequence', async () => {
  const a=new AudioEngine(),previous=globalThis.fetch;let calls=0;
  a.ensureCtx=()=>true;globalThis.fetch=async()=>{calls++;await new Promise(r=>setTimeout(r,1));return {ok:false};};
  try {await Promise.all(Array.from({length:40},()=>a.loadOverride('missing')));assert.equal(calls,3);assert.equal(a.overrideLoads.size,0);}
  finally{globalThis.fetch=previous;}
});

test('empty optional audio responses use synthesis without attempting to decode or fetching again',async()=>{
  const a=new AudioEngine(),previous=globalThis.fetch;let calls=0,decoded=0;
  a.ensureCtx=()=>true;a.ctx={decodeAudioData(){decoded++;}};
  globalThis.fetch=async()=>{calls++;return {ok:true,status:204};};
  try{assert.equal(await a.loadOverride('optional'),null);assert.equal(await a.loadOverride('optional'),null);assert.equal(calls,3);assert.equal(decoded,0);}
  finally{globalThis.fetch=previous;}
});

test('kart menu plays each click immediately even while the sample pack is loading',async()=>{
  const kart=new KartAudio(), clicks=[];
  kart.engine.ctx={currentTime:0};
  kart.engine.master={gain:parameter()};
  kart.engine.unlock=async()=>true;
  kart.engine.tone=opts=>clicks.push(opts.freq);
  let finish;
  kart.prepare=()=>new Promise(resolve=>{finish=resolve;});
  await kart.ui('cursor');
  await kart.ui('start');
  assert.deepEqual(clicks,[880,660]);
  finish(true);
  await kart.setup;
  assert.equal(clicks.length,2);
  kart.engine.enabled=false;
  await kart.ui('cursor');
  assert.equal(clicks.length,2);
});

test('a suspended menu does not replay a backlog of driver navigation sounds',async()=>{
  const kart=new KartAudio(), played=[];
  kart.engine.ctx={state:'suspended',currentTime:0};kart.engine.master={};
  let resume;
  const resumed=new Promise(resolve=>{resume=resolve;});
  kart.unlock=()=>resumed;
  kart.engine.tone=opts=>played.push(opts.freq);
  const cues=[kart.ui('cursor'),kart.ui('confirm'),kart.ui('cursor')];
  kart.engine.ctx.state='running';resume(true);
  await Promise.all(cues);
  assert.deepEqual(played,[880]);
});
