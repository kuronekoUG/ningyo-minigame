export const WIDTH = 480;
export const HEIGHT = 640;
export const PLAYER_Y = 524;
export type Mode = 'ready' | 'playing' | 'paused' | 'crashed' | 'over';
export type Item = {
  kind: 'rock' | 'snack';
  x: number;
  y: number;
  size: number;
  angle: number;
};
export type Game = {
  mode: Mode;
  x: number;
  score: number;
  time: number;
  spawn: number;
  items: Item[];
  pops: { x: number; y: number; life: number }[];
  eaten: number;
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
  };
}
export function startGame(): Game {
  return { ...newGame(), mode: 'playing' };
}

export function getScrollSpeed(time: number) {
  return 145 + Math.min(time * 7.2, 305);
}

export function getRockCount(time: number) {
  if (time < 14) return 1;
  if (time < 34) return 2;
  return 3;
}
export function stepGame(
  g: Game,
  dt: number,
  direction: number,
  target: number | null,
  random = Math.random,
) {
  if (g.mode !== 'playing') return { ate: false, hit: false };
  dt = Math.min(Math.max(dt, 0), 0.04);
  g.time += dt;
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
  g.spawn -= dt;
  if (g.spawn <= 0) {
    // More rocks appear later, but they are staggered so they never form a wall.
    const lanes = [0, 1, 2, 3, 4];
    for (let i = lanes.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [lanes[i], lanes[j]] = [lanes[j], lanes[i]];
    }
    const rockCount = getRockCount(g.time);
    for (const [index, lane] of lanes.slice(0, rockCount).entries()) {
      g.items.push({
        kind: 'rock',
        x: 48 + lane * 96,
        y: -78 - index * 145 - random() * 30,
        size: 72 + random() * 18,
        angle: (random() - 0.5) * 0.45,
      });
    }
    const snackLane = lanes[rockCount];
    g.items.push({
      kind: 'snack',
      x: 48 + snackLane * 96,
      y: -145 - random() * 34,
      size: 49,
      angle: (random() - 0.5) * 0.3,
    });
    g.spawn = Math.max(0.68, 1.28 - g.time * 0.01);
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
        g.mode = 'crashed';
        hit = true;
        break;
      }
      g.score += 10;
      g.eaten++;
      g.pops.push({ x: item.x, y: item.y, life: 1 });
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
  return { ate, hit };
}
