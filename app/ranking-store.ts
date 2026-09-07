export type RankingEntry = {
  id: string;
  name: string;
  score: number;
  playedAt: string;
};

const RANKING_KEY = 'shiruko-sand-swim-ranking-v1';
const PLAYER_NAME_KEY = 'shiruko-sand-swim-player-name';

export function getRankings(): RankingEntry[] {
  try {
    const value: unknown = JSON.parse(
      localStorage.getItem(RANKING_KEY) ?? '[]',
    );
    if (!Array.isArray(value)) return [];
    return value
      .flatMap((entry): RankingEntry[] => {
        if (!entry || typeof entry !== 'object') return [];
        const candidate = entry as Partial<RankingEntry>;
        if (
          typeof candidate.id !== 'string' ||
          !Number.isFinite(candidate.score) ||
          typeof candidate.playedAt !== 'string'
        ) {
          return [];
        }
        return [
          {
            id: candidate.id,
            name:
              typeof candidate.name === 'string' && candidate.name.trim()
                ? candidate.name.trim().slice(0, 10)
                : 'ななし',
            score: Number(candidate.score),
            playedAt: candidate.playedAt,
          },
        ];
      })
      .sort((a, b) => b.score - a.score || a.playedAt.localeCompare(b.playedAt))
      .slice(0, 30);
  } catch {
    return [];
  }
}

export function addRanking(name: string, score: number) {
  const cleanName = name.trim().slice(0, 10);
  const entry: RankingEntry = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    name: cleanName,
    score,
    playedAt: new Date().toISOString(),
  };
  const all = [...getRankings(), entry].sort(
    (a, b) => b.score - a.score || a.playedAt.localeCompare(b.playedAt),
  );
  const position = all.findIndex((item) => item.id === entry.id) + 1;
  const topThirty = all.slice(0, 30);
  localStorage.setItem(RANKING_KEY, JSON.stringify(topThirty));
  localStorage.setItem(PLAYER_NAME_KEY, cleanName);
  return {
    rankings: topThirty,
    rank: position <= 30 ? position : null,
  };
}

export function getSavedPlayerName() {
  try {
    return (localStorage.getItem(PLAYER_NAME_KEY) ?? '').slice(0, 10);
  } catch {
    return '';
  }
}
