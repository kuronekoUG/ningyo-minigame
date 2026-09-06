'use client';
import { Waves } from 'lucide-react';
import GamePanel from './game';
export default function Home() {
  return (
    <main className="ocean-page">
      <header className="topbar">
        <span>
          <Waves size={23} /> SHIRUKO SAND SWIM
        </span>
        <span className="fan-label">非公式ファンゲーム</span>
      </header>
      <div className="game-layout">
        <aside className="intro">
          <div className="eyebrow">おやつをさがして、すいすい。</div>
          <h1>
            人魚の
            <br />
            <span>しるこサンド</span>
            <br />
            さんぽ
          </h1>
          <p>
            ひとくち分の、しあわせ。
            <br />
            でも、岩には気をつけて。
          </p>
          <div className="instruction">
            <span className="step">01</span>
            <div>
              <b>左右に泳ごう</b>
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
          <div className="small-note">のんびり、でも油断はしないでね。</div>
        </aside>
        <GamePanel />
        <aside className="side-note">
          <div className="vertical-note">
            しるこサンドに、
            <br />
            つられちゃった。
          </div>
          <span>
            海の向こうには
            <br />
            なにがいるんだろう。
          </span>
        </aside>
      </div>
      <footer>ちいかわの世界をモチーフにした非公式のミニゲームです。</footer>
    </main>
  );
}
