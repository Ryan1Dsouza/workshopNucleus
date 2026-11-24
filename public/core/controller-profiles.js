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
