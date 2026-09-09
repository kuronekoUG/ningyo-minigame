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
  // wrangler secret put ADMIN_TOKEN — with none set, nothing can be deleted
  ADMIN_TOKEN?: string;
};
type Row = {
  id: string;
  name: string;
  score: number;
  eaten: number;
  created_at: number;
};
type Standing = Pick<Row, 'id' | 'score' | 'created_at'>;

const TOP = 30;

function cors(origin: string) {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
  };
}
function json(
  body: unknown,
  status: number,
  origin: string,
  cache = 'no-store',
) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': cache,
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

// Every checked run goes here, board or no board, and the run_hash key means
// a run already banked is quietly left alone rather than counted twice.
async function bank(env: Env, hash: string, eaten: number) {
  await env.DB.prepare(
    'INSERT OR IGNORE INTO runs (run_hash, eaten, created_at) VALUES (?, ?, ?)',
  )
    .bind(hash, eaten, Date.now())
    .run();
}
async function tally(env: Env) {
  const { results } = await env.DB.prepare(
    'SELECT COALESCE(SUM(eaten), 0) AS eaten FROM runs',
  ).all<{ eaten: number }>();
  return results[0]?.eaten ?? 0;
}
export async function rankOf(env: Env, standing: Standing) {
  const { results } = await env.DB.prepare(
    `SELECT COUNT(*) + 1 AS rank FROM scores
     WHERE score > ?
        OR (score = ? AND created_at < ?)
        OR (score = ? AND created_at = ? AND id < ?)`,
  )
    .bind(
      standing.score,
      standing.score,
      standing.created_at,
      standing.score,
      standing.created_at,
      standing.id,
    )
    .all<{ rank: number }>();
  return results[0]?.rank ?? 1;
}
async function readBody(request: Request, origin: string) {
  const length = Number(request.headers.get('content-length') ?? 0);
  if (length > MAX_BODY) {
    return { fault: json({ error: '送信内容が大きすぎます。' }, 413, origin) };
  }
  try {
    return { body: (await request.json()) as unknown };
  } catch {
    return {
      fault: json({ error: '入力内容を確認してください。' }, 400, origin),
    };
  }
}

const worker = {
  async fetch(request: Request, env: Env) {
    const origin = env.ALLOWED_ORIGIN || '*';
    const url = new URL(request.url);
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors(origin) });
    }
    // A name that gets past the filter still has to be removable without
    // opening the database by hand: DELETE /scores/<id> with the admin token.
    if (request.method === 'DELETE') {
      const id = url.pathname.startsWith('/scores/')
        ? url.pathname.slice('/scores/'.length)
        : '';
      const offered = (request.headers.get('Authorization') ?? '').replace(
        /^Bearer /,
        '',
      );
      if (!env.ADMIN_TOKEN || offered !== env.ADMIN_TOKEN) {
        return json({ error: 'not allowed' }, 401, origin);
      }
      if (!id) return json({ error: 'id required' }, 400, origin);
      try {
        await env.DB.prepare('DELETE FROM scores WHERE id = ?').bind(id).run();
        return json({ deleted: id }, 200, origin);
      } catch {
        return json({ error: 'could not delete' }, 503, origin);
      }
    }
    // Everyone's snacks in one number. Nearly every run ends without a name
    // being typed, so the tally cannot wait for the board: GET reads it, and
    // POST adds one finished run, checked the same way a score is. A minute of
    // cache keeps a reload off the database; a run of one's own comes back in
    // the POST, so the player still sees their own snacks land.
    if (url.pathname === '/scores/total') {
      if (request.method === 'GET') {
        try {
          return json(
            { eaten: await tally(env) },
            200,
            origin,
            'public, max-age=60',
          );
        } catch {
          return json({ error: '合計を読み込めませんでした。' }, 503, origin);
        }
      }
      if (request.method !== 'POST')
        return json({ error: 'not allowed' }, 405, origin);
      const read = await readBody(request, origin);
      if (read.fault) return read.fault;
      const verdict = verify(read.body, false);
      if (!verdict.ok)
        return json({ error: verdict.error }, verdict.status, origin);
      const run = read.body as { seed: number; ticks: number; inputs: unknown };
      try {
        await bank(
          env,
          await digest(run.seed, run.ticks, run.inputs),
          verdict.eaten,
        );
        return json({ eaten: await tally(env) }, 201, origin);
      } catch {
        return json({ error: '合計を更新できませんでした。' }, 503, origin);
      }
    }
    if (url.pathname !== '/scores')
      return json({ error: 'not found' }, 404, origin);

    if (request.method === 'GET') {
      try {
        const { results } = await env.DB.prepare(
          'SELECT id, name, score, eaten, created_at FROM scores ORDER BY score DESC, created_at ASC, id ASC LIMIT ?',
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

    const read = await readBody(request, origin);
    if (read.fault) return read.fault;
    const body = read.body;

    const verdict = verify(body);
    if (!verdict.ok)
      return json({ error: verdict.error }, verdict.status, origin);

    const submission = body as { seed: number; ticks: number; inputs: unknown };
    const hash = await digest(
      submission.seed,
      submission.ticks,
      submission.inputs,
    );
    // One line per player, as near as a browser can be asked: a better run
    // takes over the line already standing, a worse one leaves it be. A player
    // is a token the browser keeps, so clearing it or moving to another device
    // starts a new line — close enough, and it beats a name, which in this
    // game half the players type the same way.
    let kept = false;
    let placed: Standing;
    try {
      const standing = verdict.player
        ? (
            await env.DB.prepare(
              'SELECT id, score, created_at FROM scores WHERE player = ? ORDER BY score DESC LIMIT 1',
            )
              .bind(verdict.player)
              .all<Standing>()
          ).results[0]
        : undefined;
      if (standing && verdict.score <= standing.score) {
        kept = true;
        placed = standing;
      } else if (standing) {
        const createdAt = Date.now();
        await env.DB.prepare(
          'UPDATE scores SET name = ?, score = ?, eaten = ?, created_at = ?, run_hash = ? WHERE id = ?',
        )
          .bind(
            verdict.name,
            verdict.score,
            verdict.eaten,
            createdAt,
            hash,
            standing.id,
          )
          .run();
        placed = {
          id: standing.id,
          score: verdict.score,
          created_at: createdAt,
        };
      } else {
        const id = crypto.randomUUID();
        const createdAt = Date.now();
        await env.DB.prepare(
          'INSERT INTO scores (id, name, score, eaten, created_at, run_hash, player) VALUES (?, ?, ?, ?, ?, ?, ?)',
        )
          .bind(
            id,
            verdict.name,
            verdict.score,
            verdict.eaten,
            createdAt,
            hash,
            verdict.player || null,
          )
          .run();
        placed = { id, score: verdict.score, created_at: createdAt };
      }
    } catch {
      // the unique index on run_hash is what rejects a resent log
      return json({ error: 'この記録はすでに登録されています。' }, 409, origin);
    }
    // The run banked itself when it ended, but a lost request there should not
    // cost the tally a run the board has accepted.
    try {
      await bank(env, hash, verdict.eaten);
    } catch {}
    const { results } = await env.DB.prepare(
      'SELECT id, name, score, eaten, created_at FROM scores ORDER BY score DESC, created_at ASC, id ASC LIMIT ?',
    )
      .bind(TOP)
      .all<Row>();
    return json(
      { scores: results, kept, rank: await rankOf(env, placed) },
      201,
      origin,
    );
  },
};

export default worker;
