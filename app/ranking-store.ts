export type RankingEntry = {
  id: string;
  name: string;
  score: number;
  playedAt: string;
};

type RankingResponse = {
  rankings: RankingEntry[];
  rank?: number | null;
  error?: string;
};

const PLAYER_NAME_KEY = 'shiruko-sand-swim-player-name';

async function readResponse(response: Response) {
  const body = (await response.json()) as RankingResponse;
  if (!response.ok) {
    throw new Error(body.error ?? 'ランキングの通信に失敗しました。');
  }
  return body;
}

export async function getRankings() {
  const response = await fetch('/api/rankings', {
    cache: 'no-store',
    headers: { Accept: 'application/json' },
  });
  return (await readResponse(response)).rankings;
}

export async function addRanking(name: string, score: number) {
  const cleanName = Array.from(name.normalize('NFKC').trim())
    .slice(0, 10)
    .join('');
  const response = await fetch('/api/rankings', {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ name: cleanName, score }),
  });
  const result = await readResponse(response);
  localStorage.setItem(PLAYER_NAME_KEY, cleanName);
  return {
    rankings: result.rankings,
    rank: result.rank ?? null,
  };
}

export function getSavedPlayerName() {
  try {
    return (localStorage.getItem(PLAYER_NAME_KEY) ?? '').slice(0, 10);
  } catch {
    return '';
  }
}
