'use client';
import {
  ArrowLeft,
  ArrowRight,
  Pause,
  Play,
  RotateCcw,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import {
  newGame,
  startGame,
  stepGame,
  getScrollSpeed,
  WIDTH,
  HEIGHT,
  PLAYER_Y,
  type Mode,
} from './engine';

export default function GamePanel() {
  const canvas = useRef<HTMLCanvasElement>(null),
    field = useRef<HTMLDivElement>(null),
    game = useRef(newGame()),
    keys = useRef(new Set<string>()),
    target = useRef<number | null>(null),
    held = useRef(0),
    sprite = useRef<HTMLImageElement | null>(null),
    mermaid = useRef<HTMLImageElement | null>(null),
    cave = useRef<HTMLImageElement | null>(null),
    sound = useRef(false),
    audio = useRef<AudioContext | null>(null),
    overTimer = useRef<ReturnType<typeof setTimeout> | null>(null),
    primary = useRef<HTMLButtonElement>(null);
  const [mode, setMode] = useState<Mode>('ready'),
    [score, setScore] = useState(0),
    [loaded, setLoaded] = useState(false),
    [assetError, setAssetError] = useState(false),
    [muted, setMuted] = useState(true);
  function tone(hit = false) {
    if (!sound.current) return;
    try {
      audio.current ??= new AudioContext();
      void audio.current.resume();
      const a = audio.current,
        osc = a.createOscillator(),
        gain = a.createGain();
      osc.type = hit ? 'triangle' : 'sine';
      osc.frequency.setValueAtTime(hit ? 110 : 720, a.currentTime);
      osc.frequency.exponentialRampToValueAtTime(
        hit ? 30 : 1150,
        a.currentTime + 0.13,
      );
      gain.gain.setValueAtTime(0.085, a.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, a.currentTime + 0.22);
      osc.connect(gain);
      gain.connect(a.destination);
      osc.start();
      osc.stop(a.currentTime + 0.23);
    } catch {}
  }
  function start() {
    if (!sprite.current || !mermaid.current) return;
    if (overTimer.current) clearTimeout(overTimer.current);
    game.current = startGame();
    keys.current.clear();
    held.current = 0;
    target.current = null;
    setScore(0);
    setMode('playing');
    field.current?.focus();
  }
  function pause() {
    const g = game.current;
    if (g.mode === 'playing') {
      g.mode = 'paused';
      setMode('paused');
      keys.current.clear();
      held.current = 0;
      target.current = null;
    } else if (g.mode === 'paused') {
      g.mode = 'playing';
      setMode('playing');
      field.current?.focus();
    }
  }
  useEffect(() => {
    const img = new Image();
    const hero = new Image();
    const caveImage = new Image();
    img.onload = () => {
      sprite.current = img;
      if (mermaid.current) setLoaded(true);
    };
    hero.onload = () => {
      mermaid.current = hero;
      if (sprite.current) setLoaded(true);
    };
    caveImage.onload = () => {
      cave.current = caveImage;
    };
    img.onerror = hero.onerror = caveImage.onerror = () => setAssetError(true);
    img.src = '/sprites.png';
    hero.src = '/mermaid-back-v3.svg';
    caveImage.src = '/cave-course.png';
    const down = (e: KeyboardEvent) => {
      if (['ArrowLeft', 'ArrowRight', 'a', 'A', 'd', 'D'].includes(e.key)) {
        if (game.current.mode === 'playing') e.preventDefault();
        keys.current.add(e.key.toLowerCase());
      }
      if (
        (e.key === 'Escape' || e.code === 'Space') &&
        !e.repeat &&
        !(e.target instanceof HTMLButtonElement)
      ) {
        if (['playing', 'paused'].includes(game.current.mode)) {
          e.preventDefault();
          pause();
        }
      }
    };
    const up = (e: KeyboardEvent) => keys.current.delete(e.key.toLowerCase());
    const blur = () => {
      keys.current.clear();
      held.current = 0;
      target.current = null;
      if (game.current.mode === 'playing') {
        game.current.mode = 'paused';
        setMode('paused');
      }
    };
    const visibility = () => {
      if (document.hidden) blur();
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    document.addEventListener('visibilitychange', visibility);
    let frame = 0,
      last = 0,
      ambient = 0;
    const tick = (now: number) => {
      const dt = last ? Math.min((now - last) / 1000, 0.04) : 0;
      last = now;
      const g = game.current;
      const direction =
        (keys.current.has('arrowright') || keys.current.has('d') ? 1 : 0) -
          (keys.current.has('arrowleft') || keys.current.has('a') ? 1 : 0) ||
        held.current;
      const result = stepGame(g, dt, direction, target.current);
      if (result.ate) {
        setScore(g.score);
        tone();
      }
      if (result.hit) {
        tone(true);
        setMode('crashed');
        keys.current.clear();
        held.current = 0;
        target.current = null;
        overTimer.current = setTimeout(() => {
          g.mode = 'over';
          setMode('over');
        }, 1050);
      }
      if (g.mode === 'playing' || g.mode === 'ready') ambient += dt;
      const ctx = canvas.current?.getContext('2d');
      if (ctx) {
        ctx.clearRect(0, 0, WIDTH, HEIGHT);
        const bgSpeed =
          g.mode === 'playing' ? getScrollSpeed(g.time) * 0.38 : 25;
        const bgOffset = (ambient * bgSpeed) % HEIGHT;
        if (cave.current) {
          ctx.drawImage(cave.current, 0, bgOffset - HEIGHT, WIDTH, HEIGHT);
          ctx.drawImage(cave.current, 0, bgOffset, WIDTH, HEIGHT);
        }
        ctx.fillStyle = '#0718272c';
        ctx.fillRect(0, 0, WIDTH, HEIGHT);
        const draw = (
          cell: number,
          x: number,
          y: number,
          size: number,
          angle = 0,
          alpha = 1,
        ) => {
          if (!sprite.current) return;
          ctx.save();
          ctx.globalAlpha = alpha;
          ctx.translate(x, y);
          ctx.rotate(angle);
          ctx.drawImage(
            sprite.current,
            cell * 724,
            0,
            724,
            724,
            -size / 2,
            -size / 2,
            size,
            size,
          );
          ctx.restore();
        };
        if (g.mode === 'ready') {
          draw(2, 65, 85, 107, 0.1, 0.7);
          draw(2, 423, 368, 95, -0.15, 0.65);
          draw(1, 350, 95, 60, 0.2);
          draw(1, 95, 430, 51, -0.2);
          if (mermaid.current) {
            ctx.drawImage(mermaid.current, 188, 491, 104, 104);
          }
        } else {
          for (const i of g.items) {
            draw(i.kind === 'rock' ? 2 : 1, i.x, i.y, i.size, i.angle);
          }
          if (mermaid.current) {
            ctx.save();
            ctx.translate(g.x, PLAYER_Y);
            ctx.rotate(g.mode === 'playing' ? Math.sin(g.time * 7) * 0.055 : 0);
            ctx.drawImage(mermaid.current, -48, -48, 96, 96);
            ctx.restore();
          }
          for (const p of g.pops) {
            ctx.globalAlpha = p.life;
            ctx.fillStyle = '#fffce8';
            ctx.strokeStyle = '#3d766e';
            ctx.lineWidth = 3;
            ctx.font = 'bold 23px sans-serif';
            ctx.textAlign = 'center';
            ctx.strokeText('+10', p.x, p.y - 27);
            ctx.fillText('+10', p.x, p.y - 27);
            ctx.globalAlpha = 1;
          }
        }
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      if (overTimer.current) clearTimeout(overTimer.current);
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
      document.removeEventListener('visibilitychange', visibility);
      img.onload = null;
      img.onerror = null;
      hero.onload = null;
      hero.onerror = null;
      caveImage.onload = null;
      caveImage.onerror = null;
      void audio.current?.close();
    };
  }, []);
  useEffect(() => {
    if (mode === 'over' || mode === 'paused') primary.current?.focus();
  }, [mode]);
  function point(e: React.PointerEvent<HTMLDivElement>) {
    if (game.current.mode !== 'playing') return;
    const box = e.currentTarget.getBoundingClientRect();
    target.current = ((e.clientX - box.left) / box.width) * WIDTH;
  }
  const release = () => {
    target.current = null;
    held.current = 0;
  };
  return (
    <section className="game-shell" aria-label="人魚のしるこサンドさんぽ">
      <div className="hud">
        <div>
          <span>SCORE</span>
          <strong>
            {String(score).padStart(4, '0')} <small>pt</small>
          </strong>
        </div>
        <div className="hud-right">
          <button
            className="icon-button"
            onClick={() => {
              sound.current = !sound.current;
              setMuted(!sound.current);
              if (sound.current) tone();
            }}
            aria-label={muted ? '音をオンにする' : '音をオフにする'}
            aria-pressed={!muted}
          >
            {muted ? <VolumeX size={17} /> : <Volume2 size={17} />}
          </button>
          <button
            className="icon-button"
            disabled={mode !== 'playing' && mode !== 'paused'}
            onClick={pause}
            aria-label={mode === 'paused' ? '再開' : '一時停止'}
          >
            {mode === 'paused' ? <Play size={16} /> : <Pause size={16} />}
          </button>
        </div>
      </div>
      <div
        className={`playfield ${mode === 'crashed' || mode === 'over' ? 'crashed' : ''}`}
        ref={field}
        tabIndex={-1}
        onPointerDown={(e) => {
          if (e.target instanceof Element && e.target.closest('button')) return;
          e.currentTarget.setPointerCapture(e.pointerId);
          point(e);
        }}
        onPointerMove={(e) => {
          if (e.buttons) point(e);
        }}
        onPointerUp={release}
        onPointerCancel={release}
        onLostPointerCapture={release}
      >
        <div className="water-light" />
        <canvas
          ref={canvas}
          width={WIDTH}
          height={HEIGHT}
          aria-label="上から流れる岩をよけて、しるこサンドを集めるゲーム"
        />
        <div className="darkness" />
        {mode === 'ready' && (
          <div className="start-card with-sprite">
            <div className="sprite-preview" aria-hidden="true" />
            <span className="tiny-caps">IN THE HIDDEN CAVE</span>
            <h2>サクサク……</h2>
            <p>
              洞窟の岩をよけて、しるこサンドを
              <br />
              たどっていこう。
            </p>
            <button
              className="primary-button"
              onClick={start}
              disabled={!loaded}
            >
              <Play fill="currentColor" size={18} />
              {assetError
                ? '読み込みに失敗しました'
                : loaded
                  ? '洞窟へすすむ'
                  : '洞窟を準備しています…'}
            </button>
            {assetError ? (
              <p>ページを再読み込みしてください。</p>
            ) : (
              <span className="start-hint">← → で移動・スマホはスワイプ</span>
            )}
          </div>
        )}
        {mode === 'paused' && (
          <div className="start-card">
            <span className="tiny-caps">TAKE A LITTLE BREAK</span>
            <h2>しーん……。</h2>
            <p>洞窟の中で、ちょっとひとやすみ。</p>
            <button ref={primary} className="primary-button" onClick={pause}>
              <Play size={18} />
              泳ぎつづける
            </button>
            <span className="start-hint">Space / Esc キーでも再開</span>
          </div>
        )}
        {mode === 'over' && (
          <div className="start-card over-card">
            <span className="tiny-caps">GAME OVER</span>
            <h2>……みつかっちゃった。</h2>
            <p>暗いところで、なにかが動いた。</p>
            <div className="score-result">
              <strong>{score}</strong>
              <span>pt</span>
            </div>
            <p>しるこサンドを {score / 10} 個たべた！</p>
            <button ref={primary} className="primary-button" onClick={start}>
              <RotateCcw size={18} />
              もういちど泳ぐ
            </button>
          </div>
        )}
        {mode === 'playing' && (
          <div className="mobile-controls">
            {[-1, 1].map((d) => (
              <button
                key={d}
                aria-label={d === -1 ? '左へ移動' : '右へ移動'}
                onPointerDown={(e) => {
                  e.stopPropagation();
                  e.currentTarget.setPointerCapture(e.pointerId);
                  held.current = d;
                  target.current = null;
                }}
                onPointerUp={release}
                onPointerCancel={release}
                onLostPointerCapture={release}
              >
                {d === -1 ? <ArrowLeft /> : <ArrowRight />}
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="game-bottom">
        <span>
          <span className="live-dot" />
          {mode === 'playing'
            ? 'しるこサンド +10 pt'
            : mode === 'over'
              ? 'また、おやつを探しに。'
              : mode === 'paused'
                ? 'ひとやすみ中'
                : '気づかれないように…'}
        </span>
        <span>{mode === 'playing' ? '← → / なぞって移動' : '岩に注意！'}</span>
      </div>
      <output className="sr-only" aria-live="polite">
        {mode === 'over'
          ? `ゲームオーバー。${score}点。`
          : mode === 'paused'
            ? '一時停止中'
            : ''}
      </output>
    </section>
  );
}
