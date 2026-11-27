// Spawn randomness has its own stream so cosmetic debris and local critical
// rolls cannot change either laptop's future waves.
export function fruitMatch(game, slot, seed) {
  let randomState = seed >>> 0, damage = 0, theirDamage = 0;
  const cuts = [], seen = new Set();
  game.spawnRandom = () => {
    randomState = (Math.imul(randomState,1664525)+1013904223)>>>0;
    return randomState/4294967296;
  };
  const other = 1-slot;
  return {
    slot, remoteAim:null,
    cut(f,segment) {
      if (f.bomb && !game.infiniteLives) damage++;
      cuts.push([f.id,Math.atan2(segment.y2-segment.y1,segment.x2-segment.x1)]);
      if(cuts.length>32)cuts.shift();
    },
    snapshot() {
      const {cursor,score}=game.getPlayer(slot);
      return {cursor:cursor.active?[cursor.x/game.w+.5,.5-cursor.y/game.h]:null,
        cuts,score,damage,done:game.state.phase==='over'};
    },
    receive(packet,now) {
      if(!packet || !Number.isSafeInteger(packet.score) || packet.score<0 || !Array.isArray(packet.cuts))return;
      const player=game.getPlayer(other), aim=packet.cursor;
      if(Array.isArray(aim) && aim.length===2 && aim.every(Number.isFinite)){
        const x=Math.max(other*.5,Math.min((other+1)*.5,aim[0])),y=Math.max(0,Math.min(1,aim[1]));
        this.remoteAim={x,y};Object.assign(player.cursor,{x:(x-.5)*game.w,y:(.5-y)*game.h,active:true});
      }else{this.remoteAim=null;player.cursor.active=false;}
      player.score=packet.score;
      game.state.score=game.getPlayer(slot).score+player.score;
      if(Number.isSafeInteger(packet.damage))theirDamage=Math.max(theirDamage,Math.min(3,packet.damage));
      game.state.lives=Math.max(0,3-damage-theirDamage);
      for(const cut of packet.cuts.slice(-32)){
        if(!Array.isArray(cut) || !Number.isInteger(cut[0]) || !Number.isFinite(cut[1]) || seen.has(cut[0]))continue;
        const index=game.fruits.findIndex(f=>f.id===cut[0] && f.lane===other);
        if(index<0)continue;
        const [fruit]=game.fruits.splice(index,1);
        if(fruit.bomb)game.explode(fruit);else game.slice(fruit,cut[1],now);
        seen.add(cut[0]);
      }
      if(!game.state.lives || packet.done)game.end(now,game.state.lives?'timer':'bomb');
    },
  };
}
