import { BUTTON_IDS } from './controller-contract.js';

export const REMOTE_PROFILE = Object.freeze({ id: 'remote', title: 'Controller Lab', orientation: 'portrait', motion: 'aim',
  instruction: 'Press a button or turn your wrist. Your input appears on the laptop.', centerLabel: 'Center motion',
  controls: BUTTON_IDS.map(id => ({ id, label: ({ one:'1', two:'2', plus:'Plus', minus:'Minus', home:'Home' })[id] || id.toUpperCase(), action: id })) });

export const FRUIT_PROFILE = Object.freeze({ id: 'fruit-ninja', title: 'Fruit Ninja', orientation: 'portrait', motion: 'aim',
  instruction: 'Center your aim, then sweep your wrist to slice. A starts the first round. Space plays again.', centerLabel: 'Center aim', controls: [
    { id:'a', label:'Play', action:'start' }, { id:'b', label:'Practice', action:'practice' },
    { id:'one', label:'Classic', action:'classic' }, { id:'two', label:'Restart', action:'restart' },
    { id:'plus', label:'Pause', action:'pause' }, { id:'minus', label:'Restart', action:'restart' }, { id:'home', label:'Games', action:'home' }
  ] });

export const RACING_PROFILE = Object.freeze({ id: 'kart-racing', title: 'Pocket Circuit', orientation: 'landscape', motion: 'steer',
  instruction: 'Hold sideways and center steering. Tilt to turn; hold A to accelerate, B to brake.', centerLabel: 'Center steering', controls: [
    { id:'left', label:'Steer left', action:'steer-left' }, { id:'right', label:'Steer right', action:'steer-right' },
    { id:'up', label:'Accelerate', action:'accelerate' }, { id:'down', label:'Brake', action:'brake' },
    { id:'a', label:'Accelerate', action:'accelerate' }, { id:'b', label:'Brake', action:'brake' },
    { id:'one', label:'Restart', action:'restart' }, { id:'two', label:'Restart', action:'restart' },
    { id:'plus', label:'Pause', action:'pause' }, { id:'minus', label:'Restart', action:'restart' }, { id:'home', label:'Games', action:'home' }
  ] });

export const MARIO_KART_PROFILE = Object.freeze({ id: 'kart-racing', title: 'Mario Kart', orientation: 'landscape', motion: 'none',
  instruction: 'Choose a driver with the D-pad. Press A to confirm, then A again to race. Use − to switch steering.', centerLabel: 'Center steering',
  controls: [
    ...['left','right','up','down'].map(id => ({id, label:id, action:id})),
    {id:'a',label:'Confirm',action:'confirm'}, {id:'two',label:'OK',action:'confirm'},
    {id:'b',label:'Back',action:'back'}, {id:'one',label:'Back',action:'back'},
    {id:'minus',label:'Steering',action:'steering-mode'}, {id:'home',label:'Games',action:'home'}
  ] });

export function kartRaceProfile(mode) {
  const gyro = mode === 'gyro';
  return {...MARIO_KART_PROFILE, layout:gyro ? 'kart-gyro' : 'kart-dpad', motion:gyro ? 'steer' : 'none',
    instruction:gyro ? 'Tilt to steer. Hold Drift through a turn and release for a mini-turbo.' : 'Use left and right to steer. Hold Drift through a turn and release for a mini-turbo.',
    controls:[
      {id:'up',label:'Accelerate',action:'accelerate'}, {id:'down',label:'Brake',action:'brake'},
      {id:'left',label:'Left',action:gyro?'left':'steer-left'}, {id:'right',label:gyro?'Use item':'Right',action:gyro?'item':'steer-right'},
      {id:'a',label:'Drift',action:'drift'}, {id:'b',label:gyro?'Accelerate':'Use item',action:gyro?'accelerate':'item'},
      {id:'one',label:'Brake',action:'brake'}, {id:'two',label:'Accelerate',action:'accelerate'},
      {id:'plus',label:'Pause',action:'pause'}, {id:'home',label:'Games',action:'home'},
      ...(gyro?[{id:'minus',label:'Recenter',action:'recenter'}]:[])
    ]};
}
