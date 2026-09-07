'use client';

import { ArrowLeft, Trophy } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { getRankings, type RankingEntry } from '../ranking-store';

export default function RankingPage() {
  const [ranking, setRanking] = useState<RankingEntry[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>(
    'loading',
  );

  useEffect(() => {
    let active = true;
    void getRankings()
      .then((entries) => {
        if (!active) return;
        setRanking(entries);
        setStatus('ready');
      })
      .catch(() => {
        if (active) setStatus('error');
      });
    return () => {
      active = false;
    };
  }, []);

  return (
    <main className="ranking-page">
      <header className="ranking-page-header">
        <Link href="/" className="back-link">
          <ArrowLeft size={18} /> ゲームにもどる
        </Link>
        <span>人魚のしるこサンドさんぽ</span>
      </header>
      <section className="ranking-sheet">
        <div className="ranking-title-mark">
          <Trophy size={27} />
          <span>TOP 30</span>
        </div>
        <h1>ランキング</h1>
        <p>
          {status === 'loading'
            ? '全ユーザーの記録を読み込み中…'
            : status === 'error'
              ? 'ランキングに接続できませんでした。'
              : '全ユーザー共通の上位30件'}
        </p>
        <ol className="ranking-table">
          {Array.from({ length: 30 }, (_, index) => {
            const entry = ranking[index];
            const date = entry
              ? new Intl.DateTimeFormat('ja-JP', {
                  month: 'numeric',
                  day: 'numeric',
                }).format(new Date(entry.playedAt))
              : '';
            return (
              <li
                key={entry?.id ?? `empty-${index}`}
                className={index < 3 ? 'podium' : undefined}
              >
                <span className="ranking-position">{index + 1}</span>
                <strong>{entry?.name ?? '—'}</strong>
                <span className="ranking-date">{date}</span>
                <span className="ranking-score">
                  {entry ? String(entry.score).padStart(4, '0') : '----'}{' '}
                  <small>pt</small>
                </span>
              </li>
            );
          })}
        </ol>
      </section>
    </main>
  );
}
