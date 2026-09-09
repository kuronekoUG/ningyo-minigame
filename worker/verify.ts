import { replay, type InputEvent, type Replay } from '../app/engine.ts';

// Limits chosen from measured runs: a real one logs a few dozen events and
// weighs well under a kilobyte; a finger that never stops moving reached 6.7KB
// over twenty runs, and one change on every tick of a four-minute run would
// still fit inside these.
export const MAX_EVENTS = 20000;
export const MAX_TICKS = 60 * 300;
export const MAX_BODY = 256 * 1024;
export const NAME_LENGTH = 10;

export type Submission = {
  name: string;
  score: number;
  eaten: number;
} & Replay;

export type Verdict =
  | { ok: true; name: string; score: number; eaten: number; hash: string }
  | { ok: false; status: number; error: string };

export function cleanName(value: string) {
  return Array.from(value.normalize('NFKC').trim().replace(/\s+/g, ' '))
    .slice(0, NAME_LENGTH)
    .join('');
}

function isInputEvent(value: unknown): value is InputEvent {
  if (!Array.isArray(value) || value.length !== 3) return false;
  const [tick, direction, target] = value as unknown[];
  return (
    Number.isInteger(tick) &&
    (tick as number) >= 0 &&
    (direction === -1 || direction === 0 || direction === 1) &&
    (target === null ||
      (Number.isInteger(target) && Math.abs(target as number) <= 4000))
  );
}

// The score is not taken on trust: the run is played again here from the seed
// and the inputs, and only a score the replay also arrives at is accepted.
export function verify(body: unknown): Verdict {
  const fail = (status: number, error: string): Verdict => ({
    ok: false,
    status,
    error,
  });
  if (!body || typeof body !== 'object')
    return fail(400, '入力内容を確認してください。');
  const s = body as Partial<Submission>;

  const name = typeof s.name === 'string' ? cleanName(s.name) : '';
  if (!name) return fail(400, '名前を入力してください。');

  if (!Number.isInteger(s.score) || (s.score as number) < 0) {
    return fail(400, 'スコアが正しくありません。');
  }
  if (!Number.isInteger(s.eaten) || (s.eaten as number) < 0) {
    return fail(400, '記録が正しくありません。');
  }
  if (
    !Number.isInteger(s.seed) ||
    (s.seed as number) < 0 ||
    (s.seed as number) > 0xffffffff
  ) {
    return fail(400, '記録が正しくありません。');
  }
  if (
    !Number.isInteger(s.ticks) ||
    (s.ticks as number) <= 0 ||
    (s.ticks as number) > MAX_TICKS
  ) {
    return fail(400, '記録が正しくありません。');
  }
  if (!Array.isArray(s.inputs) || s.inputs.length > MAX_EVENTS) {
    return fail(400, '記録が正しくありません。');
  }
  let previousTick = -1;
  for (const event of s.inputs) {
    if (!isInputEvent(event)) return fail(400, '記録が正しくありません。');
    if (event[0] <= previousTick) return fail(400, '記録が正しくありません。');
    if (event[0] >= (s.ticks as number))
      return fail(400, '記録が正しくありません。');
    previousTick = event[0];
  }

  const run = replay({
    seed: s.seed as number,
    ticks: s.ticks as number,
    inputs: s.inputs as InputEvent[],
  });
  if (!run.crashed) return fail(422, '記録が途中で終わっています。');
  if (run.score !== s.score || run.eaten !== s.eaten) {
    return fail(422, '記録とスコアが一致しません。');
  }
  return { ok: true, name, score: run.score, eaten: run.eaten, hash: '' };
}
