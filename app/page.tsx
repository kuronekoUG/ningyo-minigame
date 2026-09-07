'use client';
import { Cookie } from 'lucide-react';
import Link from 'next/link';
import { withBase } from './base-path';
import GamePanel from './game';
export default function Home() {
  return (
    <main className="ocean-page">
      <header className="topbar">
        <span>
          <Cookie size={23} /> しるこさんぽ
        </span>
        <span className="fan-label">非公式ファンゲーム</span>
      </header>
      <div className="game-layout">
        <GamePanel />
      </div>
      <footer>
        <span>ちいかわの世界をモチーフにした非公式のミニゲームです。</span>
        <Link href={withBase('/terms')}>
          このゲームについて（権利表記・免責）
        </Link>
      </footer>
    </main>
  );
}
