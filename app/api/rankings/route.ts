import { createRanking, listRankings } from '../../../lib/ranking-db';

export const dynamic = 'force-dynamic';

function json(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  });
}

function cleanName(value: string) {
  return Array.from(value.normalize('NFKC').trim().replace(/\s+/g, ' '))
    .slice(0, 10)
    .join('');
}

export async function GET() {
  try {
    return json({ rankings: await listRankings(30) });
  } catch {
    return json({ error: 'ランキングを読み込めませんでした。' }, 503);
  }
}

export async function POST(request: Request) {
  try {
    const contentLength = Number(request.headers.get('content-length') ?? 0);
    if (contentLength > 1024)
      return json({ error: '送信内容が大きすぎます。' }, 413);

    const body: unknown = await request.json();
    if (!body || typeof body !== 'object') {
      return json({ error: '入力内容を確認してください。' }, 400);
    }
    const candidate = body as { name?: unknown; score?: unknown };
    const name =
      typeof candidate.name === 'string' ? cleanName(candidate.name) : '';
    const score = candidate.score;
    if (
      !name ||
      typeof score !== 'number' ||
      !Number.isInteger(score) ||
      score < 0 ||
      score > 999_990 ||
      score % 10 !== 0
    ) {
      return json({ error: '名前またはスコアが正しくありません。' }, 400);
    }

    return json(await createRanking(name, score), 201);
  } catch {
    return json({ error: 'スコアを登録できませんでした。' }, 503);
  }
}
