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

export async function fetchScores(signal?: AbortSignal) {
  const response = await fetch(SCORES_API, { signal });
  if (!response.ok) throw new Error('failed');
  const body = (await response.json()) as { scores?: Entry[] };
  return body.scores ?? [];
}

// The run itself goes with the score: the server plays it back and only keeps
// a score its own replay agrees with.
export async function submitScore(
  name: string,
  score: number,
  eaten: number,
  run: Replay,
) {
  const response = await fetch(SCORES_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, score, eaten, ...run }),
  });
  const body = (await response.json().catch(() => ({}))) as {
    scores?: Entry[];
    error?: string;
  };
  if (!response.ok) throw new Error(body.error ?? '登録できませんでした。');
  return body.scores ?? [];
}
