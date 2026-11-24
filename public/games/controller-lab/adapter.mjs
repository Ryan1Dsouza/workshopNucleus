import { BUTTON_IDS } from '../../core/controller-contract.js';
const faces={up:'↑',right:'→',down:'↓',left:'←',one:'1',two:'2',plus:'+',minus:'−',home:'⌂'};
export class ControllerLab {
  async mount(container) {
    this.root=document.createElement('div');this.root.className='input-lab';
    this.root.innerHTML='<div class="lab-title"><h2>See your input, live.</h2><span>Buttons and wrist motion</span></div><div class="lab-grid"><span class="lab-crosshair" aria-hidden="true"></span><span class="aim-dot p1" data-aim="0"></span><span class="aim-dot p2" data-aim="1"></span><span class="lab-grid-caption">Move your mouse, or center and turn your phone.</span></div>';
    for(const slot of [0,1]){
      const row=document.createElement('div');row.className='lab-player';row.dataset.slot=slot;
      const label=document.createElement('span');label.className='lab-player-label';label.textContent='P'+(slot+1);row.append(label);
      const controls=document.createElement('div');controls.className='lab-buttons';
      for(const id of BUTTON_IDS){const chip=document.createElement('span');chip.className='lab-chip';chip.dataset.button=id;chip.textContent=faces[id]||id.toUpperCase();controls.append(chip);}
      row.append(controls);const state=document.createElement('span');state.className='lab-state';state.textContent='idle';row.append(state);this.root.append(row);
    }
    container.append(this.root);
    this.grid=this.root.querySelector('.lab-grid');
    this.players=[0,1].map(slot=>{
      const row=this.root.querySelector('[data-slot="'+slot+'"]');
      return {chips:[...row.querySelectorAll('[data-button]')],state:row.querySelector('.lab-state'),dot:this.root.querySelector('[data-aim="'+slot+'"]'),position:{x:.5,y:.5}};
    });
    this.mouse={x:.5,y:.5,seen:false};
    this.onMouseMove=event=>{
      const box=this.grid.getBoundingClientRect();
      this.mouse={x:Math.max(0,Math.min(1,(event.clientX-box.left-this.grid.clientLeft)/this.grid.clientWidth)),y:Math.max(0,Math.min(1,(event.clientY-box.top-this.grid.clientTop)/this.grid.clientHeight)),seen:true};
    };
    this.grid.addEventListener('pointermove',this.onMouseMove,{passive:true});
    const resize=()=>{
      if(!this.root)return;
      this.width=this.grid.clientWidth;this.height=this.grid.clientHeight;
      for(const player of this.players)this.draw(player);
    };
    this.observer=new ResizeObserver(resize);this.observer.observe(this.grid);resize();
  }
  draw(player){
    const {x,y}=player.position;
    const transform=`translate3d(${x*this.width}px,${y*this.height}px,0) translate(-50%,-50%)`;
    if(transform!==player.transform){player.dot.style.transform=transform;player.transform=transform;}
  }
  input(slot,state){
    if(!this.root)return;
    const player=this.players[slot];if(!player)return;
    for(const chip of player.chips)chip.classList.toggle('active',!!state.buttons[chip.dataset.button]);
    const mousePreview=slot===0&&(!state.connected||state.session==='desktop');
    const label=state.connected?'live':mousePreview&&this.mouse.seen?'mouse':'idle';
    if(player.state.textContent!==label)player.state.textContent=label;
    const position=mousePreview?this.mouse:state.displayAxes||state.axes;
    player.position.x=position.x;player.position.y=position.y;
    this.draw(player);player.dot.classList.toggle('visible',state.connected||slot===0);
  }
  pause(){}
  reset(){for(const chip of this.root?.querySelectorAll('.lab-chip')||[])chip.classList.remove('active');}
  dispose(){this.observer?.disconnect();this.grid?.removeEventListener('pointermove',this.onMouseMove);this.root?.remove();this.root=null;this.players=null;this.grid=null;}
}
