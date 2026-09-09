import type { Game, Item, Pop } from './engine';

// Keep drawing between simulation ticks without changing the replay or hitboxes.
export class RenderState {
  private x = 0;
  private time = 0;
  private items = new WeakMap<Item, number>();
  private pops = new WeakMap<Pop, number>();

  capture(game: Game) {
    this.x = game.x;
    this.time = game.time;
    for (const item of game.items) this.items.set(item, item.y);
    for (const pop of game.pops) this.pops.set(pop, pop.y);
  }

  playerX(game: Game, alpha: number) {
    return this.x + (game.x - this.x) * alpha;
  }

  renderTime(game: Game, alpha: number) {
    return this.time + (game.time - this.time) * alpha;
  }

  itemY(item: Item, alpha: number) {
    const previous = this.items.get(item) ?? item.y;
    return previous + (item.y - previous) * alpha;
  }

  popY(pop: Pop, alpha: number) {
    const previous = this.pops.get(pop) ?? pop.y;
    return previous + (pop.y - previous) * alpha;
  }
}
