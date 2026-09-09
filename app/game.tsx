'use client';
import {
  Download,
  Pause,
  Play,
  RotateCcw,
  Trophy,
  Volume2,
  VolumeX,
} from 'lucide-react';
import NextImage from 'next/image';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  newGame,
  startGame,
  stepGame,
  getScrollSpeed,
  getMultiplier,
  makeRandom,
  STEP,
  type InputEvent,
  type Replay,
  COMBO_WINDOW,
  MAX_MULTIPLIER,
  WIDTH,
  HEIGHT,
  PLAYER_Y,
  type Mode,
} from './engine';
import { GAME_OVER_LINES } from './game-over-lines';
import { RenderState } from './render-state';
import { withBase } from './base-path';
import {
  NAME_LENGTH,
  SCORES_API,
  PLACES,
  bankRun,
  fetchScores,
  fetchTotal,
  submitScore,
  type Entry,
} from './ranking.ts';

const BEST_KEY = 'shirukosanpo.best';
// Outside the component: the analyser reads a Math.random call in there as an
// impure render, though this one only ever runs from the start button.
function newSeed() {
  return (Math.random() * 0xffffffff) >>> 0;
}
type Best = { score: number; eaten: number };
// The run has to be worth comparing to something, and there is no server to
// compare against. Reading can throw in a private window, so it is guarded.
function readBest(): Best {
  try {
    const stored = localStorage.getItem(BEST_KEY);
    if (stored) {
      const value = JSON.parse(stored) as Partial<Best>;
      if (typeof value.score === 'number' && typeof value.eaten === 'number') {
        return { score: value.score, eaten: value.eaten };
      }
    }
  } catch {}
  return { score: 0, eaten: 0 };
}
function writeBest(best: Best) {
  try {
    localStorage.setItem(BEST_KEY, JSON.stringify(best));
  } catch {}
}

// X caches a card against the URL it crawled, so a share carries a version the
// crawler has not seen. Bump it whenever the card art changes.
const SHARE_VERSION = '2';

