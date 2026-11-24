import { validateProfile } from './controller-contract.js';

export class GameRegistry {
  constructor() { this.games = new Map(); this.current = null; this.version = 0; }
  register(game) {
    if (!game || typeof game.create !== 'function' || this.games.has(game.id)) throw new Error('Invalid or duplicate game registration.');
    const profile = validateProfile(game.profile);
    if (profile.id !== game.id) throw new Error('Game and profile ids must match.');
    this.games.set(game.id, { ...game, profile }); return this;
  }
  list() { return [...this.games.values()]; }
  async select(id, context) {
    const game = this.games.get(id); if (!game) throw new Error('Unknown game.');
    const version = ++this.version;
    this.current?.adapter.dispose(); this.current = null;
    const adapter = await game.create(context);
    if (version !== this.version) { adapter.dispose(); return null; }
    for (const method of ['mount', 'input', 'pause', 'reset', 'dispose']) {
      if (typeof adapter[method] !== 'function') { adapter.dispose?.(); throw new Error('Game adapter needs ' + method + '().'); }
    }
    await adapter.mount(context.container);
    if (version !== this.version) { adapter.dispose(); return null; }
    this.current = { game, adapter }; return this.current;
  }
  dispose() { ++this.version; this.current?.adapter.dispose(); this.current = null; }
}
