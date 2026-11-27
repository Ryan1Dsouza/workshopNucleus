import {PerspectiveCamera} from 'three';
import {rivalVisible} from './rival-visibility.js';
import {chasePose} from './visual-frame.js';

// All views share one simulation, scene, canvas and set of GPU assets.
export class LocalViews {
  constructor(names, container) {
    this.container=container;
    this.views=names.map(name=>{
      const label=document.createElement('div'), title=document.createElement('strong'), stats=document.createElement('span');
      title.textContent=name; label.append(title,stats); container.append(label);
      return {camera:new PerspectiveCamera(59,1,.2,340),label,stats};
    });
    document.body.classList.add('local-split');
  }
  draw(renderer,scene,race,karts,width,height) {
    const count=this.views.length, columns=width>=height ? Math.ceil(Math.sqrt(count*width/height*.78)) : Math.ceil(Math.sqrt(count*.65));
    const cols=Math.min(count,columns), rows=Math.ceil(count/cols);
    const standings=race.standings;
    renderer.setScissorTest(true);
    for(const [i,{camera,label,stats}] of this.views.entries()){
      const row=Math.floor(i/cols), col=i%cols, inRow=Math.min(cols,count-row*cols);
      const x=Math.round(col*width/inRow), top=Math.round(row*height/rows);
      const w=Math.round((col+1)*width/inRow)-x, h=Math.round((row+1)*height/rows)-top;
      const r=race.racers[i], {eye,aim,up}=chasePose(r,karts[i].pose);
      camera.position.set(eye.x,eye.y,eye.z); camera.up.set(up.x,up.y,up.z); camera.lookAt(aim.x,aim.y,aim.z);
      if(camera.aspect!==w/h){camera.aspect=w/h;camera.updateProjectionMatrix();}
      renderer.setViewport(x,height-top-h,w,h);renderer.setScissor(x,height-top-h,w,h);
      for(const [j,k] of karts.entries())k.root.visible=j===i || rivalVisible(k.model,camera);
      renderer.render(scene,camera);
      if(this.width!==width || this.height!==height){
        Object.assign(label.style,{left:x+'px',top:top+'px',width:w+'px',height:h+'px'});
      }
      const text=r.finishTime!==null?'Finished · #'+(standings.indexOf(r)+1):
        '#'+(standings.indexOf(r)+1)+' · Lap '+r.lap+'/'+race.laps+(r.item?' · '+r.item:r.roulette>0?' · Roulette':'');
      if(stats.textContent!==text)stats.textContent=text;
    }
    for(const k of karts)k.root.visible=true;
    this.width=width;this.height=height;
    renderer.setScissorTest(false);renderer.setViewport(0,0,width,height);
  }
  close(){document.body.classList.remove('local-split');this.container.replaceChildren();}
}
