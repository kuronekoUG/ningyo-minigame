import assert from 'node:assert/strict';
import {
  startGame,
  stepGame,
  makeRandom,
  replay,
  STEP,
} from '../app/engine.ts';
import { RenderState } from '../app/render-state.ts';

// High-refresh displays must move on frames that have no simulation tick.
for (const hz of [60, 90, 120, 144]) {
  const game = startGame();
  game.spawn = 99;
  const render = new RenderState();
  render.capture(game);
  let carry = 0;
  for (let frame = 0; frame < hz / 4; frame++) {
    carry += 1 / hz;
    while (carry >= STEP) {
      render.capture(game);
      stepGame(game, STEP, 1, null);
      carry -= STEP;
    }
    const x = render.playerX(game, carry / STEP);
    const expected = 240 + 350 * Math.max(0, (frame + 1) / hz - STEP);
    assert.ok(Math.abs(x - expected) < 1e-9, `${hz} Hz frame ${frame}`);
  }
}

// Rendering must never modify the deterministic state sent to the ranking.
for (const seed of [1, 73, 456]) {
  const game = startGame();
  const random = makeRandom(seed);
  const render = new RenderState();
  let ticks = 0;
  while (game.mode === 'playing' && ticks < 3600) {
    render.capture(game);
    stepGame(game, STEP, 0, null, random);
    ticks++;
    const before = JSON.stringify(game);
    for (const alpha of [0, 0.25, 0.75, 1]) {
      render.playerX(game, alpha);
      render.renderTime(game, alpha);
      for (const item of game.items) render.itemY(item, alpha);
      for (const pop of game.pops) render.popY(pop, alpha);
    }
    assert.equal(JSON.stringify(game), before);
  }
  const checked = replay({ seed, ticks, inputs: [] });
  assert.equal(checked.score, game.score);
  assert.equal(checked.eaten, game.eaten);
  assert.equal(checked.time, game.time);
  assert.equal(checked.crashed, game.mode === 'crashed');
}

// Existing items interpolate; freshly spawned items have no stale position.
const game = startGame();
const render = new RenderState();
const item = { kind: 'rock', x: 48, y: 10, size: 85, angle: 0 };
const pop = { x: 100, y: 200, life: 1, text: '+10' };
game.items.push(item);
game.pops.push(pop);
render.capture(game);
item.y = 20;
pop.y = 190;
assert.equal(render.itemY(item, 0.5), 15);
assert.equal(render.popY(pop, 0.5), 195);
assert.equal(render.itemY({ ...item, y: -78 }, 0.5), -78);
render.capture(game);
assert.equal(render.playerX(game, 0), game.x);
assert.equal(render.itemY(item, 0), item.y);
console.log(
  'PASS: smooth 60/90/120/144 Hz motion, replay parity, item/pop interpolation, snapshot reset.',
);
