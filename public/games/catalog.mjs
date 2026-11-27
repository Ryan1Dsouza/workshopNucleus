import { REMOTE_PROFILE, FRUIT_PROFILE, MARIO_KART_PROFILE } from '../core/controller-profiles.js';

// Add attendee games here. Every entry supplies a profile and the same adapter API.
export function registerGames(registry, features) {
  registry.register({ id:'remote', title:'Controller Lab', category:'INPUT LAB', art:'remote', badge:'Buttons + motion',
    description:'Test every button and wrist movement.', profile:REMOTE_PROFILE,
    create:async()=>new (await import('./controller-lab/adapter.mjs')).ControllerLab() });
  if(features.fruit) registry.register({ id:'fruit-ninja', title:'Fruit Ninja', category:'SLICE & SCORE', art:'fruit', badge:'Motion game',
    description:'Turn your wrist. Slice fruit. Beat your best.', profile:FRUIT_PROFILE,
    create:async context=>new (await import('./fruit-ninja/adapter.mjs')).FruitAdapter(context) });
  if(features.game) registry.register({ id:'kart-racing', title:'Mario Kart', category:'MUSHROOM CUP', art:'kart', badge:'3D · Character select',
    description:'Choose a driver and race with gyro or D-pad steering.', profile:MARIO_KART_PROFILE,
    create:async context=>new (await import('./mario-kart/adapter.mjs')).MarioKartAdapter(context) });
}