export default function GamePanel() {
  const canvas = useRef<HTMLCanvasElement>(null),
    field = useRef<HTMLDivElement>(null),
    game = useRef(newGame()),
    keys = useRef(new Set<string>()),
    target = useRef<number | null>(null),
    sprite = useRef<HTMLImageElement | null>(null),
    mermaid = useRef<HTMLImageElement | null>(null),
    rock = useRef<HTMLImageElement | null>(null),
    scale = useRef<HTMLImageElement | null>(null),
    cave = useRef<HTMLImageElement | null>(null),
    sound = useRef(true),
    audio = useRef<AudioContext | null>(null),
    overTimer = useRef<ReturnType<typeof setTimeout> | null>(null),
    lastGameOverLine = useRef(0),
    // The seed of the run already sent to the tally, so one crash counts once.
    banked = useRef(-1),
    primary = useRef<HTMLButtonElement>(null),
    // Everything the server needs to play the run back and check the score.
    rng = useRef(makeRandom(1)),
    log = useRef<Replay>({ seed: 1, ticks: 0, inputs: [] }),
    sent = useRef<{ direction: number; target: number | null }>({
      direction: 0,
      target: null,
    });
  const [mode, setMode] = useState<Mode>('ready'),
    [score, setScore] = useState(0),
    [eaten, setEaten] = useState(0),
    [loaded, setLoaded] = useState(false),
    [assetError, setAssetError] = useState(false),
    [muted, setMuted] = useState(false),
    [gameOverLine, setGameOverLine] = useState<string>(GAME_OVER_LINES[0]),
    [best, setBest] = useState<Best>({ score: 0, eaten: 0 }),
    [beatBest, setBeatBest] = useState(false),
    [name, setName] = useState(''),
    [ranking, setRanking] = useState<Entry[] | null>(null),
    [total, setTotal] = useState<number | null>(null),
    [rankOpen, setRankOpen] = useState(false),
    [posted, setPosted] = useState(false),
    [kept, setKept] = useState(false),
    [sending, setSending] = useState(false),
    [rankError, setRankError] = useState(''),
    [shot, setShot] = useState<{
      url: string;
      file: File;
      touch: boolean;
    } | null>(null);
  // A bite is broadband and gone in a moment, so the snack is a burst of
  // filtered noise rather than a tone. Two of them, a beat apart, give サクッ
  // its two syllables. The band climbs with the chain, keeping the multiplier
  // audible the way the old pitch was.
  function burst(
    a: AudioContext,
    centre: number,
    at: number,
    level: number,
    length: number,
  ) {
    const start = a.currentTime + at;
    const frames = Math.floor(a.sampleRate * length);
    const buffer = a.createBuffer(1, frames, a.sampleRate);
    const samples = buffer.getChannelData(0);
    for (let i = 0; i < frames; i++) {
      // Thinning the noise across the burst reads as a snap, not a hiss.
      const fade = 1 - i / frames;
      samples[i] = (Math.random() * 2 - 1) * fade * fade;
    }
    const source = a.createBufferSource();
    source.buffer = buffer;
    const band = a.createBiquadFilter();
    band.type = 'bandpass';
    band.Q.value = 0.9;
    // A real crunch darkens as it collapses, so the band falls with it.
    band.frequency.setValueAtTime(centre, start);
    band.frequency.exponentialRampToValueAtTime(centre * 0.5, start + length);
    const gain = a.createGain();
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(level, start + 0.003);
    gain.gain.exponentialRampToValueAtTime(0.001, start + length);
    source.connect(band);
    band.connect(gain);
    gain.connect(a.destination);
    source.start(start);
    source.stop(start + length + 0.01);
  }
  // One pitch, a little under where it started: the climbing version made a
  // run musical but a bite is a bite.
  function crunch(a: AudioContext) {
    const centre = 1800;
    burst(a, centre, 0, 0.5, 0.075);
    burst(a, centre * 0.72, 0.026, 0.26, 0.06);
  }
  function tone(kind: 'snack' | 'hit' | 'fever' = 'snack') {
    if (!sound.current) return;
    try {
      audio.current ??= new AudioContext();
      void audio.current.resume();
      const a = audio.current;
      if (kind === 'snack') {
        crunch(a);
        return;
      }
      const osc = a.createOscillator(),
        gain = a.createGain();
      const hit = kind === 'hit';
      const length = hit ? 0.22 : 0.42;
      osc.type = hit ? 'triangle' : 'square';
      osc.frequency.setValueAtTime(hit ? 110 : 520, a.currentTime);
      osc.frequency.exponentialRampToValueAtTime(
        hit ? 30 : 1560,
        a.currentTime + length * 0.6,
      );
      // The crash carried at 0.085, under the crunch it is meant to interrupt.
      gain.gain.setValueAtTime(hit ? 0.26 : 0.06, a.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, a.currentTime + length);
      osc.connect(gain);
      gain.connect(a.destination);
      osc.start();
      osc.stop(a.currentTime + length + 0.01);
    } catch {}
  }
  function start() {
    if (!sprite.current || !mermaid.current) return;
    // Unlock audio from the click itself: a context first created inside the
    // frame loop can be born suspended and stay silent.
    if (sound.current) {
      try {
        audio.current ??= new AudioContext();
        void audio.current.resume();
      } catch {}
    }
    if (overTimer.current) clearTimeout(overTimer.current);
    // A fresh seed per run, recorded so the run can be replayed exactly.
    const seed = newSeed();
    rng.current = makeRandom(seed);
    log.current = { seed, ticks: 0, inputs: [] };
    sent.current = { direction: 0, target: null };
    game.current = startGame();
    keys.current.clear();
    target.current = null;
    closeShot();
    setRanking(null);
    setRankOpen(false);
    setPosted(false);
    setKept(false);
    setName('');
    setRankError('');
    setBeatBest(false);
    setScore(0);
    setEaten(0);
    setMode('playing');
    field.current?.focus({ preventScroll: true });
  }
  function pause() {
    const g = game.current;
    if (g.mode === 'playing') {
      g.mode = 'paused';
      setMode('paused');
      keys.current.clear();
      target.current = null;
    } else if (g.mode === 'paused') {
      g.mode = 'playing';
      setMode('playing');
      field.current?.focus({ preventScroll: true });
    }
  }
  // Almost nobody types a name, so waiting for the board would leave the tally
  // counting a fraction of what the cave actually handed out. The run goes as
  // soon as it ends, without one. A run with nothing to add is not worth a
  // request, and a failure is not worth telling the player about.
  function bankThisRun(final: number, collected: number) {
    if (SCORES_API === '' || collected === 0) return;
    if (banked.current === log.current.seed) return;
    banked.current = log.current.seed;
    // The run's own totals, not the state React has yet to catch up to: the
    // server checks the score against its replay and refuses a stale one.
    bankRun(final, collected, log.current)
      .then(setTotal)
      .catch(() => {});
  }
  useEffect(() => {
    const img = new Image();
    const hero = new Image();
    const rockImage = new Image();
    const caveImage = new Image();
    const scaleImage = new Image();
    img.onload = () => {
      sprite.current = img;
      if (mermaid.current && rock.current) setLoaded(true);
    };
    hero.onload = () => {
      mermaid.current = hero;
      if (sprite.current && rock.current) setLoaded(true);
    };
    rockImage.onload = () => {
      rock.current = rockImage;
      if (sprite.current && mermaid.current) setLoaded(true);
    };
    caveImage.onload = () => {
      cave.current = caveImage;
    };
    scaleImage.onload = () => {
      scale.current = scaleImage;
    };
    img.onerror =
      hero.onerror =
      rockImage.onerror =
      caveImage.onerror =
      scaleImage.onerror =
        () => setAssetError(true);
    img.src = withBase('/snack-rough.png');
    hero.src = withBase('/mermaid-rough.png');
    rockImage.src = withBase('/rock-rough.png');
    caveImage.src = withBase('/cave-rough.jpg');
    scaleImage.src = withBase('/scale.png');
    // An in-app browser can report svh wrong on a cold start and only settle a
    // moment later, which sized the whole page to a viewport that was never
    // there. Measure it instead, take the smaller of the two readings, and keep
    // measuring: the layout then corrects itself in place rather than needing
    // the player to come back a few times.
    let appliedHeight = 0,
      appliedWidth = 0;
    let keyboardUntil = 0;
    const viewport = window.visualViewport;
    const measure = () => {
      // Keyboard and zoom change the visible area, not the game layout.
      // Keep the width-dependent layout stable while playing as browser bars move.
      const editing = document.activeElement?.matches('input, textarea');
      if (editing) keyboardUntil = Date.now() + 1200;
      if (viewport && Math.abs(viewport.scale - 1) > 0.01) return;
      if (
        appliedHeight &&
        window.innerWidth === appliedWidth &&
        (editing ||
          Date.now() < keyboardUntil ||
          game.current.mode === 'playing')
      )
        return;
      const height = Math.min(window.innerHeight, viewport?.height ?? Infinity);
      if (height <= 0) return;
      // A mobile browser's bars slide in and out as you touch the page, moving
      // this by a few dozen pixels each time. Relaying out for that made the
      // whole game shudder, so only a change big enough to be a real one — or
      // a change of width, which a bar never causes — is worth acting on.
      const settled =
        appliedHeight &&
        Math.abs(height - appliedHeight) < 80 &&
        window.innerWidth === appliedWidth;
      if (settled) return;
      appliedHeight = Math.round(height);
      appliedWidth = window.innerWidth;
      document.documentElement.style.setProperty(
        '--app-height',
        `${appliedHeight}px`,
      );
    };
    // Reading a stored best on mount is exactly what an effect is for; it
    // cannot be an initial value because this page is prerendered.
    // eslint-disable-next-line react/react-compiler
    setBest(readBest());
    measure();
    const settle = [
      setTimeout(measure, 250),
      setTimeout(measure, 800),
      setTimeout(measure, 2000),
    ];
    let keyboardTimer: ReturnType<typeof setTimeout> | undefined;
    const inputFocus = () => {
      if (document.activeElement?.matches('input, textarea')) measure();
    };
    const inputBlur = (event: FocusEvent) => {
      if (!(event.target instanceof HTMLInputElement)) return;
      // Wait for the keyboard's closing animation before measuring again.
      keyboardUntil = Date.now() + 1200;
      clearTimeout(keyboardTimer);
      keyboardTimer = setTimeout(measure, 1250);
    };
    window.addEventListener('resize', measure);
    viewport?.addEventListener('resize', measure);
    document.addEventListener('focusin', inputFocus);
    document.addEventListener('focusout', inputBlur);
    window.addEventListener('orientationchange', measure);
    window.addEventListener('pageshow', measure);
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
      backgroundOffset = 0;
    let carry = 0;
    let activeGame = game.current;
    let previousMode = activeGame.mode;
    const render = new RenderState();
    render.capture(activeGame);
    const tick = (now: number) => {
      let elapsed = last ? Math.min((now - last) / 1000, 0.25) : 0;
      last = now;
      const g = game.current;
      if (g !== activeGame || g.mode !== previousMode) {
        activeGame = g;
        carry = 0;
        elapsed = 0;
        render.capture(g);
      }
      const direction =
        (keys.current.has('arrowright') || keys.current.has('d') ? 1 : 0) -
        (keys.current.has('arrowleft') || keys.current.has('a') ? 1 : 0);
      // Fixed steps, so the run is the same every time it is played back. Real
      // time only decides how many of them this frame is worth.
      const playing = g.mode === 'playing';
      carry = playing ? carry + elapsed : 0;
      const result = { ate: false, hit: false, feverStarted: false };
      while (carry >= STEP) {
        carry -= STEP;
        if (playing) {
          const previous = sent.current;
          if (
            previous.direction !== direction ||
            previous.target !== target.current
          ) {
            log.current.inputs.push([
              log.current.ticks,
              direction,
              target.current,
            ] as InputEvent);
            sent.current = { direction, target: target.current };
          }
          log.current.ticks++;
        }
        render.capture(g);
        const step = stepGame(g, STEP, direction, target.current, rng.current);
        result.ate = result.ate || step.ate;
        result.hit = result.hit || step.hit;
        result.feverStarted = result.feverStarted || step.feverStarted;
        if (step.hit) {
          carry = 0;
          break;
        }
      }
      previousMode = g.mode;
      const alpha = g.mode === 'playing' ? carry / STEP : 1;
      const renderTime = render.renderTime(g, alpha);
      if (result.ate) {
        setScore(g.score);
        setEaten(g.eaten);
        tone('snack');
      }
      if (result.feverStarted) tone('fever');
      if (result.hit) {
        tone('hit');
        let lineIndex = Math.floor(Math.random() * GAME_OVER_LINES.length);
        if (lineIndex === lastGameOverLine.current) {
          lineIndex = (lineIndex + 1) % GAME_OVER_LINES.length;
        }
        lastGameOverLine.current = lineIndex;
        setGameOverLine(GAME_OVER_LINES[lineIndex]);
        setMode('crashed');
        bankThisRun(g.score, g.eaten);
        keys.current.clear();
        target.current = null;
        overTimer.current = setTimeout(() => {
          g.mode = 'over';
          setMode('over');
          const previous = readBest();
          const beaten = g.score > previous.score;
          setBeatBest(beaten);
          const next = {
            score: Math.max(previous.score, g.score),
            eaten: Math.max(previous.eaten, g.eaten),
          };
          setBest(next);
          if (beaten || next.eaten !== previous.eaten) writeBest(next);
        }, 1050);
      }
      const ctx = canvas.current?.getContext('2d');
      if (ctx) {
        ctx.clearRect(0, 0, WIDTH, HEIGHT);
        // The backdrop is decoration, so it rides real time rather than the
        // fixed steps the simulation runs on.
        if (g.mode === 'playing') {
          backgroundOffset =
            (backgroundOffset + getScrollSpeed(g.time) * elapsed) %
            (HEIGHT * 2);
        } else if (g.mode === 'ready') {
          backgroundOffset = (backgroundOffset + 8 * elapsed) % (HEIGHT * 2);
        }
        if (cave.current) {
          for (let tile = -2; tile <= 1; tile++) {
            // Overlap at the seam, keeping subpixel motion between frames.
            const y = tile * HEIGHT + backgroundOffset;
            if (y > HEIGHT || y + HEIGHT + 1 < 0) continue;
            if (tile % 2 === 0) {
              ctx.drawImage(cave.current, 0, y, WIDTH, HEIGHT + 1);
            } else {
              ctx.save();
              ctx.translate(0, y + HEIGHT + 1);
              ctx.scale(1, -1);
              ctx.drawImage(cave.current, 0, 0, WIDTH, HEIGHT + 1);
              ctx.restore();
            }
          }
        }
        // サクサクタイム warms the cave instead of darkening it.
        ctx.fillStyle = g.fever > 0 ? '#f7b04724' : '#0718272c';
        ctx.fillRect(0, 0, WIDTH, HEIGHT);
        const drawSnack = (
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
          ctx.drawImage(sprite.current, -size / 2, -size / 2, size, size);
          ctx.restore();
        };
        const drawRock = (
          x: number,
          y: number,
          size: number,
          angle = 0,
          alpha = 1,
        ) => {
          if (!rock.current) return;
          ctx.save();
          ctx.globalAlpha = alpha;
          ctx.translate(x, y);
          ctx.rotate(angle);
          ctx.drawImage(rock.current, -size / 2, -size / 2, size, size);
          ctx.restore();
        };
        if (g.mode === 'ready') {
          drawRock(65, 85, 107, 0.1, 0.7);
          drawRock(423, 368, 95, -0.15, 0.65);
          drawSnack(350, 95, 60, 0.2);
          drawSnack(95, 430, 51, -0.2);
          if (mermaid.current) {
            ctx.drawImage(mermaid.current, 188, 491, 104, 104);
          }
        } else {
          const rockAlpha = g.fever > 0 ? 0.28 : 1;
          for (const i of g.items) {
            const y = render.itemY(i, alpha);
            if (i.kind === 'rock' && g.fever === 0) {
              ctx.save();
              ctx.translate(i.x, y + i.size * 0.26);
              ctx.scale(1, 0.34);
              ctx.beginPath();
              ctx.arc(0, 0, i.size * 0.36, 0, Math.PI * 2);
              ctx.fillStyle = '#031c2b66';
              ctx.fill();
              ctx.restore();
            }
            if (i.kind === 'rock') {
              drawRock(i.x, y, i.size, i.angle, rockAlpha);
            } else if (i.kind === 'scale' && scale.current) {
              ctx.save();
              ctx.translate(i.x, y);
              ctx.rotate(i.angle + Math.sin(renderTime * 3 + i.x) * 0.16);
              ctx.drawImage(
                scale.current,
                -i.size / 2,
                -i.size / 2,
                i.size,
                i.size,
              );
              ctx.restore();
            } else {
              drawSnack(i.x, y, i.size, i.angle);
            }
          }
          if (mermaid.current) {
            ctx.save();
            ctx.translate(render.playerX(g, alpha), PLAYER_Y);
            ctx.rotate(
              g.mode === 'playing' ? Math.sin(renderTime * 7) * 0.055 : 0,
            );
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
            const y = render.popY(p, alpha);
            ctx.strokeText(p.text, p.x, y - 27);
            ctx.fillText(p.text, p.x, y - 27);
            ctx.globalAlpha = 1;
          }
          if (g.combo > 0 || g.fever > 0) {
            // The HUD sits above the playfield and went unread mid-run, so the
            // multiplier is drawn low in the field instead, beside the player.
            const top = g.fever > 0;
            const multiple = top ? MAX_MULTIPLIER : getMultiplier(g.combo);
            ctx.save();
            ctx.textAlign = 'right';
            ctx.font = 'bold 32px sans-serif';
            ctx.lineWidth = 6;
            ctx.strokeStyle = '#08222f';
            ctx.strokeText(`×${multiple}`, 462, 52);
            ctx.fillStyle = top ? '#ffe9a8' : '#ffd98a';
            ctx.fillText(`×${multiple}`, 462, 52);
            const width = top ? 1 : Math.max(0, g.comboTimer / COMBO_WINDOW);
            ctx.fillStyle = '#08222f88';
            ctx.fillRect(398, 62, 64, 5);
            ctx.fillStyle = top ? '#ffe9a8' : '#ffd98a';
            ctx.fillRect(398 + 64 * (1 - width), 62, 64 * width, 5);
            ctx.restore();
          }
          if (g.fever > 0) {
            // Banner fades out over the last half second so the end is legible.
            ctx.save();
            ctx.globalAlpha = Math.min(1, g.fever * 2);
            ctx.translate(WIDTH / 2, 104);
            ctx.scale(1 + Math.sin(renderTime * 12) * 0.035, 1);
            ctx.textAlign = 'center';
            ctx.font = 'bold 40px sans-serif';
            ctx.lineWidth = 8;
            ctx.strokeStyle = '#5a2f10';
            ctx.strokeText('サクサクタイム！', 0, 0);
            ctx.fillStyle = '#ffe9a8';
            ctx.fillText('サクサクタイム！', 0, 0);
            ctx.restore();
          }
        }
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      if (overTimer.current) clearTimeout(overTimer.current);
      for (const timer of settle) clearTimeout(timer);
      clearTimeout(keyboardTimer);
      window.removeEventListener('resize', measure);
      viewport?.removeEventListener('resize', measure);
      document.removeEventListener('focusin', inputFocus);
      document.removeEventListener('focusout', inputBlur);
      window.removeEventListener('orientationchange', measure);
      window.removeEventListener('pageshow', measure);
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
      document.removeEventListener('visibilitychange', visibility);
      img.onload = null;
      img.onerror = null;
      hero.onload = null;
      hero.onerror = null;
      rockImage.onload = null;
      rockImage.onerror = null;
      caveImage.onload = null;
      caveImage.onerror = null;
      scaleImage.onload = null;
      scaleImage.onerror = null;
      void audio.current?.close();
    };
  }, []);
  // A shareable picture of the run, composed from the same art as the game.
  const buildResultCard = useCallback(() => {
    const W = 1200,
      H = 630;
    const sheet = document.createElement('canvas');
    sheet.width = W;
    sheet.height = H;
    const c = sheet.getContext('2d');
    if (!c || !cave.current || !mermaid.current) return null;
    c.drawImage(cave.current, 0, -485, 1200, 1600);
    c.fillStyle = '#071827a8';
    c.fillRect(0, 0, W, H);

    // a wobbling frame, as if ruled by hand
    const jitter = () => (Math.random() - 0.5) * 7;
    c.strokeStyle = '#fffce8';
    c.globalAlpha = 0.32;
    c.lineWidth = 6;
    c.lineJoin = 'round';
    c.beginPath();
    const corners = [
      [28, 26],
      [1172, 26],
      [1172, 604],
      [28, 604],
    ];
    corners.forEach(([px, py], i) => {
      const method = i === 0 ? 'moveTo' : 'lineTo';
      c[method](px + jitter(), py + jitter());
    });
    c.closePath();
    c.stroke();
    c.globalAlpha = 1;

    if (rock.current) {
      c.globalAlpha = 0.55;
      c.drawImage(rock.current, 1046, 46, 152, 152);
      c.drawImage(rock.current, 812, 462, 120, 120);
      c.globalAlpha = 1;
    }
    if (sprite.current) {
      const trail: [number, number, number][] = [
        [598, 76, 58],
        [684, 126, 64],
        [772, 176, 68],
      ];
      for (const [px, py, size] of trail) {
        c.drawImage(sprite.current, px, py, size, size);
      }
    }
    if (scale.current) c.drawImage(scale.current, 762, 466, 58, 58);
    c.drawImage(mermaid.current, 876, 224, 258, 258);

    const face = '"Hiragino Maru Gothic ProN", "Yu Gothic", Meiryo, sans-serif';
    const ink = (text: string, px: number, py: number, font: string) => {
      c.font = font;
      c.lineWidth = 9;
      c.lineJoin = 'round';
      c.strokeStyle = '#12283a';
      c.strokeText(text, px, py);
      c.fillStyle = '#fffce8';
      c.fillText(text, px, py);
    };
    c.textAlign = 'left';
    c.fillStyle = '#8ad6c7';
    c.font = `bold 19px ${face}`;
    c.fillText('R E S U L T', 86, 132);
    c.strokeStyle = '#8ad6c7';
    c.lineWidth = 4;
    c.beginPath();
    c.moveTo(88, 152 + jitter());
    c.lineTo(232, 150 + jitter());
    c.stroke();

    ink('しるこさんぽ', 82, 216, `bold 54px ${face}`);
    ink(`${score}`, 82, 342, `bold 104px ${face}`);
    const scoreWidth = c.measureText(`${score}`).width;
    c.font = `bold 34px ${face}`;
    c.fillStyle = '#ffd98a';
    c.fillText('pt', 96 + scoreWidth, 342);
    c.font = `bold 27px ${face}`;
    c.fillStyle = '#e2eeea';
    c.fillText(`しるこサンド ${eaten} 枚`, 86, 400);
    c.font = `21px ${face}`;
    c.fillStyle = '#a9c6c2';
    c.fillText(gameOverLine, 86, 452);
    c.fillText('洞窟を進む縦スクロールの非公式ファンゲーム', 86, 512);
    return sheet;
  }, [score, eaten, gameOverLine]);

  function shareUrl() {
    const here = new URL(window.location.href);
    here.searchParams.set('v', SHARE_VERSION);
    return here.toString();
  }
  function shareScoreOnX() {
    const line = `しるこさんぽで ${score}pt！しるこサンドを ${eaten} 枚たべました。`;
    // The tag rides in the text, not in `hashtags`: X's app honours text and
    // url from an intent but drops that parameter, so posts made from inside
    // the app were arriving untagged while the web composer kept it.
    const params = new URLSearchParams({
      text: `${line}\n岩をよけて、しるこサンドを集めよう。\n#しるこさんぽ`,
      url: shareUrl(),
    });
    window.open(
      `https://x.com/intent/post?${params.toString()}`,
      '_blank',
      'noopener,noreferrer,width=620,height=720',
    );
  }
  // An in-app browser can swallow the long press altogether, so where the
  // platform offers a save sheet the picture goes through that instead.
  function offerShot(file: File) {
    try {
      if (navigator.canShare?.({ files: [file] })) {
        void navigator.share({ files: [file] });
      }
    } catch {}
  }
  useEffect(() => {
    if (mode === 'over' || mode === 'paused') {
      primary.current?.focus({ preventScroll: true });
    }
  }, [mode, rankOpen, posted, shot]);
  // The one number on the card that is not about this player, so it comes with
  // the page rather than waiting for the ranking to be opened. Without an
  // endpoint there is no tally, and the line stays away.
  useEffect(() => {
    if (SCORES_API === '') return;
    const stop = new AbortController();
    fetchTotal(stop.signal)
      .then(setTotal)
      .catch(() => {});
    return () => stop.abort();
  }, []);
  async function sendScore() {
    if (sending || !name.trim()) return;
    setSending(true);
    setRankError('');
    try {
      const answer = await submitScore(name.trim(), score, eaten, log.current);
      setRanking(answer.scores);
      setKept(answer.kept);
      setPosted(true);
    } catch (error) {
      setRankError(
        error instanceof Error ? error.message : '登録できませんでした。',
      );
    } finally {
      setSending(false);
    }
  }
  // Opening the board loads it, so a player sees where they stand whether or
  // not they put a name in.
  function openRanking() {
    setRankOpen(true);
    setRankError('');
    if (ranking) return;
    fetchScores()
      .then(setRanking)
      .catch(() => setRankError('ランキングを読み込めませんでした。'));
  }
  function closeShot() {
    setShot((current) => {
      if (current) URL.revokeObjectURL(current.url);
      return null;
    });
  }
  // A download link opens the picture as a page on a phone, leaving the player
  // to work out that a long press saves it. Showing it in the card instead
  // makes the picture and the way to keep it plain at a glance.
  function saveResultCard() {
    const sheet = buildResultCard();
    sheet?.toBlob((blob) => {
      if (!blob) return;
      setShot((current) => {
        if (current) URL.revokeObjectURL(current.url);
        return {
          url: URL.createObjectURL(blob),
          file: new File([blob], `しるこさんぽ-${score}pt.png`, {
            type: 'image/png',
          }),
          touch: window.matchMedia('(hover: none)').matches,
        };
      });
    }, 'image/png');
  }
  function point(e: React.PointerEvent<HTMLDivElement>) {
    if (game.current.mode !== 'playing') return;
    // The canvas is letterboxed to keep its proportions, so the pointer maps
    // against the painted area rather than the element box.
    const box = canvas.current?.getBoundingClientRect();
    if (!box) return;
    const painted = WIDTH * Math.min(box.width / WIDTH, box.height / HEIGHT);
    const left = box.left + (box.width - painted) / 2;
    // Rounded to the pixel: it is imperceptible to steer by, and it keeps the
    // replay log small and free of long decimals.
    target.current = Math.round(((e.clientX - left) / painted) * WIDTH);
  }
  const release = () => {
    target.current = null;
  };
  // What the cave has handed out to everyone, this player included. It shows
  // where a player actually looks — the start card, and the result of the run
  // that has just joined it. Not on the board, which is about who did best.
  // It stays away until the number is in.
  const totalLine =
    total === null ? null : (
      <p className="total-line">
        <strong>{total.toLocaleString('ja-JP')}</strong> 枚 みんなでたべた
      </p>
    );
  return (
    <section className="game-shell" aria-label="しるこさんぽ">
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
              if (sound.current) tone('snack');
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
        className={`playfield ${mode === 'over' ? 'crashed' : mode}`}
        ref={field}
        tabIndex={-1}
        onPointerDown={(e) => {
          if (game.current.mode !== 'playing') return;
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
        <div className="cave-light" />
        <canvas
          ref={canvas}
          width={WIDTH}
          height={HEIGHT}
          aria-label="上から流れる岩をよけて、しるこサンドを集めるゲーム"
        />
        <div className="darkness" />
        {mode === 'ready' && (
          <div className="start-card with-sprite">
            <NextImage
              className="sprite-preview"
              src={withBase('/mermaid-rough.png')}
              alt=""
              width={108}
              height={108}
              priority
            />
            <span className="tiny-caps">IN THE HIDDEN CAVE</span>
            <h2>サクサク……</h2>
            <p>
              岩をよけて、しるこサンドを集めよう。
              <br />
              ウロコを拾うと、サクサクタイム。
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
              <>
                {best.score > 0 && (
                  <p className="best-line">
                    自己ベスト <strong>{best.score}</strong> pt
                  </p>
                )}
                {totalLine}
                <span className="start-hint">← → で移動・スマホはスワイプ</span>
              </>
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
              すすみつづける
            </button>
            <span className="start-hint">Space / Esc キーでも再開</span>
          </div>
        )}
        {mode === 'over' && shot && (
          <div className="start-card over-card">
            <span className="tiny-caps">SAVE</span>
            {/* eslint-disable-next-line next/no-img-element -- a blob
                made a moment ago, with nothing for a loader to do */}
            <img className="result-shot" src={shot.url} alt="リザルト画像" />
            <p className="shot-hint">
              {shot.touch
                ? '長押し、または下のボタンで保存'
                : '右クリックか、下のボタンで保存'}
            </p>
            {shot.touch ? (
              <button
                className="save-button"
                onClick={() => offerShot(shot.file)}
              >
                <Download size={17} />
                保存する
              </button>
            ) : (
              <a
                className="save-button"
                href={shot.url}
                download={`しるこさんぽ-${score}pt.png`}
              >
                <Download size={17} />
                ダウンロード
              </a>
            )}
            <button
              ref={primary}
              className="primary-button"
              onClick={closeShot}
            >
              とじる
            </button>
          </div>
        )}
        {mode === 'over' && !shot && rankOpen && (
          <div className="start-card over-card">
            <span className="tiny-caps">ランキングに登録</span>
            {posted ? (
              <p className="shot-hint">
                {kept ? 'まえの記録のほうが上でした。' : 'のせました。'}
              </p>
            ) : (
              <div className="rank-entry">
                <input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  maxLength={NAME_LENGTH}
                  placeholder={`なまえ（${NAME_LENGTH}文字まで）`}
                  aria-label="ランキングに載せる名前"
                />
                <button onClick={sendScore} disabled={sending || !name.trim()}>
                  {sending ? '送信中…' : '登録'}
                </button>
              </div>
            )}
            {rankError && <p className="rank-error">{rankError}</p>}
            <ol className="ranking">
              {(ranking ?? []).slice(0, PLACES).map((entry, index) => (
                <li key={`${entry.created_at}-${entry.name}`}>
                  <span>{index + 1}</span>
                  <b>{entry.name}</b>
                  <i>{entry.score}</i>
                </li>
              ))}
            </ol>
            <button
              ref={primary}
              className="primary-button"
              onClick={() => setRankOpen(false)}
            >
              とじる
            </button>
          </div>
        )}
        {mode === 'over' && !shot && !rankOpen && (
          <div className="start-card over-card">
            <span className="tiny-caps">
              {beatBest && best.score > 0 ? '自己ベスト更新！' : 'GAME OVER'}
            </span>
            <h2 className="game-over-line">{gameOverLine}</h2>
            <div className="score-result">
              <strong>{score}</strong>
              <span>pt</span>
            </div>
            <p className="eaten-line">
              しるこサンド <strong>{eaten}</strong> 枚
            </p>
            {/* A run that fell short is not worth measuring against the best
                one: the card says how it went and leaves it there. What is
                left only shows when there is something to say. */}
            {best.score > 0 && (beatBest || score === best.score) && (
              <p className="best-line">
                {beatBest
                  ? `これまでのベスト ${best.score} pt`
                  : '自己ベストに並んだ'}
              </p>
            )}
            {/* Where the number means the most: the run just ended has been
                added to it. The start card is the only other place it shows,
                and after the first run nobody goes back there. */}
            {totalLine}
            <button className="share-button" onClick={shareScoreOnX}>
              <span className="x-mark" aria-hidden="true">
                X
              </span>
              スコアをポスト
            </button>
            <div className="button-row">
              <button className="save-button" onClick={saveResultCard}>
                <Download size={17} />
                画像を保存
              </button>
              {SCORES_API !== '' && (
                <button
                  className="save-button ranking-button"
                  onClick={openRanking}
                >
                  <Trophy size={16} />
                  記録をのせる
                </button>
              )}
            </div>
            <button ref={primary} className="primary-button" onClick={start}>
              <RotateCcw size={18} />
              もういちどすすむ
            </button>
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
        {mode === 'playing' ? (
          <span>なぞって移動</span>
        ) : (
          // The footer can fall below the fold in an in-app browser, so the
          // rights notice also lives here, inside the shell.
          <a className="rights-link" href={withBase('/terms')}>
            このゲームについて
          </a>
        )}
      </div>
      <output className="sr-only" aria-live="polite">
        {mode === 'over'
          ? `ゲームオーバー。${score}点。しるこサンド${eaten}枚。`
          : mode === 'paused'
            ? '一時停止中'
            : ''}
      </output>
    </section>
  );
}
