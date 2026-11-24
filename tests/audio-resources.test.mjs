import test from 'node:test';
import assert from 'node:assert/strict';
import { AudioEngine } from '../public/core/audio.js';
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
