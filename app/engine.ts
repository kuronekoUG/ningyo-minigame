export const WIDTH = 480;
export const HEIGHT = 640;
export const PLAYER_Y = 524;
export const LANE_COUNT = 5;
// A chain survives this long between snacks, so dodging never kills it outright.
export const COMBO_WINDOW = 2.5;
export const MAX_MULTIPLIER = 5;
export const FEVER_COMBO = 16;
export const FEVER_DURATION = 4;
export type Mode = 'ready' | 'playing' | 'paused' | 'crashed' | 'over';
export type Item = {
  kind: 'rock' | 'snack';
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
// Snacks fill every lane the rocks left free, so early runs stay generous.
export function getSnackCount(time: number) {
  return LANE_COUNT - getRockCount(time);
}
// Every fourth snack in a chain is worth another multiple, up to five.
export function getMultiplier(combo: number) {
  return Math.min(MAX_MULTIPLIER, 1 + Math.floor(combo / 4));
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
    for (const [index, lane] of lanes.slice(0, rockCount).entries()) {
      g.items.push({
        kind: 'rock',
        x: 48 + lane * 96,
        y: -78 - index * 145 - random() * 30,
        size: 72 + random() * 18,
        angle: (random() - 0.5) * 0.45,
      });
    }
    for (const [index, snackLane] of lanes.slice(rockCount).entries()) {
      g.items.push({
        kind: 'snack',
        x: 48 + snackLane * 96,
        y: -128 - index * 105 - random() * 34,
        size: 49,
        angle: (random() - 0.5) * 0.3,
      });
    }
    g.spawn = getSpawnInterval(g.time) * (inFever ? 0.55 : 1);
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
      g.combo++;
      g.comboTimer = COMBO_WINDOW;
      const gained = 10 * (inFever ? MAX_MULTIPLIER : getMultiplier(g.combo));
      g.score += gained;
      g.eaten++;
      g.pops.push({ x: item.x, y: item.y, life: 1, text: `+${gained}` });
      item.y = 900;
      ate = true;
      if (!inFever && g.combo >= FEVER_COMBO) {
        g.fever = FEVER_DURATION;
        feverStarted = true;
      }
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
