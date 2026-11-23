// One Euro adaptive low-pass filter. Algorithm: Casiez, Roussel & Vogel,
// CHI 2012, https://gery.casiez.net/1euro/ . Parameters here use degrees.
// This implementation advances only on measured samples, never display frames.
export class OneEuroFilter {
  constructor({ minCutoff=8, beta=.2, derivativeCutoff=1 }={}) {
    if(!(minCutoff>0 && beta>=0 && derivativeCutoff>0))throw new RangeError('Invalid filter parameters');
    Object.assign(this,{minCutoff,beta,derivativeCutoff});this.reset();
  }
  reset(value=null, time=null) { this.value=value;this.raw=value;this.time=time;this.derivative=0; }
  filter(value,time) {
    if(!Number.isFinite(value)||!Number.isFinite(time))return this.value;
    if(this.time===null || this.value===null || time-this.time> .25) {this.reset(value,time);return value;}
    const dt=time-this.time;if(dt<=0)return this.value;
    const alpha=cutoff=>1/(1+1/(2*Math.PI*cutoff*dt));
    this.derivative+=alpha(this.derivativeCutoff)*((value-this.raw)/dt-this.derivative);
    this.value+=alpha(this.minCutoff+this.beta*Math.abs(this.derivative))*(value-this.value);
    this.raw=value;this.time=time;return this.value;
  }
}
