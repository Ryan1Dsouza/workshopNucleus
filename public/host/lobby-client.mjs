import {SIGNAL_URL, staticSite} from './online-config.js';

export async function lobbyClient() {
  if (staticSite && !SIGNAL_URL) return new HostedLobby();
  const {io} = await import('/socket.io/socket.io.esm.min.js');
  const socket = io((SIGNAL_URL || location.origin).replace(/\/$/,'')+'/lobbies',{transports:['websocket'],autoConnect:false});
  return {
    get id(){return socket.id;}, get connected(){return socket.connected;},
    on:(event,fn)=>socket.on(event,fn), connect:()=>socket.connect(), retry:()=>socket.connect(),
    disconnect(){socket.removeAllListeners();socket.disconnect();},
    clock:()=>socket.timeout(5000).emitWithAck('clock'),
    command:req=>socket.timeout(5000).emitWithAck('lobby',req),
    signal:p=>socket.emit('signal',p)
  };
}

// Only lobby actions and WebRTC negotiation use this endpoint. The game owns its
// peer channel independently, including while a directory/room request is retried.
class HostedLobby {
  constructor() {
    this.secret = Array.from(crypto.getRandomValues(new Uint8Array(32)),b=>b.toString(16).padStart(2,'0')).join('');
    this.listeners = new Map();
    this.work = Promise.resolve();
    this.connected = false;
    this.closed = false;
    this.code = null;
    this.cursor = 0;
    this.signals = [];
    this.pagehide = event=>{if (!event.persisted) this.disconnect();};
  }
  on(event,fn) { this.listeners.set(event,fn); }
  notify(event,value) { this.listeners.get(event)?.(value); }
  clock() { return Promise.resolve(Date.now()+this.offset); }
  async post(body,keepalive=false) {
    const r = await fetch('/api/lobby/', {method:'POST',cache:'no-store',keepalive,
      headers:{'Content-Type':'application/json',Authorization:'Bearer '+this.secret},
      body:JSON.stringify(body),signal:AbortSignal.timeout(8000)});
    if (!r.ok) {
      const error=new Error('Lobby service is temporarily unavailable.');
      error.status=r.status;
      throw error;
    }
    return r.json();
  }
  resetRoom() {
    this.code=null;this.cursor=0;this.revision=0;this.previous=null;this.room=null;this.signals=[];
    clearTimeout(this.batch);this.batch=null;
  }
  accept(result, action) {
    if (result.error) return;
    this.id=result.id || this.id;
    if (!this.connected) {this.connected=true;this.notify('connect');}
    if (result.closed) {
      this.resetRoom();
      if (action!=='leave') this.notify('closed','The lobby has closed.');
    }
    if (result.directory) this.notify('directory',result.directory);
    if (!result.room) return;
    if(result.room.code===this.code && result.revision<this.revision)return;
    this.revision=result.revision;
    this.code=result.room.code;
    if(Array.isArray(result.iceServers))this.iceServers=result.iceServers;
    this.room=result.room;
    const signature=JSON.stringify(result.room);
    if (signature!==this.previous) {
      this.previous=signature;
      this.notify('room',result.room);
    }
    for (const packet of result.signals) this.notify('signal',packet);
    this.cursor=result.cursor;
  }
  request(req) {
    const run=async()=>{
      if (this.closed) return {error:'Left online play.'};
      const body={code:this.code,since:this.cursor,...req};
      if (!['poll','directory'].includes(body.action)) body.requestId=crypto.randomUUID();
      const start=Date.now();
      let result;
      try {result=await this.post(body);}
      catch (error) {
        if (!body.requestId || this.closed || error.status) throw error;
        result=await this.post(body);
      }
      if (this.closed) {
        if (result.room && ['create','join'].includes(body.action)) this.leaveBeacon(result.room.code);
        return {error:'Left online play.'};
      }
      if (Number.isFinite(result.time)) this.offset=result.time-(Date.now()+start)/2;
      if (this.failures) {this.failures=0;this.notify('available');this.flushSignals();}
      this.accept(result,body.action);
      return result;
    };
    const pending=this.work.then(run).catch(error=>{
      if (!this.closed) {
        this.failures=(this.failures||0)+1;
        this.quotaLimited=error.status===429;
        this.notify('connect_error',error);
      }
      throw error;
    });
    this.work=pending.catch(()=>{});
    return pending;
  }
  command(req) {
    return this.request(req).finally(()=>this.schedule(100));
  }
  signal(packet) {
    this.signals.push(packet);
    this.flushSignals();
  }
  flushSignals() {
    if (this.batch || !this.signals.length || this.failures || this.closed) return;
    this.batch=setTimeout(()=>{
      this.batch=null;
      const code=this.code, packets=this.signals.splice(0,16);
      void this.request({action:'signals',code,packets}).catch(()=>{
        if(this.code===code && !this.closed)this.signals.unshift(...packets);
      }).finally(()=>this.flushSignals());
    },40);
  }
  schedule(ms) {
    clearTimeout(this.timer);
    if (this.failures) ms=this.quotaLimited?60000:Math.min(60000,2500*2**Math.min(this.failures,5));
    if (!this.closed) this.timer=setTimeout(()=>this.poll(),ms*(0.9+Math.random()*0.2));
  }
  async poll() {
    try {await this.request({action:this.code?'poll':'directory'});}
    catch { /* request displayed the outage and scheduled backoff */ }
    const linking=this.room?.players.length>1 && !this.room.players.every(p=>p.linked);
    this.schedule(this.room?.match ? 5500 : linking ? 550 : this.code ? 1100 : 5000);
  }
  connect() {
    window.addEventListener('pagehide',this.pagehide);
    void this.poll();
  }
  retry() {clearTimeout(this.timer);void this.poll();}
  leaveBeacon(code) {
    void this.post({action:'leave',code,requestId:crypto.randomUUID()},true).catch(()=>{});
  }
  disconnect() {
    if (this.closed) return;
    this.closed=true;this.connected=false;
    window.removeEventListener('pagehide',this.pagehide);
    clearTimeout(this.timer);clearTimeout(this.batch);this.listeners.clear();
    if(this.code)this.leaveBeacon(this.code);
    this.resetRoom();
  }
}
