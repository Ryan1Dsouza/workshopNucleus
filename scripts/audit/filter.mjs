import { OneEuroFilter } from '../../public/core/one-euro.js';
import { fileURLToPath } from 'node:url';
const rms=values=>Math.sqrt(values.reduce((sum,v)=>sum+v*v,0)/values.length);
export function benchmark() {
  return [30,60,120].map(hz=>{
    const filter=new OneEuroFilter(), raw=[],smooth=[],count=hz*6;
    for(let n=0;n<count;n++){
      const t=n/hz,value=.15*Math.sin(2*Math.PI*11*t)+.07*Math.sin(2*Math.PI*7*t+.6);
      const f=filter.filter(value,t);if(n>hz){raw.push(value);smooth.push(f);}
    }
    filter.reset();const values=[],truth=[];
    for(let n=0;n<hz*6;n++){const t=n/hz,v=14*Math.sin(2*Math.PI*1.5*t);truth.push(v);values.push(filter.filter(v,t));}
    const error=rms(values.slice(hz).map((v,i)=>v-truth[i+hz]));
    let best={lagMs:0,error:Infinity};
    // Interpolate analytic truth so sub-frame latency can be estimated. This
    // is an algorithm simulation, not physical sensor or network latency.
    for(let lag=0;lag<=80;lag++){
      const e=rms(values.slice(hz).map((v,i)=>v-14*Math.sin(2*Math.PI*1.5*((i+hz)/hz-lag/1000))));
      if(e<best.error)best={lagMs:lag,error:e};
    }
    return {hz,rawJitterRmsDegrees:rms(raw),filteredJitterRmsDegrees:rms(smooth),jitterReductionPercent:100*(1-rms(smooth)/rms(raw)),fastSwingRmsErrorDegrees:error,estimatedFilterLagMs:best.lagMs};
  });
}
if(process.argv[1]===fileURLToPath(import.meta.url))console.log(JSON.stringify({parameters:{minCutoff:8,beta:.2,derivativeCutoff:1},results:benchmark(),note:'Deterministic simulated angles; does not measure a physical phone.'},null,2));
