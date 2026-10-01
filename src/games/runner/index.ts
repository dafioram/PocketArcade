// Rooftop Runner: an endless runner with two moves, jump and duck.
// Ported from a standalone page into the Pocket Arcade shell, with tightened controls
// (instant swipes, short hold-to-jump, jump buffering and a little "coyote time"),
// fixed overhead-bar and building-wall collisions, and a steadier skyline.
import { palette, type Palette } from '../../core/theme';
import { defineGame } from '../../core/types';
import { burst, drawParticles, roundRect, text, updateParticles, type Particle } from '../../lib/draw';
import { gestures } from '../../lib/gestures';
import { keyboard } from '../../lib/keyboard';
import { loop } from '../../lib/loop';
import { createOverlay } from '../../lib/overlay';
import { createStage } from '../../lib/stage';
import { clamp, rand } from '../../lib/util';

// Physics (logical units per second)
const GRAVITY = 2100;
const JUMP_V = -690;
const FAST_FALL = 2600; // extra gravity while ducking in the air
const STAND_H = 54;
const DUCK_H = 30;
const PLAYER_W = 25;
const COYOTE = 0.09; // seconds you can still jump after running off an edge
const BUFFER = 0.14; // a jump pressed this soon before landing still happens
const MIN_DUCK = 0.35; // a quick swipe-down still ducks this long
const HOLD_TO_JUMP_MS = 110;

interface Segment { x: number; w: number; top: number; seed: number }
interface Obstacle { type: 'crate' | 'bar'; x: number; w: number; top: number }

