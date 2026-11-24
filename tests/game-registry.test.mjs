import test from 'node:test';
import assert from 'node:assert/strict';
import { GameRegistry } from '../public/core/game-registry.js';
function game(id, events) {
  return { id, profile:{id, title:id, orientation:'portrait', motion:'none', controls:[]},
    create:() => ({mount:()=>events.push(id+':mount'), input(){}, pause(){}, reset(){}, dispose:()=>events.push(id+':dispose')}) };
}
test('game switching disposes the previous adapter and rejects invalid registration', async () => {
  const events = [], registry = new GameRegistry(); registry.register(game('one',events)).register(game('two',events));
  await registry.select('one', {container:{}}); await registry.select('two', {container:{}});
  assert.deepEqual(events, ['one:mount','one:dispose','two:mount']);
  assert.throws(() => registry.register(game('two',events)));
  registry.dispose(); assert.equal(events.at(-1), 'two:dispose');
});
test('a late asynchronous adapter cannot replace the newly selected game', async () => {
  const events = [], registry = new GameRegistry(); let finish;
  const delayed = game('slow',events); delayed.create = () => new Promise(resolve => { finish = () => resolve(game('slow',events).create()); });
  registry.register(delayed).register(game('fast',events));
  const first = registry.select('slow', {container:{}}); await registry.select('fast', {container:{}}); finish();
  assert.equal(await first, null); assert.equal(registry.current.game.id, 'fast');
  assert.equal(events.includes('slow:mount'), false); assert.equal(events.includes('slow:dispose'), true);
});
