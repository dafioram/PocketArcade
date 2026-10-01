// Kitty Chomp: a maze chase. A hungry tabby eats treats while four neighborhood dogs
// hunt her; catnip turns the tables. Ported from a standalone page into the Pocket
// Arcade shell. Rules, dog AI, sprites, sounds and touch controls are unchanged;
// the page chrome, colors and storage now come from the shared app.
import './style.css';
import { onThemeChange, palette, type Palette } from '../../core/theme';
import { defineGame } from '../../core/types';
import { FONT } from '../../lib/draw';
import { keyboard } from '../../lib/keyboard';
import { createOverlay } from '../../lib/overlay';
import { h } from '../../lib/util';
import { createAudio } from './audio';
import { COLS, MAZE, ROWS, TUNNEL_ROW } from './maze';
import * as Spr from './sprites';
import type { BonusType, Breed, Dir, DogMode } from './sprites';

type Pt = { x: number; y: number };
const DIRS: Record<Dir, Pt> = { up: { x: 0, y: -1 }, left: { x: -1, y: 0 }, down: { x: 0, y: 1 }, right: { x: 1, y: 0 } };
const ORDER: Dir[] = ['up', 'left', 'down', 'right']; // tie-break order when dogs choose a turn
const OPP: Record<Dir, Dir> = { up: 'down', down: 'up', left: 'right', right: 'left' };

const DOOR = { x: 10, y: 7 }; // tile just outside the dog-house door
const HOUSE_Y = 9; // row inside the dog house
const CAT_START = { x: 10, y: 15 };
const BONUS_SPOT = { x: 10, y: 11 };

interface DogDef {
  id: string;
  name: string;
  breed: Breed;
  voice: number;
  ai: 'chaser' | 'ambusher' | 'flanker' | 'shy';
  collar: string;
  blurb: string;
  scatter: Pt;
  home: Pt;
}
const DOGS: DogDef[] = [
  { id: 'bruno', name: 'Bruno', breed: 'bulldog', voice: 0.72, ai: 'chaser', collar: '#ff4d5e', blurb: 'Bulldog. Charges straight at you.', scatter: { x: COLS - 2, y: -3 }, home: { x: 10, y: 7 } },
  { id: 'pepper', name: 'Pepper', breed: 'poodle', voice: 1.5, ai: 'ambusher', collar: '#ff7ac8', blurb: 'Poodle. Heads you off up ahead.', scatter: { x: 1, y: -3 }, home: { x: 10, y: 9 } },
  { id: 'biscuit', name: 'Biscuit', breed: 'beagle', voice: 1.15, ai: 'flanker', collar: '#35d3e6', blurb: 'Beagle. Teams up with Bruno.', scatter: { x: COLS - 1, y: ROWS + 1 }, home: { x: 8.6, y: 9 } },
  { id: 'juno', name: 'Juno', breed: 'husky', voice: 0.92, ai: 'shy', collar: '#ffa53b', blurb: 'Husky. Loses nerve up close.', scatter: { x: 0, y: ROWS + 1 }, home: { x: 11.4, y: 9 } },
];

const BONUSES: Array<{ type: BonusType; pts: number; name: string }> = [
  { type: 'fish', pts: 100, name: 'Sardine' },
  { type: 'mouse', pts: 300, name: 'Toy mouse' },
  { type: 'yarn', pts: 500, name: 'Yarn ball' },
  { type: 'milk', pts: 700, name: 'Saucer of cream' },
  { type: 'box', pts: 1000, name: 'Cardboard box' },
  { type: 'tuna', pts: 2000, name: 'Tuna can' },
  { type: 'goldfish', pts: 3000, name: 'Goldfish' },
  { type: 'bell', pts: 5000, name: 'Golden bell' },
];

/** Theme-aware colors for everything that isn't a character sprite. */
const colorsFor = (pal: Palette) => ({
  floor: pal.surface,
  wallLine: pal.pink,
  wallFill: pal.surface2,
  door: pal.pink,
  flash: pal.text,
  treat: pal.dark ? '#f0b979' : '#d48a3c',
  ready: pal.orange,
  dogPoints: pal.teal,
  bonusPoints: pal.orange,
  life: pal.pink,
  hold: pal.orange,
});

type Phase = 'title' | 'ready' | 'play' | 'dying' | 'clear' | 'gameover';
type DogState = 'house' | 'leaving' | 'active' | 'eaten' | 'entering';

interface Mover extends Pt {
  dir: Dir | null;
}
interface Cat extends Mover {
  nextDir: Dir | null;
  facing: Dir;
  anim: number;
  holdDirs: Dir[] | null;
}
interface Dog extends Mover {
  def: DogDef;
  id: string;
  look: Dir;
  state: DogState;
  frightened: boolean;
  eatenTime: number;
  phase: number;
}

