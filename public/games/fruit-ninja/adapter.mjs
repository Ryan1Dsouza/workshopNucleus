export class FruitAdapter {
  constructor(context){this.context=context;this.paused=true;this.snapshots=new Map();this.options={practice:false,splitScreen:false,durationSeconds:60};}
  async mount(container){
    this.frame=document.createElement('iframe');this.frame.title='Fruit Ninja game';this.frame.allow='autoplay';
    const ready=new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>{window.removeEventListener('message',this.readyListener);reject(new Error('Fruit Ninja did not finish loading.'));},15000);
      this.readyListener=event=>{
        if(event.source!==this.frame.contentWindow||event.origin!==location.origin)return;
        if(event.data?.type==='fruit-ready'){
          this.api=this.frame.contentWindow.__openwii;clearTimeout(timer);window.removeEventListener('message',this.readyListener);resolve();
        }else if(event.data?.type==='fruit-error'){clearTimeout(timer);window.removeEventListener('message',this.readyListener);reject(new Error(event.data.message));}
      };
      window.addEventListener('message',this.readyListener);
      this.frame.addEventListener('load',()=>{
        this.api=this.frame.contentWindow.__openwii;
        if(this.api?.setControllerState){clearTimeout(timer);window.removeEventListener('message',this.readyListener);resolve();}
      },{once:true});
    });
    this.frame.src='/games/fruit-ninja/index.html';container.append(this.frame);await ready;
    this.configure(this.context.roundOptions?.()||{});
    this.feedback=event=>{
      if(event.source!==this.frame.contentWindow||event.origin!==location.origin)return;
      if(event.data?.type==='game-feedback')this.context.feedback(event.data.data);
      else if(event.data?.type==='game-state'){this.paused=!!event.data.paused;this.context.onState?.({paused:this.paused});}
    };
    window.addEventListener('message',this.feedback);
  }
  input(slot,state){
    if(!this.api)return;
    this.snapshots.set(slot,state);
    const actions=state.pressedActions;
    const initialStart=actions.start&&this.api.game.state.phase==='idle';
    if(initialStart||actions.practice||actions.classic||actions.restart){
      const options=actions.classic?{practice:false}:actions.practice?{practice:true}:{};
      if(this.context.requestPlay)this.context.requestPlay(options);else this.reset(options);
    }
    this.api.setControllerState(slot,(initialStart||actions.practice||actions.classic||actions.restart)?{...state,motionPath:[],reset:true,cutting:false}:state);
  }
  pause(value=true){this.paused=value;if(!this.api)return;if(value)this.api.pauseGame();else this.api.resumeGame();this.context.onState?.({paused:value});}
  configure(options={}){
    const changed = options.splitScreen !== undefined && options.splitScreen !== this.options.splitScreen;
    for(const [key,value]of Object.entries(options))if(value!==undefined)this.options[key]=value;
    if(this.api){this.api.game.infiniteLives=this.options.practice;this.api.configureRound(this.options);}
    this.context.onOptions?.(this.options);
    if(changed)this.context.centerFruit?.(this.options.splitScreen);
  }
  reset(options={}){
    if(!this.api)return;this.configure({...this.context.roundOptions?.(),...options});this.context.centerFruit?.(this.options.splitScreen);this.api.audio.unlock();this.api.startGame();
    for(const [slot,state]of this.snapshots)this.api.setControllerState(slot,{...state,motionPath:[],axes:{...state.axes,x:.5,y:.5},displayAxes:{x:.5,y:.5},reset:true,cutting:false});
    this.paused=false;this.context.onState?.({paused:false});
    if(document.hasFocus()&&!document.hidden)this.frame.contentWindow.focus();
  }
  dispose(){if(this.feedback)window.removeEventListener('message',this.feedback);if(this.readyListener)window.removeEventListener('message',this.readyListener);if(this.frame){this.frame.remove();this.frame.src='about:blank';}this.api=null;}
}
