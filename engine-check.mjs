import assert from 'node:assert/strict';
import {
  getRockCount,
  getSnackCount,
  getScrollSpeed,
  getSpawnInterval,
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
assert.equal(g.items.length, 5);
assert.equal(g.items.filter((i) => i.kind === 'snack').length, 4);
assert.notEqual(g.items[0].x, g.items[1].x);
assert.ok(getScrollSpeed(45) > getScrollSpeed(5));
assert.ok(getScrollSpeed(60) > getScrollSpeed(45));
assert.ok(getScrollSpeed(80) > getScrollSpeed(60));
assert.equal(getScrollSpeed(120), getScrollSpeed(80));
assert.ok(getSpawnInterval(60) < getSpawnInterval(45));
assert.ok(getSpawnInterval(80) < getSpawnInterval(60));
assert.equal(getSpawnInterval(120), getSpawnInterval(80));
assert.equal(getRockCount(0), 1);
assert.equal(getRockCount(32), 2);
assert.equal(getRockCount(60), 3);
assert.equal(getSnackCount(), 4);
g = startGame();
g.time = 60;
g.spawn = 0;
stepGame(g, 0.016, 0, null, () => 0.5);
assert.equal(g.items.filter((item) => item.kind === 'rock').length, 3);
assert.equal(new Set(g.items.map((item) => item.x)).size, 5);
// four snacks hold even once three rocks have taken lanes, and none of them
// is left sitting on a rock it shares a lane with
assert.equal(g.items.filter((item) => item.kind === 'snack').length, 4);
for (const snack of g.items.filter((item) => item.kind === 'snack')) {
  for (const rock of g.items.filter((item) => item.kind === 'rock')) {
    if (rock.x === snack.x) assert.ok(Math.abs(rock.y - snack.y) >= 132);
  }
}
const rockRows = g.items
  .filter((item) => item.kind === 'rock')
  .map((item) => item.y)
  .sort((a, b) => b - a);
assert.ok(
  rockRows.every(
    (row, index) => index === 0 || rockRows[index - 1] - row >= 145,
  ),
);
const y = g.items[0].y;
stepGame(g, 0.04, 0, null);
assert.ok(g.items[0].y > y);
assert.equal(startGame().score, 0);
console.log(
  'PASS: collection, collision, pause, bounds, speed increase, rock-count increase, clear lane, scroll, restart.',
);

// combo multiplier and サクサクタイム
{
  const {
    getMultiplier,
    COMBO_WINDOW,
    FEVER_DURATION,
    MAX_MULTIPLIER,
    SCALE_FIRST_AT,
    SCALE_INTERVAL,
  } = await import('./app/engine.ts');
  assert.equal(getMultiplier(0), 1);
  assert.equal(getMultiplier(3), 1);
  assert.equal(getMultiplier(4), 2);
  assert.equal(getMultiplier(8), 3);
  assert.equal(getMultiplier(99), MAX_MULTIPLIER);

  const eat = (game, kind = 'snack') => {
    game.items = [{ kind, x: game.x, y: PLAYER_Y, size: 49, angle: 0 }];
    return stepGame(game, 0.016, 0, null);
  };

  // a chain raises the multiplier, so the fourth snack pays double
  let c = startGame();
  c.spawn = 99;
  for (let i = 0; i < 3; i++) eat(c);
  assert.equal(c.score, 30);
  assert.equal(c.combo, 3);
  eat(c);
  assert.equal(c.score, 50);

  // the chain lapses after the window, and only then
  c = startGame();
  c.spawn = 99;
  eat(c);
  for (let t = 0; t < COMBO_WINDOW - 0.2; t += 0.04) stepGame(c, 0.04, 0, null);
  assert.equal(c.combo, 1);
  let lapsed = false;
  for (let t = 0; t < 0.5; t += 0.04) {
    lapsed = lapsed || stepGame(c, 0.04, 0, null).comboLost;
  }
  assert.equal(lapsed, true);
  assert.equal(c.combo, 0);

  // a long chain no longer opens サクサクタイム by itself
  c = startGame();
  c.spawn = 99;
  for (let i = 0; i < 40; i++) eat(c);
  assert.equal(c.fever, 0);

  // no scale is offered before its timer runs down
  c = startGame();
  c.spawn = 0;
  stepGame(c, 0.016, 0, null, () => 0.5);
  assert.equal(c.items.filter((i) => i.kind === 'scale').length, 0);

  // once it has, exactly one scale joins the wave
  c = startGame();
  c.time = 0;
  c.scaleTimer = 0;
  c.spawn = 0;
  stepGame(c, 0.016, 0, null, () => 0.5);
  assert.equal(c.items.filter((i) => i.kind === 'scale').length, 1);
  assert.equal(c.scaleTimer, SCALE_INTERVAL);
  // and no second one while it is still falling
  c.spawn = 0;
  c.scaleTimer = 0;
  stepGame(c, 0.016, 0, null, () => 0.5);
  assert.equal(c.items.filter((i) => i.kind === 'scale').length, 1);
  assert.ok(SCALE_FIRST_AT > 0);

  // picking one up opens サクサクタイム
  c = startGame();
  c.spawn = 99;
  assert.equal(eat(c, 'scale').feverStarted, true);
  assert.ok(c.fever > 0);
  assert.equal(c.items.filter((i) => i.kind === 'scale').length, 0);
  // the rain is already falling, not still on its way down
  const seeded = c.items.filter((i) => i.kind === 'snack');
  assert.ok(seeded.length >= 40);
  assert.ok(seeded.some((i) => i.y > 300));
  // the rain is scattered off the lane centres, so count lanes not exact x
  const lane = (i) => Math.round((i.x - 48) / 96);
  assert.equal(new Set(seeded.map(lane)).size, 5);
  // and it is scattered: no two rows share an exact x
  assert.ok(new Set(seeded.map((i) => i.x)).size > 20);

  // rocks stop spawning and stop hurting while it lasts
  c.spawn = 0;
  stepGame(c, 0.016, 0, null, () => 0.5);
  assert.equal(c.items.filter((i) => i.kind === 'rock').length, 0);
  assert.ok(c.items.filter((i) => i.kind === 'snack').length >= 20);
  c.items = [{ kind: 'rock', x: c.x, y: PLAYER_Y, size: 85, angle: 0 }];
  assert.equal(stepGame(c, 0.016, 0, null).hit, false);
  assert.equal(c.mode, 'playing');

  // every snack pays the top rate during it
  const before = c.score;
  eat(c);
  assert.equal(c.score - before, 10 * MAX_MULTIPLIER);

  // leftover rocks are swept away rather than turning lethal on the spot
  c.items.push({ kind: 'rock', x: c.x, y: PLAYER_Y - 10, size: 85, angle: 0 });
  let ended = false;
  for (let t = 0; t < FEVER_DURATION + 0.2; t += 0.04) {
    ended = ended || stepGame(c, 0.04, 0, null).feverEnded;
  }
  assert.equal(ended, true);
  assert.equal(c.fever, 0);
  assert.equal(c.combo, 0);
  assert.equal(c.items.filter((i) => i.kind === 'rock').length, 0);

  // and rocks are lethal again once it is over
  c.items = [{ kind: 'rock', x: c.x, y: PLAYER_Y, size: 85, angle: 0 }];
  assert.equal(stepGame(c, 0.016, 0, null).hit, true);
}
console.log(
  'PASS: combo multiplier, chain lapse, scale drop rate, サクサクタイム via scale.',
);
