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

// A list of what a name may contain rather than what it may not. Anything
// outside this is refused, which takes care of zero-width joiners, direction
// overrides and stacked combining marks — the characters used to break a
// list's layout — without having to name them.
const NAME_SHAPE =
  /^[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}a-zA-Z0-9ー〜・_\-!?%&+.,'*(): ]+$/u;
// Only the plainest slurs; a list can never be complete, so this is a first
// pass and not the whole answer.
const BLOCKED = [
  'fuck',
  'shit',
  'bitch',
  'cunt',
  'nigger',
  'faggot',
  'rape',
  'しね',
  '死ね',
  'ころす',
  '殺す',
  'きちがい',
  'basi',
];
export function nameProblem(name: string) {
  if (!name) return '名前を入力してください。';
  if (!NAME_SHAPE.test(name)) return 'その名前は使えない文字を含んでいます。';
  const flat = name.toLowerCase().replace(/[\s_\-・]/g, '');
  if (BLOCKED.some((word) => flat.includes(word))) {
    return 'その名前は使えません。';
  }
  return '';
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
  const problem = nameProblem(name);
  if (problem) return fail(400, problem);

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
