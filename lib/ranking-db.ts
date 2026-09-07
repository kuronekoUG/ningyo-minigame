import { env } from 'cloudflare:workers';

export type PublicRanking = {
  id: string;
  name: string;
  score: number;
  playedAt: string;
};

type ScoreRow = {
  id: string;
  name: string;
  score: number;
  created_at: number;
};

function getDatabase() {
  const database = (env as unknown as { DB?: D1Database }).DB;
  if (!database) throw new Error('D1 binding DB is unavailable');
  return database;
}

function toPublicRanking(row: ScoreRow): PublicRanking {
  return {
    id: row.id,
    name: row.name,
    score: row.score,
    playedAt: new Date(row.created_at).toISOString(),
  };
}

export async function listRankings(limit = 30) {
  const safeLimit = Math.max(1, Math.min(30, Math.trunc(limit)));
  const result = await getDatabase()
    .prepare(
      `SELECT id, name, score, created_at
       FROM scores
       ORDER BY score DESC, created_at ASC, id ASC
       LIMIT ?`,
    )
    .bind(safeLimit)
    .all<ScoreRow>();
  return result.results.map(toPublicRanking);
}

export async function createRanking(name: string, score: number) {
  const database = getDatabase();
  const id = crypto.randomUUID();
  const createdAt = Date.now();
  await database
    .prepare(
      'INSERT INTO scores (id, name, score, created_at) VALUES (?, ?, ?, ?)',
    )
    .bind(id, name, score, createdAt)
    .run();

  const positionResult = await database
    .prepare(
      `SELECT COUNT(*) + 1 AS position
       FROM scores
       WHERE score > ?
          OR (score = ? AND created_at < ?)
          OR (score = ? AND created_at = ? AND id < ?)`,
    )
    .bind(score, score, createdAt, score, createdAt, id)
    .first<{ position: number }>();

  return {
    rank: positionResult?.position ?? null,
    rankings: await listRankings(30),
  };
}