export default defineGame((ctx) => {
  const { root, signal, storage } = ctx;
  const Snd = createAudio(storage.get('muted', false));
  signal.addEventListener('abort', () => Snd.close());

  /* ------------------------------------------------------------------ DOM */
  const canvas = h('canvas', { class: 'kc-game' });
  canvas.setAttribute('aria-hidden', 'true');
  const tray = h('canvas', { class: 'kc-tray-canvas' });
  const soundBtn = h('button', { class: 'icon-btn kc-small', title: 'Sound (M)' });
  const padBtn = h('button', { class: 'icon-btn kc-small', title: 'On-screen d-pad' });
  const stageEl = h('div', { class: 'kc-stage' }, canvas, h('div', { class: 'kc-tray' }, soundBtn, tray, padBtn));
  const dirBtn = (dir: Dir, path: string) => {
    const b = h('button', { class: `kc-d kc-d-${dir}`, dataset: { dir } });
    b.setAttribute('aria-label', dir);
    b.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${path}"/></svg>`;
    return b;
  };
  const dpad = h(
    'nav',
    { class: 'kc-dpad' },
    dirBtn('up', 'M6 15l6-6 6 6'),
    dirBtn('left', 'M15 6l-6 6 6 6'),
    dirBtn('right', 'M9 6l6 6-6 6'),
    dirBtn('down', 'M6 9l6 6 6-6'),
  );
  dpad.setAttribute('aria-label', 'Direction pad');
  const wrap = h('div', { class: 'kc' }, stageEl, dpad);
  root.append(wrap);
  const overlay = createOverlay(root, signal);
  const g = canvas.getContext('2d')!;
  const tctx = tray.getContext('2d')!;

  /* ------------------------------------------------------------------ state */
  const S = {
    phase: 'title' as Phase,
    paused: false,
    level: 1,
    score: 0,
    best: storage.get<number>('best:score', 0),
    lives: 3,
    grid: [] as string[][],
    dotsLeft: 0,
    dotsEaten: 0,
    modeIdx: 0,
    modeTime: 0,
    mode: 'scatter' as 'scatter' | 'chase',
    frightTime: 0,
    frightTotal: 0,
    combo: 0,
    phaseTime: 0,
    readyDur: 2,
    freeze: 0,
    houseClock: 0,
    bonus: null as null | { type: BonusType; pts: number; time: number },
    popups: [] as Array<{ x: number; y: number; text: string; color: string; t: number }>,
    extraGiven: false,
    t: 0,
  };
  let cat!: Cat;
  let dogs: Dog[] = [];
  let C = colorsFor(palette());

  const params = () => {
    const L = S.level;
    const m = Math.min(1 + 0.05 * (L - 1), 1.3);
    return {
      cat: 6.4 * Math.min(m, 1.2),
      dog: 6.0 * m,
      fright: 3.4 * Math.min(m, 1.15),
      tunnel: 3.2 * m,
      eaten: 13,
      frightTime: [7, 6, 5, 4, 3, 3, 2.5, 2, 1.5][Math.min(L - 1, 8)],
      release: L === 1 ? [0, 1, 5, 10] : L < 4 ? [0, 1, 3, 6] : [0, 0.5, 1.5, 3],
      schedule: L === 1 ? [7, 20, 7, 20, 5, 20, 5, Infinity] : L < 5 ? [7, 20, 7, 20, 5, 60, 1, Infinity] : [5, 20, 5, 20, 5, 60, 1, Infinity],
    };
  };

  /* ------------------------------------------------------------------ grid */
  const tileAt = (c: number, r: number) => {
    if (r < 0 || r >= ROWS) return '#';
    c = ((c % COLS) + COLS) % COLS;
    return S.grid[r][c];
  };
  const blocked = (c: number, r: number) => {
    const t = tileAt(c, r);
    return t === '#' || t === '-' || t === 'G';
  };
  const inTunnel = (e: Pt) => Math.round(e.y) === TUNNEL_ROW && (e.x < 3 || e.x > COLS - 4);
  const atCenter = (e: Pt) => Math.abs(e.x - Math.round(e.x)) < 1e-6 && Math.abs(e.y - Math.round(e.y)) < 1e-6;
  const wrapX = (e: Pt) => {
    if (e.x < -0.5) e.x += COLS;
    else if (e.x >= COLS - 0.5) e.x -= COLS;
  };
  const dist = (a: Pt, b: Pt) => {
    let dx = Math.abs(a.x - b.x);
    dx = Math.min(dx, COLS - dx);
    return Math.hypot(dx, a.y - b.y);
  };

  // Move along the grid; onCenter runs each time the mover lands on a tile centre.
  function moveEntity<T extends Mover>(e: T, distance: number, onCenter: (e: T) => void) {
    let guard = 0;
    while (distance > 1e-9 && guard++ < 24) {
      if (atCenter(e)) {
        e.x = Math.round(e.x);
        e.y = Math.round(e.y);
        wrapX(e);
        onCenter(e);
        if (!e.dir) return;
        const d0 = DIRS[e.dir];
        if (blocked(e.x + d0.x, e.y + d0.y)) {
          e.dir = null;
          return;
        }
      }
      const d = DIRS[e.dir!];
      let rem: number;
      if (d.x > 0) rem = Math.floor(e.x + 1e-6) + 1 - e.x;
      else if (d.x < 0) rem = e.x - (Math.ceil(e.x - 1e-6) - 1);
      else if (d.y > 0) rem = Math.floor(e.y + 1e-6) + 1 - e.y;
      else rem = e.y - (Math.ceil(e.y - 1e-6) - 1);
      const step = Math.min(rem, distance);
      e.x += d.x * step;
      e.y += d.y * step;
      distance -= step;
      if (rem - step < 1e-6) {
        e.x = Math.round(e.x);
        e.y = Math.round(e.y);
      }
      wrapX(e);
    }
  }

  /* ------------------------------------------------------------------ setup */
  const resetActors = () => {
    cat = { x: CAT_START.x, y: CAT_START.y, dir: 'left', nextDir: null, facing: 'left', anim: 0, holdDirs: null };
    dogs = DOGS.map((D, i) => ({
      def: D,
      id: D.id,
      x: D.home.x,
      y: D.home.y,
      dir: i === 0 ? 'left' : null,
      look: i === 0 ? 'left' : i === 1 ? 'down' : 'up',
      state: i === 0 ? 'active' : 'house',
      frightened: false,
      eatenTime: 0,
      phase: i * 1.3,
    }));
    S.houseClock = 0;
    S.frightTime = 0;
    S.freeze = 0;
    S.bonus = null;
    S.modeIdx = 0;
    S.modeTime = 0;
    S.mode = 'scatter';
  };

  const startLevel = () => {
    S.grid = MAZE.map((row) => row.split(''));
    S.dotsLeft = 0;
    for (const row of S.grid) for (const ch of row) if (ch === '.' || ch === 'o') S.dotsLeft++;
    S.dotsEaten = 0;
    resetActors();
    S.phase = 'ready';
    S.phaseTime = 0;
    S.readyDur = 2;
    updateHud();
    drawTray();
  };

  const newGame = () => {
    Snd.unlock();
    S.score = 0;
    S.lives = 3;
    S.level = 1;
    S.extraGiven = false;
    S.popups = [];
    S.paused = false;
    startLevel();
    Snd.jingle();
    S.readyDur = 3; // 3, 2, 1 while the opening tune plays
    overlay.hide();
  };

  /* ------------------------------------------------------------------ rules */
  const saveBest = () => {
    if (S.score > 0) ctx.recordBest('score', S.score);
  };

  const popup = (x: number, y: number, text: string, color: string) => S.popups.push({ x, y, text, color, t: 0 });

  const addScore = (n: number) => {
    S.score += n;
    if (!S.extraGiven && S.score >= 10000) {
      S.extraGiven = true;
      S.lives++;
      Snd.extraLife();
      ctx.haptic(20);
      drawTray();
      popup(cat.x, cat.y - 1, '+1 LIFE', C.life);
    }
    if (S.score > S.best) S.best = S.score;
    updateHud();
  };

  const catOnCenter = (e: Cat) => {
    const c = Math.round(e.x);
    const r = Math.round(e.y);
    const cc = ((c % COLS) + COLS) % COLS;
    const ch = S.grid[r]?.[cc];
    if (ch === '.') {
      S.grid[r][cc] = ' ';
      S.dotsLeft--;
      S.dotsEaten++;
      addScore(10);
      Snd.chomp();
      if (S.dotsEaten === 60 || S.dotsEaten === 130) {
        const b = BONUSES[Math.min(S.level - 1, BONUSES.length - 1)];
        S.bonus = { type: b.type, pts: b.pts, time: 9.5 };
      }
    } else if (ch === 'o') {
      S.grid[r][cc] = ' ';
      S.dotsLeft--;
      addScore(50);
      startFrenzy();
    }
    if (e.holdDirs) {
      // Finger held on the maze: take the best open way toward it. Only the main
      // direction may turn the cat around; the side direction is just for corners.
      for (let i = 0; i < e.holdDirs.length; i++) {
        if (i > 0 && e.dir && e.holdDirs[i] === OPP[e.dir]) continue;
        const hd = DIRS[e.holdDirs[i]];
        if (!blocked(c + hd.x, r + hd.y)) {
          e.dir = e.holdDirs[i];
          break;
        }
      }
      e.nextDir = null;
    } else if (e.nextDir) {
      const n = DIRS[e.nextDir];
      if (!blocked(c + n.x, r + n.y)) {
        e.dir = e.nextDir;
        e.nextDir = null;
      }
    }
    if (e.dir) {
      const d = DIRS[e.dir];
      if (blocked(c + d.x, r + d.y)) {
        e.facing = e.dir;
        e.dir = null;
      }
    }
  };

  const startFrenzy = () => {
    const p = params();
    S.frightTotal = p.frightTime;
    S.frightTime = p.frightTime;
    S.combo = 0;
    Snd.catnip();
    ctx.haptic(15);
    for (const d of dogs) {
      if (d.state === 'eaten' || d.state === 'entering') continue;
      d.frightened = true;
      if (d.state === 'active' && d.dir) d.dir = OPP[d.dir];
    }
  };

  const targetFor = (d: Dog): Pt => {
    if (d.state === 'eaten') return DOOR;
    if (S.mode === 'scatter') return d.def.scatter;
    const pc = { x: Math.round(cat.x), y: Math.round(cat.y) };
    const pd = DIRS[cat.dir ?? cat.facing];
    switch (d.def.ai) {
      case 'ambusher':
        return { x: pc.x + pd.x * 3, y: pc.y + pd.y * 3 };
      case 'flanker': {
        const a = { x: pc.x + pd.x * 2, y: pc.y + pd.y * 2 };
        const b = dogs[0];
        return { x: 2 * a.x - Math.round(b.x), y: 2 * a.y - Math.round(b.y) };
      }
      case 'shy':
        return dist(d, cat) > 6 ? pc : d.def.scatter;
      default:
        return pc;
    }
  };

  const dogOnCenter = (d: Dog) => {
    const c = Math.round(d.x);
    const r = Math.round(d.y);
    if (d.state === 'eaten' && c === DOOR.x && r === DOOR.y) {
      d.state = 'entering';
      d.dir = null;
      d.x = DOOR.x;
      d.y = DOOR.y;
      return;
    }
    const opts = ORDER.filter((k) => k !== (d.dir ? OPP[d.dir] : null) && !blocked(c + DIRS[k].x, r + DIRS[k].y));
    if (!opts.length) {
      d.dir = d.dir ? OPP[d.dir] : null;
      return;
    }
    if (d.frightened && d.state === 'active') {
      d.dir = opts[Math.floor(Math.random() * opts.length)];
      return;
    }
    const tg = targetFor(d);
    let best = opts[0];
    let bd = Infinity;
    for (const k of opts) {
      const nx = c + DIRS[k].x;
      const ny = r + DIRS[k].y;
      const dd = (nx - tg.x) ** 2 + (ny - tg.y) ** 2;
      if (dd < bd - 1e-9) {
        bd = dd;
        best = k;
      }
    }
    d.dir = best;
  };

  const updateDog = (d: Dog, dt: number, p: ReturnType<typeof params>) => {
    switch (d.state) {
      case 'house':
        break;
      case 'leaving': {
        const sp = (d.frightened ? p.fright : p.dog) * 0.6 * dt;
        if (Math.abs(d.x - DOOR.x) > 1e-3) {
          const dx = DOOR.x - d.x;
          d.x += Math.sign(dx) * Math.min(sp, Math.abs(dx));
          d.look = dx > 0 ? 'right' : 'left';
        } else if (d.y > DOOR.y) {
          d.x = DOOR.x;
          d.y = Math.max(DOOR.y, d.y - sp);
          d.look = 'up';
        } else {
          d.x = DOOR.x;
          d.y = DOOR.y;
          d.state = 'active';
          d.dir = Math.random() < 0.5 ? 'left' : 'right';
          d.look = d.dir;
        }
        break;
      }
      case 'active': {
        let s = d.frightened ? p.fright : p.dog;
        if (inTunnel(d)) s = Math.min(s, p.tunnel);
        else if (d.id === 'bruno' && !d.frightened && S.dotsLeft <= 20) s *= 1.1;
        moveEntity(d, s * dt, dogOnCenter);
        if (d.dir) d.look = d.dir;
        break;
      }
      case 'eaten':
        d.eatenTime += dt;
        if (d.eatenTime > 12) {
          d.x = DOOR.x;
          d.y = DOOR.y;
          d.state = 'entering';
          d.dir = null;
          break;
        }
        moveEntity(d, p.eaten * dt, dogOnCenter);
        if (d.dir) d.look = d.dir;
        break;
      case 'entering':
        d.look = 'down';
        if (d.y < HOUSE_Y) d.y = Math.min(HOUSE_Y, d.y + p.eaten * 0.4 * dt);
        else {
          d.state = 'leaving';
          d.frightened = false;
        }
        break;
    }
  };

  const playStep = (dt: number) => {
    const p = params();

    if (S.frightTime > 0) {
      S.frightTime -= dt;
      if (S.frightTime <= 0) {
        S.frightTime = 0;
        for (const d of dogs) d.frightened = false;
      }
    } else {
      S.modeTime += dt;
      if (S.modeTime >= p.schedule[S.modeIdx]) {
        S.modeTime = 0;
        S.modeIdx++;
        S.mode = S.modeIdx % 2 === 0 ? 'scatter' : 'chase';
        for (const d of dogs) if (d.state === 'active' && d.dir) d.dir = OPP[d.dir];
      }
    }

    S.houseClock += dt;
    dogs.forEach((d, i) => {
      if (d.state === 'house' && S.houseClock >= p.release[i]) d.state = 'leaving';
    });

    if (cat.nextDir && cat.dir && cat.nextDir === OPP[cat.dir]) {
      cat.dir = cat.nextDir;
      cat.nextDir = null;
    }
    if (cat.holdDirs && cat.dir && cat.holdDirs[0] === OPP[cat.dir]) cat.dir = cat.holdDirs[0];
    if (cat.dir || cat.nextDir || cat.holdDirs) {
      const cs = S.frightTime > 0 ? p.cat * 1.08 : p.cat;
      moveEntity(cat, cs * dt, catOnCenter);
    }
    if (cat.dir) {
      cat.facing = cat.dir;
      cat.anim += dt * 16;
    }

    for (const d of dogs) updateDog(d, dt, p);

    // Collisions
    for (const d of dogs) {
      if (d.state !== 'active' && d.state !== 'leaving') continue;
      if (dist(cat, d) < 0.62) {
        if (d.frightened) {
          S.combo++;
          const pts = 200 * Math.pow(2, Math.min(S.combo, 4) - 1);
          addScore(pts);
          popup(d.x, d.y, String(pts), C.dogPoints);
          d.state = 'eaten';
          d.frightened = false;
          d.eatenTime = 0;
          d.x = Math.round(d.x);
          d.y = Math.round(d.y);
          if (!d.dir) d.dir = 'up';
          if (blocked(d.x + DIRS[d.dir].x, d.y + DIRS[d.dir].y)) {
            d.dir = ORDER.find((k) => !blocked(d.x + DIRS[k].x, d.y + DIRS[k].y)) ?? null;
          }
          S.freeze = 0.5;
          Snd.yelp();
          ctx.haptic(12);
          return;
        }
        die(d);
        return;
      }
    }

    if (S.bonus) {
      S.bonus.time -= dt;
      if (S.bonus.time <= 0) S.bonus = null;
      else if (dist(cat, BONUS_SPOT) < 0.6) {
        addScore(S.bonus.pts);
        popup(BONUS_SPOT.x, BONUS_SPOT.y, String(S.bonus.pts), C.bonusPoints);
        S.bonus = null;
        Snd.bonus();
      }
    }

    if (S.dotsLeft <= 0) {
      S.phase = 'clear';
      S.phaseTime = 0;
      S.bonus = null;
      S.frightTime = 0;
      saveBest();
      Snd.levelClear();
    }
  };

  const die = (byDog: Dog | null) => {
    S.phase = 'dying';
    S.phaseTime = 0;
    S.lives--;
    S.bonus = null;
    S.frightTime = 0;
    if (byDog) popup(byDog.x, byDog.y - 0.7, 'WOOF!', byDog.def.collar);
    Snd.death(byDog ? byDog.def.voice : 1);
    ctx.haptic(80);
  };

  const update = (dt: number) => {
    S.t += dt;
    for (const p of S.popups) p.t += dt;
    S.popups = S.popups.filter((p) => p.t < 1.1);
    applyHold();
    if (S.paused || S.phase === 'title' || S.phase === 'gameover') return;
    S.phaseTime += dt;

    if (S.phase === 'ready') {
      if (S.phaseTime >= S.readyDur) {
        S.phase = 'play';
        S.phaseTime = 0;
        Snd.bark();
      }
    } else if (S.phase === 'play') {
      if (S.freeze > 0) {
        S.freeze -= dt;
        return;
      }
      const n = Math.max(1, Math.ceil(dt / (1 / 120)));
      for (let i = 0; i < n && S.phase === 'play' && S.freeze <= 0; i++) playStep(dt / n);
    } else if (S.phase === 'dying') {
      if (S.phaseTime >= 1.9) {
        if (S.lives <= 0) gameOver();
        else {
          resetActors();
          S.phase = 'ready';
          S.phaseTime = 0;
          S.readyDur = 2;
          drawTray();
        }
      }
    } else if (S.phase === 'clear') {
      if (S.phaseTime >= 2.4) {
        S.level++;
        startLevel();
      }
    }
  };

  const gameOver = () => {
    S.phase = 'gameover';
    const prevBest = storage.get<number>('best:score', 0);
    saveBest();
    drawTray();
    updateHud();
    overlay.show({
      title: 'Game over',
      body: `Final score ${S.score.toLocaleString()}\n${S.score > prevBest && S.score > 0 ? 'New best score!' : `Best so far: ${Math.max(prevBest, S.score).toLocaleString()}`}`,
      actions: [{ label: 'Play again', primary: true, onClick: newGame }],
    });
  };

  /* ------------------------------------------------------------------ rendering */
  let T = 16;
  let dpr = 1;
  let mazeImg: HTMLCanvasElement | null = null;
  let mazeFlash: HTMLCanvasElement | null = null;

  const rr = (gx: CanvasRenderingContext2D, x: number, y: number, w: number, hh: number, r: number[]) => {
    gx.beginPath();
    gx.moveTo(x + r[0], y);
    gx.lineTo(x + w - r[1], y);
    if (r[1]) gx.arcTo(x + w, y, x + w, y + r[1], r[1]);
    else gx.lineTo(x + w, y);
    gx.lineTo(x + w, y + hh - r[2]);
    if (r[2]) gx.arcTo(x + w, y + hh, x + w - r[2], y + hh, r[2]);
    else gx.lineTo(x + w, y + hh);
    gx.lineTo(x + r[3], y + hh);
    if (r[3]) gx.arcTo(x, y + hh, x, y + hh - r[3], r[3]);
    else gx.lineTo(x, y + hh);
    gx.lineTo(x, y + r[0]);
    if (r[0]) gx.arcTo(x, y, x + r[0], y, r[0]);
    else gx.lineTo(x, y);
    gx.closePath();
  };

  const buildMaze = (line: string, fill: string) => {
    const c = document.createElement('canvas');
    c.width = Math.round(COLS * T * dpr);
    c.height = Math.round(ROWS * T * dpr);
    const m = c.getContext('2d')!;
    m.scale(dpr, dpr);
    const Wl = (x: number, y: number) => {
      if (y < 0 || y >= ROWS) return true;
      if (x < 0 || x >= COLS) return y !== TUNNEL_ROW;
      return MAZE[y][x] === '#';
    };
    const R = T * 0.45;
    const ins = Math.max(1.5, T * 0.15);
    const Ri = Math.max(0, R - ins);
    m.fillStyle = line;
    for (let y = 0; y < ROWS; y++)
      for (let x = 0; x < COLS; x++) {
        if (!Wl(x, y)) continue;
        const u = Wl(x, y - 1), dn = Wl(x, y + 1), l = Wl(x - 1, y), rt = Wl(x + 1, y);
        rr(m, x * T, y * T, T, T, [!u && !l ? R : 0, !u && !rt ? R : 0, !dn && !rt ? R : 0, !dn && !l ? R : 0]);
        m.fill();
      }
    m.fillStyle = fill;
    for (let y = 0; y < ROWS; y++)
      for (let x = 0; x < COLS; x++) {
        if (!Wl(x, y)) continue;
        const u = Wl(x, y - 1), d = Wl(x, y + 1), l = Wl(x - 1, y), r = Wl(x + 1, y);
        const x0 = x * T + (l ? 0 : ins), x1 = x * T + T - (r ? 0 : ins);
        const y0 = y * T + (u ? 0 : ins), y1 = y * T + T - (d ? 0 : ins);
        rr(m, x0, y0, x1 - x0, y1 - y0, [!u && !l ? Ri : 0, !u && !r ? Ri : 0, !d && !r ? Ri : 0, !d && !l ? Ri : 0]);
        m.fill();
      }
    m.fillStyle = line;
    for (let y = 0; y < ROWS; y++)
      for (let x = 0; x < COLS; x++) {
        if (!Wl(x, y)) continue;
        const U = Wl(x, y - 1), D = Wl(x, y + 1), L = Wl(x - 1, y), Rr = Wl(x + 1, y), px = x * T, py = y * T;
        if (U && L && !Wl(x - 1, y - 1)) m.fillRect(px, py, ins, ins);
        if (U && Rr && !Wl(x + 1, y - 1)) m.fillRect(px + T - ins, py, ins, ins);
        if (D && L && !Wl(x - 1, y + 1)) m.fillRect(px, py + T - ins, ins, ins);
        if (D && Rr && !Wl(x + 1, y + 1)) m.fillRect(px + T - ins, py + T - ins, ins, ins);
      }
    // Dog-house door
    for (let y = 0; y < ROWS; y++)
      for (let x = 0; x < COLS; x++) {
        if (MAZE[y][x] === '-') {
          m.fillStyle = C.door;
          m.globalAlpha = 0.6;
          m.fillRect(x * T - 1, y * T + T * 0.4, T + 2, T * 0.2);
          m.globalAlpha = 1;
        }
      }
    return c;
  };

  const rebuildMaze = () => {
    C = colorsFor(palette());
    mazeImg = buildMaze(C.wallLine, C.wallFill);
    mazeFlash = buildMaze(C.flash, C.wallFill);
    drawTray();
  };

  const TRAY_H = 36;
  const resize = () => {
    const w = stageEl.clientWidth - 8;
    const hh = stageEl.clientHeight - TRAY_H - 10;
    const nt = Math.max(8, Math.floor(Math.min(w / COLS, hh / ROWS)));
    const nd = Math.min(window.devicePixelRatio || 1, 3);
    if (nt === T && nd === dpr && mazeImg) return;
    T = nt;
    dpr = nd;
    canvas.width = Math.round(COLS * T * dpr);
    canvas.height = Math.round(ROWS * T * dpr);
    canvas.style.width = `${COLS * T}px`;
    canvas.style.height = `${ROWS * T}px`;
    rebuildMaze();
  };

  const eachWrap = (x: number, fn: (x: number) => void) => {
    fn(x);
    if (x < 1) fn(x + COLS);
    else if (x > COLS - 2) fn(x - COLS);
  };

  const dogMode = (d: Dog): DogMode => {
    if (d.state === 'eaten' || d.state === 'entering') return 'eyes';
    if (!d.frightened) return 'normal';
    const flashWindow = Math.min(2, S.frightTotal * 0.4);
    if (S.frightTime < flashWindow && Math.floor(S.frightTime * 5) % 2 === 0) return 'flash';
    return 'scared';
  };

  const render = () => {
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = C.floor;
    g.fillRect(0, 0, COLS * T, ROWS * T);
    const flash = S.phase === 'clear' && S.phaseTime > 0.5 && Math.floor((S.phaseTime - 0.5) * 5) % 2 === 0;
    if (mazeImg && mazeFlash) g.drawImage(flash ? mazeFlash : mazeImg, 0, 0, COLS * T, ROWS * T);
    if (!S.grid.length) return;

    for (let r = 0; r < ROWS; r++)
      for (let c = 0; c < COLS; c++) {
        const ch = S.grid[r][c];
        if (ch === '.') Spr.treat(g, (c + 0.5) * T, (r + 0.5) * T, T, C.treat);
        else if (ch === 'o') Spr.catnip(g, (c + 0.5) * T, (r + 0.5) * T, T, S.t);
      }

    if (S.bonus && !(S.bonus.time < 2 && Math.floor(S.bonus.time * 6) % 2)) {
      Spr.bonus(g, S.bonus.type, (BONUS_SPOT.x + 0.5) * T, (BONUS_SPOT.y + 0.5) * T, T * 0.62);
    }

    const showDogs = !(S.phase === 'dying' && S.phaseTime > 0.6) && S.phase !== 'clear';
    if (showDogs) {
      for (const d of dogs) {
        let y = d.y;
        if (d.state === 'house') y += Math.sin(S.t * 5 + d.phase) * 0.18;
        const mode = dogMode(d);
        eachWrap(d.x, (x) => Spr.dog(g, (x + 0.5) * T, (y + 0.5) * T, T * 0.6, d.def.breed, d.look, S.t + d.phase, mode, d.def.collar));
      }
    }

    let mouth = cat.dir && S.phase === 'play' ? (Math.sin(cat.anim) + 1) / 2 : 0.35;
    let opt: Spr.CatOpts = {};
    if (S.phase === 'dying') {
      const k = Math.min(1, S.phaseTime / 1.5);
      opt = { spin: k * Math.PI * 4, scale: Math.max(0.01, 1 - k), dead: true };
      mouth = 0;
    }
    if (holdView && (S.phase === 'play' || S.phase === 'ready')) drawHold();
    if (S.phase !== 'dying' || S.phaseTime < 1.5) {
      eachWrap(cat.x, (x) => Spr.cat(g, (x + 0.5) * T, (cat.y + 0.5) * T, T * 0.62, cat.facing, mouth, opt));
    }

    g.textAlign = 'center';
    g.textBaseline = 'middle';
    for (const p of S.popups) {
      g.globalAlpha = Math.max(0, 1 - p.t / 1.1);
      g.font = `800 ${Math.round(T * 0.7)}px ${FONT}`;
      g.fillStyle = p.color;
      g.fillText(p.text, (p.x + 0.5) * T, (p.y + 0.5 - p.t * 0.8) * T);
    }
    g.globalAlpha = 1;

    // Countdown while everyone waits to start: 3… 2… 1… then a quick "Go!"
    const cx = (BONUS_SPOT.x + 0.5) * T;
    const cy = (BONUS_SPOT.y + 0.55) * T;
    if (S.phase === 'ready') {
      const left = Math.max(0, S.readyDur - S.phaseTime);
      const n = Math.max(1, Math.ceil(left));
      const frac = left - Math.floor(left); // 1 → 0 within each second
      const pop = S.paused ? 1 : 1 + 0.35 * Math.max(0, frac - 0.7) / 0.3;
      g.save();
      g.translate(cx, cy);
      g.scale(pop, pop);
      g.globalAlpha = S.paused ? 1 : 0.35 + 0.65 * Math.min(1, frac / 0.25 + (frac === 0 ? 1 : 0));
      g.font = `800 ${Math.round(T * 1.25)}px ${FONT}`;
      g.fillStyle = C.ready;
      g.fillText(String(n), 0, 0);
      g.restore();
    } else if (S.phase === 'play' && S.phaseTime < 0.6) {
      g.globalAlpha = 1 - S.phaseTime / 0.6;
      g.font = `800 ${Math.round(T * 1.1)}px ${FONT}`;
      g.fillStyle = C.ready;
      g.fillText('Go!', cx, cy - S.phaseTime * T);
      g.globalAlpha = 1;
    }
  };

  const drawHold = () => {
    if (!holdView) return;
    const rect = canvas.getBoundingClientRect();
    const fx = holdView.x - rect.left;
    const fy = holdView.y - rect.top;
    g.save();
    g.globalAlpha = 0.35;
    g.strokeStyle = C.hold;
    g.lineWidth = Math.max(1.5, T * 0.1);
    g.beginPath();
    g.arc(fx, fy, T * 0.9, 0, Math.PI * 2);
    g.stroke();
    const d = DIRS[holdView.dir];
    const cx = (cat.x + 0.5 + d.x * 1.05) * T;
    const cy = (cat.y + 0.5 + d.y * 1.05) * T;
    const s = T * 0.28;
    g.globalAlpha = 0.9;
    g.translate(cx, cy);
    g.rotate(Math.atan2(d.y, d.x));
    g.beginPath();
    g.moveTo(-s * 0.6, -s);
    g.lineTo(s * 0.6, 0);
    g.lineTo(-s * 0.6, s);
    g.lineCap = 'round';
    g.lineJoin = 'round';
    g.stroke();
    g.restore();
  };

  /** Spare lives on the left, recent levels' goodies on the right. */
  const drawTray = () => {
    const w = Math.max(100, (canvas.clientWidth || COLS * T) - 2 * 40 - 12);
    const hh = 28;
    const d = Math.min(window.devicePixelRatio || 1, 3);
    tray.width = Math.round(w * d);
    tray.height = Math.round(hh * d);
    tray.style.width = `${w}px`;
    tray.style.height = `${hh}px`;
    tctx.setTransform(d, 0, 0, d, 0, 0);
    tctx.clearRect(0, 0, w, hh);
    const reserve = Math.max(0, S.lives - (S.phase === 'dying' || S.phase === 'gameover' ? 0 : 1));
    for (let i = 0; i < Math.min(reserve, 6); i++) Spr.cat(tctx, 14 + i * 26, hh / 2 + 2, 9, 'right', 0.3);
    const first = Math.max(1, S.level - 6);
    for (let L = S.level, j = 0; L >= first; L--, j++) {
      const b = BONUSES[Math.min(L - 1, BONUSES.length - 1)];
      Spr.bonus(tctx, b.type, w - 14 - j * 28, hh / 2, 10);
    }
  };

  /* ------------------------------------------------------------------ header stats */
  let lastStats = '';
  function updateHud() {
    const key = `${S.score}|${S.best}|${S.level}`;
    if (key === lastStats) return;
    lastStats = key;
    ctx.setStats([
      { label: 'Score', value: S.score.toLocaleString() },
      { label: 'Best', value: Math.max(S.best, S.score).toLocaleString() },
      { label: 'Level', value: S.level },
    ]);
  }

  /* ------------------------------------------------------------------ title card */
  const smallCanvas = (size: number, draw: (c: CanvasRenderingContext2D, s: number) => void) => {
    const c = document.createElement('canvas');
    const d = Math.min(window.devicePixelRatio || 1, 3);
    c.width = size * d;
    c.height = size * d;
    c.style.width = `${size}px`;
    c.style.height = `${size}px`;
    const cg = c.getContext('2d')!;
    cg.scale(d, d);
    draw(cg, size);
    return c;
  };

  const titleContent = () => {
    const cast = h(
      'ul',
      { class: 'kc-cast' },
      ...DOGS.map((D) => {
        const name = h('b', { textContent: D.name });
        name.style.color = D.collar;
        return h(
          'li',
          {},
          smallCanvas(40, (c, s) => Spr.dog(c, s / 2, s / 2 - 2, 14, D.breed, 'down', 0, 'normal', D.collar)),
          h('div', {}, name, h('span', { textContent: D.blurb })),
        );
      }),
    );
    const item = (draw: (c: CanvasRenderingContext2D, s: number) => void, label: string, pts: string) =>
      h('li', {}, smallCanvas(26, draw), h('span', { textContent: label }), h('em', { textContent: pts }));
    const legend = h(
      'ul',
      { class: 'kc-legend' },
      item((c, s) => Spr.treat(c, s / 2, s / 2, 32, C.treat), 'Treat', '10'),
      item((c, s) => Spr.catnip(c, s / 2, s / 2, 24, 0), 'Catnip', '50'),
      item((c, s) => Spr.dog(c, s / 2, s / 2 - 1, 9.5, 'beagle', 'down', 0, 'scared', '#35d3e6'), 'Scared dog', '200+'),
      item((c, s) => Spr.bonus(c, 'fish', s / 2, s / 2, 9.5), 'Goodies', '100+'),
    );
    return h('div', { class: 'kc-title' }, h('div', { class: 'kc-label', textContent: 'The neighborhood dogs' }), cast, legend);
  };

  const showTitle = () => {
    overlay.show({
      title: 'Kitty Chomp',
      body: 'Eat every treat. Grab catnip. Make the dogs run.',
      content: titleContent(),
      wide: true,
      actions: [{ label: 'Play', primary: true, onClick: newGame }],
    });
  };

  const startPreview = () => {
    S.level = 1;
    S.score = 0;
    S.lives = 3;
    startLevel();
    S.phase = 'title';
    updateHud();
    drawTray();
  };

  /* ------------------------------------------------------------------ input */
  const steer = (dir: Dir) => {
    if (!cat || S.paused) return;
    if (S.phase === 'play' || S.phase === 'ready') cat.nextDir = dir;
  };

  const KEYMAP: Record<string, Dir> = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', w: 'up', s: 'down', a: 'left', d: 'right' };
  keyboard(signal, (e) => {
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    if (KEYMAP[k]) return steer(KEYMAP[k]);
    if (k === 'p' || k === 'Escape') {
      if (S.paused) resume();
      else pause();
    } else if (k === 'm') toggleMute();
  });

  // Touch on the maze does one of two things, decided in the first moment:
  //  - a quick flick is a swipe (turn that way; a long drag can make several turns)
  //  - press and hold is "go that way": the cat heads toward the side of itself where
  //    the finger is and keeps taking that turn whenever it opens up. Sliding re-aims.
  // A mouse press-and-hold works the same way on desktop.
  const HOLD_DELAY = 140;
  const SWIPE_PX = 18;
  let touch: null | {
    id: number; x: number; y: number; sx: number; sy: number; t0: number;
    mode: 'pending' | 'hold' | 'swipe'; dirs: Dir[] | null; ax: number | null; ay: number | null;
  } = null;
  let holdView: null | { x: number; y: number; dir: Dir } = null;
  let dpadHeld: Dir | null = null;

  const aimHold = () => {
    if (!touch) return;
    const rect = canvas.getBoundingClientRect();
    const fx = (touch.x - rect.left) / T - 0.5;
    const fy = (touch.y - rect.top) / T - 0.5;
    const dx = fx - cat.x;
    const dy = fy - cat.y;
    const ax = Math.abs(dx);
    const ay = Math.abs(dy);
    touch.ax = touch.x;
    touch.ay = touch.y;
    if (ax < 0.5 && ay < 0.5) return; // finger right on the cat: keep the last aim
    const hz: Dir = dx > 0 ? 'right' : 'left';
    const vt: Dir = dy > 0 ? 'down' : 'up';
    const list: Dir[] = ax >= ay ? [hz] : [vt];
    if (Math.min(ax, ay) >= 0.5) list.push(ax >= ay ? vt : hz);
    touch.dirs = list;
  };

  function applyHold() {
    holdView = null;
    if (!cat) return;
    cat.holdDirs = null;
    const live = !S.paused && (S.phase === 'play' || S.phase === 'ready');
    if (dpadHeld && live) cat.nextDir = dpadHeld;
    if (!touch) return;
    if (touch.mode === 'pending' && performance.now() - touch.t0 >= HOLD_DELAY) touch.mode = 'hold';
    if (touch.mode !== 'hold' || !live) return;
    const moved = touch.ax == null || Math.hypot(touch.x - touch.ax, touch.y - (touch.ay ?? 0)) > T * 0.6;
    if (moved) aimHold();
    if (!touch.dirs) return;
    cat.holdDirs = touch.dirs;
    holdView = { x: touch.x, y: touch.y, dir: touch.dirs[0] };
  }

  stageEl.addEventListener(
    'pointerdown',
    (e) => {
      if ((e.target as HTMLElement).closest('button')) return;
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      Snd.unlock();
      touch = {
        id: e.pointerId, x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, t0: performance.now(),
        mode: e.pointerType === 'mouse' ? 'hold' : 'pending', dirs: null, ax: null, ay: null,
      };
      try {
        stageEl.setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
    },
    { signal },
  );
  stageEl.addEventListener(
    'pointermove',
    (e) => {
      if (!touch || e.pointerId !== touch.id) return;
      touch.x = e.clientX;
      touch.y = e.clientY;
      if (touch.mode === 'hold') return;
      const dx = e.clientX - touch.sx;
      const dy = e.clientY - touch.sy;
      if (Math.max(Math.abs(dx), Math.abs(dy)) < SWIPE_PX) return;
      touch.mode = 'swipe';
      steer(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up');
      touch.sx = e.clientX;
      touch.sy = e.clientY;
    },
    { signal },
  );
  for (const t of ['pointerup', 'pointercancel'] as const) {
    stageEl.addEventListener(
      t,
      (e) => {
        if (touch && e.pointerId === touch.id) touch = null;
      },
      { signal },
    );
  }
  stageEl.addEventListener('contextmenu', (e) => e.preventDefault(), { signal });

  // D-pad: tap to queue a turn, or hold a button to keep asking for that way.
  dpad.querySelectorAll<HTMLButtonElement>('[data-dir]').forEach((b) => {
    const dir = b.dataset.dir as Dir;
    b.addEventListener(
      'pointerdown',
      (e) => {
        e.preventDefault();
        Snd.unlock();
        dpadHeld = dir;
        steer(dir);
        try {
          b.setPointerCapture(e.pointerId);
        } catch {
          /* ignore */
        }
      },
      { signal },
    );
    for (const t of ['pointerup', 'pointercancel', 'lostpointercapture'] as const) {
      b.addEventListener(
        t,
        () => {
          if (dpadHeld === dir) dpadHeld = null;
        },
        { signal },
      );
    }
    b.addEventListener('contextmenu', (e) => e.preventDefault(), { signal });
  });

  /* ------------------------------------------------------------------ sound + d-pad toggles */
  const SOUND_ON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor"/><path d="M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
  const SOUND_OFF = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor"/><path d="M16 9l6 6M22 9l-6 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
  const PAD = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 3h6v6h6v6h-6v6H9v-6H3V9h6z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>';

  function syncMute() {
    const m = Snd.isMuted();
    soundBtn.innerHTML = m ? SOUND_OFF : SOUND_ON;
    soundBtn.setAttribute('aria-label', m ? 'Turn sound on' : 'Mute sound');
    soundBtn.setAttribute('aria-pressed', String(m));
    soundBtn.classList.toggle('off', m);
  }
  function toggleMute() {
    Snd.unlock();
    Snd.setMuted(!Snd.isMuted());
    storage.set('muted', Snd.isMuted());
    syncMute();
  }
  soundBtn.onclick = toggleMute;

  let padOn = storage.get('pad', ctx.isTouch);
  const syncPad = () => {
    wrap.classList.toggle('kc-has-pad', padOn);
    padBtn.innerHTML = PAD;
    padBtn.setAttribute('aria-pressed', String(padOn));
    padBtn.setAttribute('aria-label', padOn ? 'Hide the d-pad' : 'Show the d-pad');
    padBtn.classList.toggle('off', !padOn);
    requestAnimationFrame(resize);
  };
  padBtn.hidden = !ctx.isTouch;
  padBtn.onclick = () => {
    padOn = !padOn;
    storage.set('pad', padOn);
    syncPad();
  };

  /* ------------------------------------------------------------------ boot */
  const ro = new ResizeObserver(() => resize());
  ro.observe(stageEl);
  signal.addEventListener('abort', () => ro.disconnect());
  onThemeChange(() => {
    rebuildMaze();
    if (S.phase === 'title' && overlay.visible) showTitle();
  }, signal);

  let raf = 0;
  let last = performance.now();
  const frame = (now: number) => {
    const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
    last = now;
    update(dt);
    render();
    raf = requestAnimationFrame(frame);
  };
  signal.addEventListener('abort', () => cancelAnimationFrame(raf));

  startPreview();
  syncMute();
  syncPad();
  resize();
  showTitle();
  raf = requestAnimationFrame(frame);

  if (import.meta.env.DEV) {
    (window as unknown as Record<string, unknown>).__kitty = { S, get cat() { return cat; }, get dogs() { return dogs; }, newGame, steer };
  }

  /* ------------------------------------------------------------------ pause */
  function pause() {
    if (S.phase === 'title' || S.phase === 'gameover' || S.paused) return;
    S.paused = true;
    touch = null;
    dpadHeld = null;
    overlay.show({
      title: 'Paused',
      body: 'The dogs are waiting. Take your time.',
      actions: [
        {
          label: 'Quit to title',
          onClick: () => {
            S.paused = false;
            saveBest();
            startPreview();
            showTitle();
          },
        },
        { label: 'Resume', primary: true, onClick: resume },
      ],
    });
  }
  function resume() {
    if (!S.paused) return;
    S.paused = false;
    overlay.hide();
  }

  return {
    pause,
    resume,
    isPaused: () => S.paused,
    destroy: () => saveBest(),
  };
});