export default defineGame((ctx) => {
  const { root, signal } = ctx;
  const stage = createStage(root, { minWidth: 440, minHeight: 320 }, signal);
  const overlay = createOverlay(root, signal);

  type Phase = 'ready' | 'playing' | 'paused' | 'crashed' | 'over';
  let phase: Phase = 'ready';
  let segments: Segment[] = [];
  let obstacles: Obstacle[] = [];
  const particles: Particle[] = [];
  let scroll = 0;
  let speed = 300;
  let dist = 0;
  let runPhase = 0;
  let crashT = 0;
  let deathCause = '';
  // Player
  const p = { x: 0, y: 0, h: STAND_H, vy: 0, onGround: true, duck: false, sinceGround: 0, spin: 0 };
  // Input state
  let duckHeld = false;
  let duckUntil = 0; // keep ducking until this time (min duck after a quick swipe)
  let jumpBuffer = 0;
  let now = 0;

  const W = () => stage.width;
  const H = () => stage.height;
  const baseTop = () => H() - Math.max(120, H() * 0.3);

  const best = () => ctx.storage.get<number>('best:distance', 0);
  let shownMeters = -1;
  const stats = () => {
    const m = Math.floor(dist);
    if (m === shownMeters) return;
    shownMeters = m;
    ctx.setStats([
      { label: 'Distance', value: `${m.toLocaleString()} m` },
      { label: 'Best', value: `${Math.max(best(), m).toLocaleString()} m` },
    ]);
  };

  // ---------- World generation ----------
  const addChunk = () => {
    const last = segments[segments.length - 1];
    const x = last.x + last.w;
    const density = Math.min(1, 0.25 + dist / 500);
    const gap = Math.random() < 0.24 * density ? rand(60, 70 + 70 * density) : 0;
    const w = rand(260, 640);
    const lo = baseTop() - 50; // highest roof (smallest y)
    const hi = baseTop() + 40; // lowest roof
    // Next to each other, roofs only step down; across a gap they may rise a little.
    const top = gap > 0 ? clamp(last.top + rand(-34, 50), lo, hi) : clamp(last.top + rand(0, 30), lo, hi);
    const sx = x + gap;
    segments.push({ x: sx, w, top, seed: Math.random() * 1000 });

    const r = Math.random();
    if (gap > 0 && r < 0.8) return; // the gap is the challenge here
    // Leave room after an obstacle to land or stand back up before the roof ends.
    if (r < 0.6 * density) {
      const min = sx + 90;
      const max = sx + w - 160 - 34;
      if (max > min) obstacles.push({ type: 'crate', x: rand(min, max), w: 34, top });
    } else if (r < 0.9 * density) {
      const min = sx + 100;
      const max = sx + w - 210 - 90;
      if (max > min) obstacles.push({ type: 'bar', x: rand(min, max), w: 90, top });
    }
  };

  const reset = () => {
    const top = baseTop();
    segments = [{ x: -100, w: W() * 1.6, top, seed: 1 }];
    obstacles = [];
    particles.length = 0;
    scroll = 0;
    speed = 300;
    dist = 0;
    runPhase = 0;
    Object.assign(p, { x: Math.max(90, W() * 0.22), y: top - STAND_H, h: STAND_H, vy: 0, onGround: true, duck: false, sinceGround: 0, spin: 0 });
    duckHeld = false;
    duckUntil = 0;
    jumpBuffer = 0;
    shownMeters = -1;
    while (segments[segments.length - 1].x + segments[segments.length - 1].w < W() * 2) addChunk();
    stats();
  };

  // ---------- Actions ----------
  const start = () => {
    if (phase !== 'ready') return false;
    overlay.hide();
    phase = 'playing';
    return true;
  };

  const doJump = () => {
    p.vy = JUMP_V;
    p.onGround = false;
    p.sinceGround = COYOTE + 1;
    jumpBuffer = 0;
    if (p.duck) {
      p.duck = false;
      p.y -= STAND_H - DUCK_H;
      p.h = STAND_H;
    }
    duckUntil = 0;
    ctx.haptic(6);
  };

  const jump = () => {
    if (start()) return doJump();
    if (phase !== 'playing') return;
    if (p.onGround || p.sinceGround < COYOTE) doJump();
    else jumpBuffer = BUFFER;
  };

  const duck = (on: boolean) => {
    if (phase === 'ready' && on) start();
    if (on) {
      duckHeld = true;
      duckUntil = Math.max(duckUntil, now + MIN_DUCK);
    } else {
      duckHeld = false;
    }
  };

  const crash = (cause: string) => {
    if (phase !== 'playing') return;
    phase = 'crashed';
    deathCause = cause;
    crashT = 1.1;
    ctx.haptic(80);
    burst(particles, p.x + PLAYER_W / 2, p.y + p.h / 2, palette().accent, 22, 160, 3.5);
    const { isNew } = ctx.recordBest('distance', Math.floor(dist));
    shownMeters = -1;
    stats();
    setTimeout(() => {
      if (phase !== 'crashed') return;
      phase = 'over';
      overlay.show({
        title: 'Run over',
        body: `${deathCause}\nYou ran ${Math.floor(dist).toLocaleString()} m.${isNew && dist >= 1 ? ' New best!' : ` Best: ${best().toLocaleString()} m.`}`,
        actions: [{ label: 'Run again', primary: true, onClick: () => { reset(); phase = 'ready'; startRun(); } }],
      });
    }, 900);
  };

  const startRun = () => {
    overlay.hide();
    phase = 'playing';
  };


  // ---------- Update ----------
  const update = (dt: number) => {
    now += dt;
    updateParticles(particles, dt);
    if (phase === 'crashed') {
      // Tumble and fall
      p.vy += GRAVITY * dt;
      p.y += p.vy * dt;
      p.x -= speed * 0.3 * dt;
      p.spin += dt * 9;
      crashT -= dt;
      return;
    }
    if (phase !== 'playing') return;

    speed = Math.min(820, 300 + dist * 0.08);
    const dx = speed * dt;
    scroll += dx;
    dist += dx * 0.045;
    for (const s of segments) s.x -= dx;
    for (const o of obstacles) o.x -= dx;
    while (segments[segments.length - 1].x + segments[segments.length - 1].w < W() * 1.8) addChunk();
    segments = segments.filter((s) => s.x + s.w > -150);
    obstacles = obstacles.filter((o) => o.x + o.w > -150);

    // Duck / stand
    const wantDuck = duckHeld || now < duckUntil;
    const prevBottom = p.y + p.h;
    if (wantDuck && !p.duck) {
      p.duck = true;
      p.h = DUCK_H;
      p.y = prevBottom - DUCK_H;
    } else if (!wantDuck && p.duck) {
      p.duck = false;
      p.h = STAND_H;
      p.y = prevBottom - STAND_H;
    }

    // Gravity (ducking in the air pulls you down faster)
    const oldBottom = p.y + p.h;
    p.vy += (GRAVITY + (p.duck && !p.onGround ? FAST_FALL : 0)) * dt;
    p.y += p.vy * dt;
    const wasGround = p.onGround;
    p.onGround = false;
    const bottom = p.y + p.h;

    for (const s of segments) {
      if (p.x + PLAYER_W <= s.x || p.x >= s.x + s.w) continue;
      if (p.vy >= 0 && oldBottom <= s.top + 2 && bottom >= s.top) {
        p.y = s.top - p.h;
        p.vy = 0;
        p.onGround = true;
      } else if (bottom > s.top + 6 && p.x + PLAYER_W - 6 < s.x + dx + 2 && p.x < s.x) {
        // Ran into the side of a taller building
        return crash('You ran into a wall.');
      }
    }

    if (p.onGround) {
      if (!wasGround && p.sinceGround > 0.25) {
        burst(particles, p.x + PLAYER_W / 2, p.y + p.h, palette().muted, 6, 70, 2.5);
      }
      p.sinceGround = 0;
      if (jumpBuffer > 0) doJump();
      runPhase += dt * (7 + speed * 0.011);
    } else {
      p.sinceGround += dt;
      jumpBuffer = Math.max(0, jumpBuffer - dt);
    }

    // Obstacles (a slightly forgiving hitbox)
    const hx = p.x + 5;
    const hy = p.y + 5;
    const hw = PLAYER_W - 10;
    const hh = p.h - 8;
    for (const o of obstacles) {
      const box =
        o.type === 'crate'
          ? { x: o.x, y: o.top - 34, w: o.w, h: 34 }
          : { x: o.x, y: o.top - 72, w: o.w, h: 30 }; // bar: from 72 to 42 above the roof
      if (hx < box.x + box.w && hx + hw > box.x && hy < box.y + box.h && hy + hh > box.y) {
        return crash(o.type === 'crate' ? 'You tripped over a crate.' : 'You ran into a bar. Duck under those!');
      }
    }

    if (p.y > H() + 60) return crash('You fell between the buildings.');
    stats();
  };

  // ---------- Drawing ----------
  const hash = (n: number) => {
    const x = Math.sin(n * 127.1) * 43758.5453;
    return x - Math.floor(x);
  };

  const drawCity = (c: CanvasRenderingContext2D, par: number, baseY: number, step: number, color: string, alpha: number) => {
    const off = scroll * par;
    const first = Math.floor(off / step) - 1;
    c.fillStyle = color;
    c.globalAlpha = alpha;
    for (let k = first; k < first + W() / step + 3; k++) {
      const x = k * step - off;
      const h = 50 + hash(k + par * 1000) * 110;
      const w = step - 12 - hash(k * 3.1 + par) * 20;
      c.fillRect(x, baseY - h, w, H() - baseY + h);
    }
    c.globalAlpha = 1;
  };

  const roofColors = (pal: Palette) =>
    pal.dark
      ? { body: '#26262c', edge: '#4a4a52', window: '#ffd35a' }
      : { body: '#34363d', edge: '#55585f', window: '#ffe8a3' };

  const drawPlayer = (c: CanvasRenderingContext2D, pal: Palette) => {
    c.save();
    c.translate(p.x, p.y);
    if (phase === 'crashed' || phase === 'over') {
      c.translate(PLAYER_W / 2, p.h / 2);
      c.rotate(p.spin);
      c.translate(-PLAYER_W / 2, -p.h / 2);
    }
    if (p.duck) c.scale(1, DUCK_H / STAND_H);
    c.strokeStyle = pal.accent;
    c.fillStyle = pal.accent;
    c.lineCap = 'round';
    const shX = 12;
    let shY = 18;
    const hpX = 12;
    let hpY = 33;
    let hx = 14;
    let hy = 7;
    let ba: number[], fa: number[], bl: number[], fl: number[];
    if (p.duck) {
      const s = Math.sin(runPhase * 1.5) * 4.5;
      hy = 13;
      hx = 16;
      bl = [hpX + s, 54]; fl = [hpX - s, 54];
      ba = [shX + s * 0.8, 36]; fa = [shX - s * 0.8, 36];
    } else if (!p.onGround && p.vy < 0) {
      hx = 15;
      bl = [5, 45]; fl = [21, 39];
      ba = [3, 25]; fa = [21, 7];
    } else if (!p.onGround) {
      bl = [8, 54]; fl = [16, 54];
      ba = [2, 11]; fa = [22, 11];
    } else {
      const s = Math.sin(runPhase);
      const co = Math.cos(runPhase);
      const bob = -Math.abs(co) * 2.6;
      shY += bob; hpY += bob; hy += bob * 0.4; hx = 14.5;
      bl = [hpX - s * 10, 54 - Math.max(0, -co) * 9];
      fl = [hpX + s * 10, 54 - Math.max(0, co) * 9];
      ba = [shX + s * 8, 36 + bob * 0.5];
      fa = [shX - s * 8, 36 + bob * 0.5];
    }
    const limb = (x1: number, y1: number, x2: number, y2: number, w: number) => {
      c.lineWidth = w;
      c.beginPath();
      c.moveTo(x1, y1);
      c.lineTo(x2, y2);
      c.stroke();
    };
    c.globalAlpha = 0.55;
    limb(shX, shY, ba[0], ba[1], 4.5);
    limb(hpX, hpY, bl[0], bl[1], 5.5);
    c.globalAlpha = 1;
    limb(shX, shY, hpX, hpY, 10);
    c.beginPath();
    c.arc(hx, hy, 7, 0, Math.PI * 2);
    c.fill();
    limb(hpX, hpY, fl[0], fl[1], 5.5);
    limb(shX, shY, fa[0], fa[1], 4.5);
    c.restore();
  };

  const render = () => {
    const c = stage.begin();
    const pal = palette();
    const w = W();
    const h = H();
    // Sky
    const g = c.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, pal.surface);
    g.addColorStop(1, pal.surface2);
    c.fillStyle = g;
    c.fillRect(0, 0, w, h);
    // Sun by day, moon by night
    c.fillStyle = pal.dark ? '#e9e6dc' : pal.yellow;
    c.globalAlpha = pal.dark ? 0.9 : 0.55;
    c.beginPath();
    c.arc(w * 0.72, baseTop() * 0.32, 34, 0, Math.PI * 2);
    c.fill();
    c.globalAlpha = 1;
    // Skyline layers (stable heights per building)
    const bt = baseTop();
    const k = pal.dark ? 0.4 : 1;
    drawCity(c, 0.08, bt - 70, 92, pal.muted, 0.16 * k);
    drawCity(c, 0.16, bt - 30, 120, pal.muted, 0.26 * k);
    drawCity(c, 0.26, bt + 10, 150, pal.muted, 0.38 * k);

    // Rooftops
    const rc = roofColors(pal);
    for (const s of segments) {
      if (s.x > w || s.x + s.w < 0) continue;
      c.fillStyle = rc.body;
      c.fillRect(s.x, s.top, s.w, h - s.top);
      c.fillStyle = rc.edge;
      c.fillRect(s.x - 3, s.top, s.w + 6, 5);
      // Windows: a few lit ones
      for (let x = s.x + 26, i = 0; x < s.x + s.w - 30; x += 54, i++) {
        for (let y = s.top + 34, j = 0; y < h - 14; y += 62, j++) {
          const lit = hash(s.seed + i * 7 + j * 13) > (pal.dark ? 0.6 : 0.8);
          c.fillStyle = lit ? rc.window : '#00000033';
          c.globalAlpha = lit ? (pal.dark ? 0.85 : 0.6) : 1;
          c.fillRect(x, y, 18, 26);
        }
      }
      c.globalAlpha = 1;
    }

    // Obstacles
    for (const o of obstacles) {
      if (o.x > w || o.x + o.w < 0) continue;
      if (o.type === 'crate') {
        c.fillStyle = pal.orange;
        roundRect(c, o.x, o.top - 34, o.w, 34, 4);
        c.fill();
        c.strokeStyle = 'rgb(0 0 0 / 0.22)';
        c.lineWidth = 2;
        c.beginPath();
        c.moveTo(o.x + 5, o.top - 29);
        c.lineTo(o.x + o.w - 5, o.top - 5);
        c.moveTo(o.x + o.w - 5, o.top - 29);
        c.lineTo(o.x + 5, o.top - 5);
        c.stroke();
      } else {
        c.fillStyle = rc.edge;
        c.fillRect(o.x + 10, o.top - 44, 7, 44);
        c.fillRect(o.x + o.w - 17, o.top - 44, 7, 44);
        c.fillStyle = pal.red;
        roundRect(c, o.x, o.top - 72, o.w, 30, 5);
        c.fill();
        // warning stripes
        c.save();
        roundRect(c, o.x, o.top - 72, o.w, 30, 5);
        c.clip();
        c.fillStyle = 'rgb(255 255 255 / 0.28)';
        for (let sx = o.x - 30; sx < o.x + o.w; sx += 18) {
          c.beginPath();
          c.moveTo(sx, o.top - 42);
          c.lineTo(sx + 9, o.top - 42);
          c.lineTo(sx + 39, o.top - 72);
          c.lineTo(sx + 30, o.top - 72);
          c.closePath();
          c.fill();
        }
        c.restore();
      }
    }

    drawPlayer(c, pal);
    drawParticles(c, particles);

    if (phase === 'ready') {
      c.fillStyle = pal.surface;
      c.globalAlpha = 0.85;
      const ty = Math.max(40, bt - 150);
      c.fillRect(0, ty - 26, w, 52);
      c.globalAlpha = 1;
      text(c, ctx.isTouch ? 'Tap to jump · swipe down to duck' : 'Space to jump · Down to duck', w / 2, ty - 6, { size: 17, color: pal.text });
      text(c, ctx.isTouch ? 'Tap to start' : 'Press Space to start', w / 2, ty + 14, { size: 13, color: pal.muted });
    }
  };

  // ---------- Input ----------
  // Tap = jump on release; holding still for a moment also jumps (so a "press" feels instant);
  // swipes act the moment the finger travels far enough.
  let acted = false;
  let holdTimer: number | undefined;
  gestures(
    stage.canvas.parentElement!,
    {
      press: () => {
        acted = false;
        clearTimeout(holdTimer);
        holdTimer = window.setTimeout(() => {
          if (!acted) {
            acted = true;
            jump();
          }
        }, HOLD_TO_JUMP_MS);
      },
      move: (_p, info) => {
        if (acted) return;
        const dx = info.total.x;
        const dy = info.total.y;
        if (Math.abs(dy) > 22 && Math.abs(dy) > Math.abs(dx) * 0.9) {
          clearTimeout(holdTimer);
          acted = true;
          if (dy > 0) duck(true);
          else jump();
        }
      },
      release: () => {
        clearTimeout(holdTimer);
        if (!acted) jump();
        acted = false;
        duck(false);
      },
    },
    { signal, toLocal: stage.toLocal, slop: 8 },
  );
  signal.addEventListener('abort', () => clearTimeout(holdTimer));

  keyboard(signal, (e) => {
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    if (k === 'p' || k === 'Escape') return phase === 'paused' ? resume() : pause();
    if (e.repeat) return;
    if (e.code === 'Space' || k === 'ArrowUp' || k === 'w') jump();
    else if (k === 'ArrowDown' || k === 's') duck(true);
  });
  window.addEventListener(
    'keyup',
    (e) => {
      if (e.key === 'ArrowDown' || e.key.toLowerCase() === 's') duck(false);
    },
    { signal },
  );

  loop(update, render, signal);
  reset();
  // If the screen size changes before the run starts, rebuild the opening roofs to fit.
  stage.onResize(() => {
    if (phase === 'ready') reset();
  });
  if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).__runner = { p, phase: () => phase, dist: () => dist, obstacles: () => obstacles, segments: () => segments };

  let pausedFrom: Phase = 'playing';
  function pause() {
    if (phase !== 'playing') return;
    pausedFrom = phase;
    phase = 'paused';
    duckHeld = false;
    overlay.show({ title: 'Paused', actions: [{ label: 'Resume', primary: true, onClick: resume }] });
  }
  function resume() {
    if (phase !== 'paused') return;
    phase = pausedFrom;
    overlay.hide();
  }
  return { pause, resume, isPaused: () => phase === 'paused' };
});
