'use client';
import { Cookie } from 'lucide-react';
import GamePanel from './game';
export default function Home() {
  return (
    <main className="ocean-page">
      <header className="topbar">
        <span>
          <Cookie size={23} /> 人魚のしるこサンドさんぽ
        </span>
        <span className="fan-label">非公式ファンゲーム</span>
      </header>
      <div className="game-layout">
        <aside className="intro">
          <div className="eyebrow">暗い洞窟に、サクサクの音。</div>
          <h1>
            人魚の
            <br />
            <span>しるこサンド</span>
            <br />
            さんぽ
          </h1>
          <p>
            岩陰につづく、おやつの道。
            <br />
            奥にいる誰かには、気づかないまま。
          </p>
          <div className="instruction">
            <span className="step">01</span>
            <div>
              <b>左右に移動しよう</b>
              <p>
                ← → キー / A・D キー
                <br />
                スマホは画面をなぞって移動
              </p>
            </div>
          </div>
          <div className="instruction">
            <span className="step">02</span>
            <div>
              <b>しるこサンドで +10点</b>
              <p>岩にぶつかったら、おしまい。</p>
            </div>
          </div>
          <div className="small-note">進むほど、流れも岩も激しくなるよ。</div>
        </aside>
        <GamePanel />
        <aside className="side-note">
          <div className="vertical-note">
            しるこサンドに、
            <br />
            つられちゃった。
          </div>
          <span>
            洞窟の奥には
            <br />
            なにがいるんだろう。
          </span>
        </aside>
      </div>
      <footer>ちいかわの世界をモチーフにした非公式のミニゲームです。</footer>
    </main>
  );
}
