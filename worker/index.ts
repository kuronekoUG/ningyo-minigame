import { MAX_BODY, verify } from './verify.ts';

// Only what this worker touches, so the build needs no Cloudflare types.
type D1Result<T> = { results: T[] };
type D1Statement = {
  bind: (...values: unknown[]) => D1Statement;
  all: <T>() => Promise<D1Result<T>>;
  run: () => Promise<unknown>;
};
type Env = {
  DB: { prepare: (query: string) => D1Statement };
  ALLOWED_ORIGIN: string;
};
type Row = { name: string; score: number; eaten: number; created_at: number };

const TOP = 30;

function cors(origin: string) {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
  };
}
function json(body: unknown, status: number, origin: string) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      ...cors(origin),
    },
  });
}
// A log can only be banked once, so a good run cannot be sent again and again.
async function digest(seed: number, ticks: number, inputs: unknown) {
  const source = `${seed}:${ticks}:${JSON.stringify(inputs)}`;
  const bytes = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(source),
  );
  return Array.from(new Uint8Array(bytes))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

const worker = {
  async fetch(request: Request, env: Env) {
    const origin = env.ALLOWED_ORIGIN || '*';
    const url = new URL(request.url);
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors(origin) });
    }
    if (url.pathname !== '/scores')
      return json({ error: 'not found' }, 404, origin);

    if (request.method === 'GET') {
      try {
        const { results } = await env.DB.prepare(
          'SELECT name, score, eaten, created_at FROM scores ORDER BY score DESC, created_at ASC LIMIT ?',
        )
          .bind(TOP)
          .all<Row>();
        return json({ scores: results }, 200, origin);
      } catch {
        return json(
          { error: 'ランキングを読み込めませんでした。' },
          503,
          origin,
        );
      }
    }

    if (request.method !== 'POST')
      return json({ error: 'not allowed' }, 405, origin);

    const length = Number(request.headers.get('content-length') ?? 0);
    if (length > MAX_BODY)
      return json({ error: '送信内容が大きすぎます。' }, 413, origin);

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return json({ error: '入力内容を確認してください。' }, 400, origin);
    }

    const verdict = verify(body);
    if (!verdict.ok)
      return json({ error: verdict.error }, verdict.status, origin);

    const submission = body as { seed: number; ticks: number; inputs: unknown };
    const hash = await digest(
      submission.seed,
      submission.ticks,
      submission.inputs,
    );
    try {
      await env.DB.prepare(
        'INSERT INTO scores (id, name, score, eaten, created_at, run_hash) VALUES (?, ?, ?, ?, ?, ?)',
      )
        .bind(
          crypto.randomUUID(),
          verdict.name,
          verdict.score,
          verdict.eaten,
          Date.now(),
          hash,
        )
        .run();
    } catch {
      // the unique index on run_hash is what rejects a resent log
      return json({ error: 'この記録はすでに登録されています。' }, 409, origin);
    }
    const { results } = await env.DB.prepare(
      'SELECT name, score, eaten, created_at FROM scores ORDER BY score DESC, created_at ASC LIMIT ?',
    )
      .bind(TOP)
      .all<Row>();
    return json({ scores: results }, 201, origin);
  },
};

export default worker;
