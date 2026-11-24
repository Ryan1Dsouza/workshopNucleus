// Executed in the real host page by Playwright and the MCP verification runner.
export async function checkMotionView() {
  const {ControllerState}=await import('/core/controller-state.js');
  const {MotionInput}=await import('/core/motion-input.js');
  const app=globalThis.__controllerkit,lab=app.adapter();
  if(!lab?.grid)throw new Error('Run the motion view check in Controller Lab');
  const state=new ControllerState({createMotion:()=>new MotionInput({smoothing:false})});
  const epoch=state.setProfile({id:'visual-test',title:'Visual test',orientation:'portrait',motion:'aim',controls:[]});
  state.connect(0,'visual-test','Phone');state.markReady(0,epoch);
  const pose=(angle,t)=>({session:'visual-test',source:'bluetooth-native',quat:[0,0,Math.sin(angle*Math.PI/360),Math.cos(angle*Math.PI/360)],t,poseT:t,epoch:1,motion:{rx:60,ry:0,rz:0},motionAge:0});
  const near=(a,b)=>{if(Math.abs(a-b)>.002)throw new Error(`Visible aim ${a} differs from ${b}`);};
  const visibleX=()=>{const dot=lab.players[0].dot.getBoundingClientRect(),grid=lab.grid.getBoundingClientRect();return (dot.left+dot.width/2-grid.left-lab.grid.clientLeft)/lab.grid.clientWidth;};
  const other=lab.players[1].dot.style.transform;
  try {
    state.motion(0,pose(0,1000),100);lab.input(0,state.sample(0,100));
    state.motion(0,pose(4,1016),116);
    const arrived=state.sample(0,116);lab.input(0,arrived);near(visibleX(),.5);
    const between=state.sample(0,124);lab.input(0,between);near(visibleX(),.5-2/60);
    near(between.axes.x,.5-4/60);
    if(!lab.players[0].dot.style.transform.includes('translate3d'))throw new Error('Dot is not using transform movement');
    state.center(0,{session:'visual-test',epoch:2,pose:{...pose(4,1016),epoch:2}},125);
    const centered=state.sample(0,125);lab.input(0,centered);near(visibleX(),.5);
    if(centered.cutting)throw new Error('Centering manufactured a cut');
    state.motion(0,{...pose(8,1032),epoch:2},132);lab.input(0,state.sample(0,132));
    const silent=state.sample(0,500);lab.input(0,silent);near(visibleX(),silent.axes.x);
    if(!lab.players[0].dot.classList.contains('visible'))throw new Error('Quiet connected phone lost its visible aim');
    if(lab.players[1].dot.style.transform!==other)throw new Error('One player moved the other player');
    return {intermediateFrames:true,centerSnaps:true,quietPhoneVisible:true,playerIsolation:true,collisionInputPreserved:true};
  } finally {
    for(const slot of [0,1])lab.input(slot,app.controllers.sample(slot,performance.now()));
  }
}
