export const WIDTH = 480;
export const HEIGHT = 640;
export const PLAYER_Y = 524;
export const LANE_COUNT = 5;
// A chain survives this long between snacks, so dodging never kills it outright.
export const COMBO_WINDOW = 2.5;
export const MAX_MULTIPLIER = 5;
export const FEVER_DURATION = 4.5;
// A scale is the rare pick-up that opens サクサクタイム, so it must not be
// common enough to feel routine.
export const SCALE_FIRST_AT = 13;
export const SCALE_INTERVAL = 21;
export type Mode = 'ready' | 'playing' | 'paused' | 'crashed' | 'over';
export type Item = {
  kind: 'rock' | 'snack' | 'scale';
  x: number;
  y: number;
  size: number;
  angle: number;
};
export type Pop = { x: number; y: number; life: number; text: string };
export type Game = {
  mode: Mode;
  x: number;
  score: number;
  time: number;
  spawn: number;
  items: Item[];
  pops: Pop[];
  eaten: number;
  combo: number;
  comboTimer: number;
  fever: number;
  scaleTimer: number;
};
export type Step = {
  ate: boolean;
  hit: boolean;
  feverStarted: boolean;
  feverEnded: boolean;
  comboLost: boolean;
};
const IDLE: Step = {
  ate: false,
  hit: false,
  feverStarted: false,
  feverEnded: false,
  comboLost: false,
};
export function newGame(): Game {
  return {
    mode: 'ready',
    x: 240,
    score: 0,
    time: 0,
    spawn: 0.35,
    items: [],
    pops: [],
    eaten: 0,
    combo: 0,
    comboTimer: 0,
    fever: 0,
    scaleTimer: SCALE_FIRST_AT,
  };
}
export function startGame(): Game {
  return { ...newGame(), mode: 'playing' };
}

export function getScrollSpeed(time: number) {
  const currentMaximum = 145 + Math.min(time * 7.2, 305);
  const lateStage = Math.min(Math.max(time - 45, 0) * 4, 70);
  const finalStage = Math.min(Math.max(time - 60, 0) * 5, 80);
  return currentMaximum + lateStage + finalStage;
}

export function getSpawnInterval(time: number) {
  const currentInterval = Math.max(0.68, 1.28 - time * 0.01);
  const lateStage = Math.min(Math.max(time - 45, 0) * 0.01, 0.12);
  const finalStage = Math.min(Math.max(time - 60, 0) * 0.01, 0.12);
  return Math.max(0.44, currentInterval - lateStage - finalStage);
}

