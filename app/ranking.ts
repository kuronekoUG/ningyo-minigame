import type { Replay } from './engine.ts';

// Set at build time; with no endpoint configured the game simply has no
// ranking and never mentions one.
export const SCORES_API = process.env.NEXT_PUBLIC_SCORES_API ?? '';
export const NAME_LENGTH = 10;

export type Entry = {
  id: string;
  name: string;
  score: number;
  eaten: number;
  created_at: number;
};

// How many places the board shows; the server hands back more than this.
export const PLACES = 10;

const PLAYER_KEY = 'shirukosanpo.player';
let player = '';
// One line on the board per player, as near as a browser can be asked. This is
// a random token kept beside the best score, not a name and not anything about
// who is holding the phone — clearing site data or picking up another device
// simply starts a new one. Storage can refuse outright, and then the token
// lasts as long as the tab, which still holds for an evening's play.
export function playerToken() {
  if (player) return player;
  try {
    const stored = localStorage.getItem(PLAYER_KEY);
    if (stored && /^[a-z0-9-]{8,64}$/i.test(stored)) return (player = stored);
  } catch {}
  player =
    crypto.randomUUID?.() ??
    `p-${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
  try {
    localStorage.setItem(PLAYER_KEY, player);
  } catch {}
  return player;
}

// How many しるこサンド everyone has collected between them, across every
// run the server has checked.
export async function fetchTotal(signal?: AbortSignal) {
  const response = await fetch(`${SCORES_API}/total`, { signal });
  if (!response.ok) throw new Error('failed');
  const body = (await response.json()) as { eaten?: number };
  return typeof body.eaten === 'number' ? body.eaten : 0;
}

// A finished run counts whether or not a name is ever typed for it — most of
// them never are. The server replays this one too, and answers with the tally
// the run has just joined.
export async function bankRun(score: number, eaten: number, run: Replay) {
  const response = await fetch(`${SCORES_API}/total`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ score, eaten, ...run }),
  });
  if (!response.ok) throw new Error('failed');
  const body = (await response.json()) as { eaten?: number };
  return typeof body.eaten === 'number' ? body.eaten : 0;
}

export async function fetchScores(signal?: AbortSignal) {
  const response = await fetch(SCORES_API, { signal });
  if (!response.ok) throw new Error('failed');
  const body = (await response.json()) as { scores?: Entry[] };
  return body.scores ?? [];
}

// The run itself goes with the score: the server plays it back and only keeps
// a score its own replay agrees with. `kept` comes back true when the player
// already had a better line and it was left where it was.
export async function submitScore(
  name: string,
  score: number,
  eaten: number,
  run: Replay,
) {
  const response = await fetch(SCORES_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name,
      score,
      eaten,
      player: playerToken(),
      ...run,
    }),
  });
  const body = (await response.json().catch(() => ({}))) as {
    scores?: Entry[];
    kept?: boolean;
    rank?: number;
    error?: string;
  };
  if (!response.ok) throw new Error(body.error ?? '登録できませんでした。');
  if (!Number.isInteger(body.rank) || (body.rank as number) < 1) {
    throw new Error('順位を取得できませんでした。');
  }
  return {
    scores: body.scores ?? [],
    kept: body.kept === true,
    rank: body.rank as number,
  };
}
