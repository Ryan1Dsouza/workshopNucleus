// Working, small extension example. Add this entry in games/catalog.mjs to try it.
// Replace the counter with your own game while preserving this lifecycle/input API.
class ButtonCounter {
  constructor(context){this.context=context;this.value=0;this.paused=false;}
  async mount(container){
    this.root=document.createElement('div');this.root.className='input-lab';
    this.heading=document.createElement('h2');this.heading.className='extension-heading';this.heading.textContent='Your game starts here.';
    this.score=document.createElement('strong');this.score.className='extension-score';
    const help=document.createElement('p');help.textContent='A adds one. B subtracts one. The phone received this layout without rebuilding its app.';
    help.className='extension-help';this.root.append(this.heading,this.score,help);container.append(this.root);this.render();
  }
  render(){if(this.score)this.score.textContent=String(this.value);}
  input(slot,state){if(this.paused||!state.ready)return;if(state.pressedActions.increment)this.value++;if(state.pressedActions.decrement)this.value--;this.render();}
  pause(value=true){this.paused=value;this.context.onState?.({paused:value});}
  reset(){this.value=0;this.paused=false;this.render();}
  dispose(){this.root?.remove();this.root=null;}
}
export const BUTTON_COUNTER_GAME={id:'button-counter',title:'Button Counter',category:'YOUR FIRST ADAPTER',art:'remote',badge:'Extension template',description:'A tiny example for your next game.',
  profile:{id:'button-counter',title:'Button Counter',orientation:'landscape',motion:'none',instruction:'A adds one. B subtracts one. Build your own game around this adapter.',centerLabel:'Center motion',controls:[
    {id:'a',label:'Add one',action:'increment'},{id:'b',label:'Subtract',action:'decrement'},{id:'plus',label:'Pause',action:'pause'},{id:'home',label:'Games',action:'home'}]},create:context=>new ButtonCounter(context)};