export function getRockCount(time: number) {
  if (time < 14) return 1;
  if (time < 34) return 2;
  return 3;
}
export const SNACK_COUNT = 4;
// A steady four, however many rocks are out — so the crunching never thins.
export function getSnackCount() {
  return SNACK_COUNT;
}
// A snack sharing a lane with a rock has to clear it by this much to be worth
// going for.
const LANE_CLEARANCE = 132;
// サクサクタイム rains them. What matters is not how many are in a wave but how
// closely they follow each other down a single lane: at 16px a row across five
// lanes, whichever lane you sit in gets one every 80px of scroll.
export const FEVER_SNACKS = 20;
const FEVER_ROW = 16;
// Every fourth snack in a chain is worth another multiple, up to five.
export function getMultiplier(combo: number) {
  return Math.min(MAX_MULTIPLIER, 1 + Math.floor(combo / 4));
}
// Cycling the lanes laid the rain out in clean diagonals. Drawing them a bag
// of five at a time keeps exactly one per lane in every five rows — so the
// downpour stays as thick — while breaking the pattern.
function bagLanes(count: number, random: () => number) {
  const drawn: number[] = [];
  while (drawn.length < count) {
    const bag = [0, 1, 2, 3, 4];
    for (let i = bag.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [bag[i], bag[j]] = [bag[j], bag[i]];
    }
    drawn.push(...bag);
  }
  return drawn.slice(0, count);
}
// Enough to unsettle the rows without putting a snack out of reach.
function scatter(random: () => number) {
  return (random() - 0.5) * 22;
}
// The rain has to be falling the moment it starts. Waves spawned above the
// screen would take most of サクサクタイム just to arrive, so the column is
// filled from the player's row upward the instant the scale is taken.
function seedFever(g: Game, random: () => number) {
  const rows = Math.ceil(740 / FEVER_ROW);
  const lanes = bagLanes(rows, random);
  for (let row = 0; row < rows; row++) {
    g.items.push({
      kind: 'snack',
      x: 48 + lanes[row] * 96 + scatter(random),
      y: 420 - row * FEVER_ROW + scatter(random),
      size: 49,
      angle: (random() - 0.5) * 0.5,
    });
  }
}
export function stepGame(
  g: Game,
  dt: number,
  direction: number,
  target: number | null,
  random = Math.random,
): Step {
  if (g.mode !== 'playing') return { ...IDLE };
  dt = Math.min(Math.max(dt, 0), 0.04);
  g.time += dt;
  let feverStarted = false,
    feverEnded = false,
    comboLost = false;
  if (g.fever > 0) {
    g.fever = Math.max(0, g.fever - dt);
    // The chain is spent on the reward, so the next one starts from scratch.
    if (g.fever === 0) {
      // Faded rocks must not turn lethal under the player the instant it ends.
      g.items = g.items.filter((i) => i.kind !== 'rock');
      g.combo = 0;
      g.comboTimer = 0;
      feverEnded = true;
    }
  } else if (g.combo > 0) {
    g.comboTimer -= dt;
    if (g.comboTimer <= 0) {
      g.combo = 0;
      g.comboTimer = 0;
      comboLost = true;
    }
  }
  const move = 350 * dt;
  g.x = Math.max(
    36,
    Math.min(
      WIDTH - 36,
      g.x +
        (direction
          ? direction * move
          : target === null
            ? 0
            : Math.max(-move, Math.min(move, target - g.x))),
    ),
  );
  const speed = getScrollSpeed(g.time);
  const inFever = g.fever > 0;
  if (!inFever) g.scaleTimer -= dt;
  g.spawn -= dt;
  if (g.spawn <= 0) {
    // More rocks appear later, but they are staggered so they never form a wall.
    const lanes = [0, 1, 2, 3, 4];
    for (let i = lanes.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [lanes[i], lanes[j]] = [lanes[j], lanes[i]];
    }
    // サクサクタイム holds the rocks back and hands every lane to the snacks.
    const rockCount = inFever ? 0 : getRockCount(g.time);
    const rockRow = new Map<number, number>();
    for (const [index, lane] of lanes.slice(0, rockCount).entries()) {
      const y = -78 - index * 145 - random() * 30;
      rockRow.set(lane, y);
      g.items.push({
        kind: 'rock',
        x: 48 + lane * 96,
        y,
        size: 72 + random() * 18,
        angle: (random() - 0.5) * 0.45,
      });
    }
    // At most one scale is in play, and only once its timer has run down.
    const dropScale =
      !inFever && g.scaleTimer <= 0 && !g.items.some((i) => i.kind === 'scale');
    // Free lanes first, then doubling up on the rocks' lanes, so four snacks
    // still fit once the rocks have taken three of the five.
    const snackLanes = inFever
      ? bagLanes(FEVER_SNACKS, random)
      : [...lanes.slice(rockCount), ...lanes.slice(0, rockCount)].slice(
          0,
          getSnackCount(),
        );
    const row = inFever ? FEVER_ROW : 105;
    for (const [index, snackLane] of snackLanes.entries()) {
      let y = inFever
        ? -128 - index * row + scatter(random)
        : -128 - index * row - random() * 34;
      const rock = rockRow.get(snackLane);
      if (rock !== undefined && Math.abs(y - rock) < LANE_CLEARANCE) {
        y = rock - LANE_CLEARANCE;
      }
      const scale = dropScale && index === 0;
      g.items.push({
        kind: scale ? 'scale' : 'snack',
        x: 48 + snackLane * 96 + (inFever ? scatter(random) : 0),
        y,
        size: scale ? 46 : 49,
        angle: (random() - 0.5) * (inFever ? 0.5 : 0.3),
      });
    }
    if (dropScale) g.scaleTimer = SCALE_INTERVAL;
    // Waves follow each other by their own depth, so the rain is seamless at
    // any speed rather than piling up when the cave is slow.
    g.spawn = inFever
      ? (FEVER_SNACKS * FEVER_ROW) / speed
      : getSpawnInterval(g.time);
  }
  let ate = false,
    hit = false;
  for (const item of g.items) {
    item.y += speed * dt;
    const dx = item.x - g.x,
      dy = item.y - PLAYER_Y;
    // Deliberately forgiving hitboxes stay inside the painted sprites.
    const rx = item.kind === 'rock' ? item.size * 0.34 + 17 : 35;
    const ry = item.kind === 'rock' ? item.size * 0.29 + 21 : 39;
    if ((dx * dx) / (rx * rx) + (dy * dy) / (ry * ry) < 1) {
      if (item.kind === 'rock') {
        if (inFever) continue;
        g.mode = 'crashed';
        hit = true;
        break;
      }
      if (item.kind === 'scale') {
        g.fever = FEVER_DURATION;
        seedFever(g, random);
        g.pops.push({ x: item.x, y: item.y, life: 1.4, text: 'ウロコ！' });
        item.y = 900;
        feverStarted = true;
        continue;
      }
      g.combo++;
      g.comboTimer = COMBO_WINDOW;
      const gained = 10 * (inFever ? MAX_MULTIPLIER : getMultiplier(g.combo));
      g.score += gained;
      g.eaten++;
      g.pops.push({ x: item.x, y: item.y, life: 1, text: `+${gained}` });
      item.y = 900;
      ate = true;
    }
  }
  g.items = g.items.filter((i) => i.y < HEIGHT + 90);
  for (const p of g.pops) {
    p.life -= dt;
    p.y -= 35 * dt;
  }
  g.pops = g.pops.filter((p) => p.life > 0);
  return { ate, hit, feverStarted, feverEnded, comboLost };
}
