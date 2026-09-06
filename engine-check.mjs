import assert from 'node:assert/strict';
import {
  getRockCount,
  getScrollSpeed,
  startGame,
  stepGame,
  PLAYER_Y,
} from './app/engine.ts';
let g = startGame();
g.spawn = 99;
g.items = [{ kind: 'snack', x: 240, y: PLAYER_Y, size: 49, angle: 0 }];
assert.equal(stepGame(g, 0.016, 0, null).ate, true);
assert.equal(g.score, 10);
stepGame(g, 0.016, 0, null);
assert.equal(g.score, 10);
g.items = [{ kind: 'rock', x: g.x, y: PLAYER_Y, size: 85, angle: 0 }];
assert.equal(stepGame(g, 0.016, 0, null).hit, true);
assert.equal(g.mode, 'crashed');
const frozen = JSON.stringify(g);
stepGame(g, 0.04, 1, null);
assert.equal(JSON.stringify(g), frozen);
g = startGame();
g.mode = 'paused';
const paused = JSON.stringify(g);
stepGame(g, 0.04, 1, null);
assert.equal(JSON.stringify(g), paused);
g = startGame();
g.spawn = 99;
for (let i = 0; i < 100; i++) stepGame(g, 0.04, -1, null);
assert.equal(g.x, 36);
for (let i = 0; i < 100; i++) stepGame(g, 0.04, 1, null);
assert.equal(g.x, 444);
g = startGame();
g.spawn = 0;
stepGame(g, 0.016, 0, null, () => 0.5);
assert.equal(g.items.length, 2);
assert.notEqual(g.items[0].x, g.items[1].x);
assert.ok(getScrollSpeed(45) > getScrollSpeed(5));
assert.equal(getRockCount(0), 1);
assert.equal(getRockCount(32), 3);
g = startGame();
g.time = 32;
g.spawn = 0;
stepGame(g, 0.016, 0, null, () => 0.5);
assert.equal(g.items.filter((item) => item.kind === 'rock').length, 3);
assert.equal(new Set(g.items.map((item) => item.x)).size, 4);
const y = g.items[0].y;
stepGame(g, 0.04, 0, null);
assert.ok(g.items[0].y > y);
assert.equal(startGame().score, 0);
console.log(
  'PASS: collection, collision, pause, bounds, speed increase, rock-count increase, clear lane, scroll, restart.',
);
