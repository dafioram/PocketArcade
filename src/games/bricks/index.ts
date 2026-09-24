import { palette, type Palette } from '../../core/theme';
import { defineGame } from '../../core/types';
import { burst, drawParticles, roundRect, text, updateParticles, type Particle } from '../../lib/draw';
import { gestures } from '../../lib/gestures';
import { keyboard } from '../../lib/keyboard';
import { loop } from '../../lib/loop';
import { createOverlay } from '../../lib/overlay';
import { createStage } from '../../lib/stage';
import { clamp } from '../../lib/util';

const W = 360;
const H = 560;
const COLS = 9;
const MARGIN = 10;
const GAP = 4;
const BW = (W - MARGIN * 2 - GAP * (COLS - 1)) / COLS;
const BH = 14;
const TOP = 56;
const PADDLE_Y = H - 44;
const PADDLE_H = 10;
const R = 5.5;

// Levels: each char is a column. '.' empty, 1-3 = hits needed.
const LEVELS: string[][] = [
  ['.........', '111111111', '111111111', '111111111', '111111111', '111111111'],
  ['2.2.2.2.2', '111111111', '.2.2.2.2.', '111111111', '2.2.2.2.2', '111111111'],
  ['....3....', '...212...', '..21112..', '.2111112.', '..21112..', '...212...', '....3....'],
  ['333333333', '1.......1', '1.22222.1', '1.2...2.1', '1.22222.1', '1.......1', '111111111'],
  ['1.1.1.1.1', '.2.2.2.2.', '3.3.3.3.3', '.2.2.2.2.', '1.1.1.1.1', '.2.2.2.2.', '3.3.3.3.3'],
];

type PowerKind = 'wide' | 'multi' | 'slow' | 'life';
interface Brick { x: number; y: number; hits: number; max: number; row: number }
interface Ball { x: number; y: number; vx: number; vy: number; stuck: boolean }
interface Power { x: number; y: number; kind: PowerKind }

export default defineGame((ctx) => {
  const { root, signal } = ctx;
  const stage = createStage(root, { width: W, height: H }, signal);
  const overlay = createOverlay(root, signal);

  type Phase = 'playing' | 'paused' | 'over';
  let phase: Phase = 'playing';
  let level = 0;
  let lives = 3;
  let score = 0;
  let speed = 300;
  let paddleX = W / 2;
  let paddleW = 70;
  let wideTimer = 0;
  let slowTimer = 0;
  let bricks: Brick[] = [];
  let balls: Ball[] = [];
  let powers: Power[] = [];
  let banner = 0;
  const particles: Particle[] = [];

  const stats = () =>
    ctx.setStats([
      { label: 'Score', value: score.toLocaleString() },
      { label: 'Lives', value: '●'.repeat(Math.max(0, lives)) || '0' },
      { label: 'Level', value: level + 1 },
    ]);

  const rowColor = (pal: Palette, row: number) =>
    [pal.red, pal.orange, pal.yellow, pal.green, pal.teal, pal.blue, pal.purple, pal.pink][row % 8];

  const loadLevel = () => {
    const rows = LEVELS[level % LEVELS.length];
    bricks = [];
    rows.forEach((line, r) =>
      [...line].forEach((ch, c) => {
        const n = Number(ch);
        if (!n) return;
        const hits = Math.min(3, n + Math.floor(level / LEVELS.length));
        bricks.push({ x: MARGIN + c * (BW + GAP), y: TOP + r * (BH + GAP), hits, max: hits, row: r });
      }),
    );
    speed = 300 + Math.min(level, 8) * 18;
    powers = [];
    banner = 1.6;
    resetBall();
  };

  const resetBall = () => {
    balls = [{ x: paddleX, y: PADDLE_Y - R - 1, vx: 0, vy: 0, stuck: true }];
    paddleW = 70;
    wideTimer = 0;
    slowTimer = 0;
  };

  const newGame = () => {
    overlay.hide();
    level = 0;
    lives = 3;
    score = 0;
    phase = 'playing';
    paddleX = W / 2;
    loadLevel();
    stats();
  };

  const launch = () => {
    if (phase !== 'playing') return;
    for (const b of balls) {
      if (!b.stuck) continue;
      b.stuck = false;
      const a = -Math.PI / 2 + (Math.random() - 0.5) * 0.6;
      b.vx = Math.cos(a) * speed;
      b.vy = Math.sin(a) * speed;
    }
  };

  const movePaddle = (x: number) => {
    paddleX = clamp(x, paddleW / 2, W - paddleW / 2);
  };

  const hitBrick = (br: Brick) => {
    br.hits--;
    const pal = palette();
    if (br.hits <= 0) {
      bricks.splice(bricks.indexOf(br), 1);
      score += 10 * br.max;
      burst(particles, br.x + BW / 2, br.y + BH / 2, rowColor(pal, br.row), 10, 110);
      if (Math.random() < 0.12) {
        const r = Math.random();
        const kind: PowerKind = r < 0.35 ? 'wide' : r < 0.7 ? 'multi' : r < 0.92 ? 'slow' : 'life';
        powers.push({ x: br.x + BW / 2, y: br.y + BH / 2, kind });
      }
    } else {
      score += 5;
    }
    ctx.haptic(6);
    stats();
  };

  const loseLife = () => {
    lives--;
    ctx.haptic(60);
    stats();
    if (lives <= 0) {
      phase = 'over';
      const { isNew } = ctx.recordBest('score', score);
      overlay.show({
        title: 'Game over',
        body: `Score ${score.toLocaleString()} · Level ${level + 1}${isNew && score > 0 ? '\nNew best!' : ''}`,
        actions: [{ label: 'Play again', primary: true, onClick: newGame }],
      });
    } else {
      resetBall();
    }
  };

  const stepBall = (b: Ball, dt: number) => {
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    // Walls
    if (b.x < R) { b.x = R; b.vx = Math.abs(b.vx); }
    if (b.x > W - R) { b.x = W - R; b.vx = -Math.abs(b.vx); }
    if (b.y < R) { b.y = R; b.vy = Math.abs(b.vy); }
    // Paddle
    const pl = paddleX - paddleW / 2;
    if (b.vy > 0 && b.y + R >= PADDLE_Y && b.y - R <= PADDLE_Y + PADDLE_H && b.x >= pl - R && b.x <= pl + paddleW + R) {
      const rel = clamp((b.x - paddleX) / (paddleW / 2), -1, 1);
      const angle = -Math.PI / 2 + rel * 1.05;
      const sp = Math.hypot(b.vx, b.vy);
      b.vx = Math.cos(angle) * sp;
      b.vy = Math.sin(angle) * sp;
      b.y = PADDLE_Y - R;
      ctx.haptic(4);
    }
    // Bricks: resolve against the first brick we overlap.
    for (const br of bricks) {
      const nx = clamp(b.x, br.x, br.x + BW);
      const ny = clamp(b.y, br.y, br.y + BH);
      const dx = b.x - nx;
      const dy = b.y - ny;
      if (dx * dx + dy * dy > R * R) continue;
      const overlapX = Math.min(b.x + R - br.x, br.x + BW - (b.x - R));
      const overlapY = Math.min(b.y + R - br.y, br.y + BH - (b.y - R));
      if (overlapX < overlapY) {
        b.vx = b.x < br.x + BW / 2 ? -Math.abs(b.vx) : Math.abs(b.vx);
      } else {
        b.vy = b.y < br.y + BH / 2 ? -Math.abs(b.vy) : Math.abs(b.vy);
      }
      hitBrick(br);
      // Speed up slightly with every hit.
      const sp = Math.hypot(b.vx, b.vy);
      const target = Math.min(sp + 3, speed * 1.6);
      b.vx *= target / sp;
      b.vy *= target / sp;
      break;
    }
    // Keep the ball from going too horizontal.
    const sp = Math.hypot(b.vx, b.vy);
    if (Math.abs(b.vy) < sp * 0.25) {
      b.vy = Math.sign(b.vy || -1) * sp * 0.25;
      b.vx = Math.sign(b.vx) * Math.sqrt(sp * sp - b.vy * b.vy);
    }
  };

  const update = (dt: number) => {
    updateParticles(particles, dt);
    banner = Math.max(0, banner - dt);
    if (phase !== 'playing') return;

    const k = (kb.down('ArrowLeft', 'a') ? -1 : 0) + (kb.down('ArrowRight', 'd') ? 1 : 0);
    if (k) movePaddle(paddleX + k * 420 * dt);

    wideTimer = Math.max(0, wideTimer - dt);
    slowTimer = Math.max(0, slowTimer - dt);
    const targetW = wideTimer > 0 ? 108 : 70;
    paddleW += (targetW - paddleW) * Math.min(1, dt * 10);
    movePaddle(paddleX);
    const timeScale = slowTimer > 0 ? 0.65 : 1;

    for (const b of balls) {
      if (b.stuck) {
        b.x = paddleX;
        b.y = PADDLE_Y - R - 1;
        continue;
      }
      // Sub-step so fast balls can't tunnel through bricks.
      const steps = Math.ceil((Math.hypot(b.vx, b.vy) * dt * timeScale) / 4);
      for (let i = 0; i < steps; i++) stepBall(b, (dt * timeScale) / steps);
    }
    balls = balls.filter((b) => b.y - R < H);
    if (!balls.length) return loseLife();

    for (const p of powers) p.y += 110 * dt;
    powers = powers.filter((p) => {
      if (p.y > H + 10) return false;
      if (p.y + 7 >= PADDLE_Y && p.y - 7 <= PADDLE_Y + PADDLE_H && Math.abs(p.x - paddleX) <= paddleW / 2 + 10) {
        ctx.haptic(15);
        if (p.kind === 'wide') wideTimer = 12;
        else if (p.kind === 'slow') slowTimer = 10;
        else if (p.kind === 'life') { lives = Math.min(lives + 1, 6); stats(); }
        else if (p.kind === 'multi') {
          const src = balls.find((b) => !b.stuck) ?? balls[0];
          const sp = Math.max(speed, Math.hypot(src.vx, src.vy));
          for (const a of [-0.5, 0.5]) {
            const ang = Math.atan2(src.vy || -1, src.vx) + a;
            balls.push({ x: src.x, y: src.y, vx: Math.cos(ang) * sp, vy: -Math.abs(Math.sin(ang) * sp), stuck: false });
          }
        }
        return false;
      }
      return true;
    });

    if (!bricks.length) {
      level++;
      score += 100;
      stats();
      loadLevel();
    }
  };

  const POWER_LABEL: Record<PowerKind, string> = { wide: 'W', multi: 'M', slow: 'S', life: '+' };

  const render = () => {
    const c = stage.begin();
    const pal = palette();
    c.fillStyle = pal.surface;
    c.fillRect(0, 0, W, H);

    for (const br of bricks) {
      c.fillStyle = rowColor(pal, br.row);
      c.globalAlpha = 0.4 + 0.6 * (br.hits / br.max);
      roundRect(c, br.x, br.y, BW, BH, 3);
      c.fill();
      c.globalAlpha = 1;
      if (br.hits > 1) {
        c.strokeStyle = pal.surface;
        c.lineWidth = 1.5;
        for (let i = 1; i < br.hits; i++) {
          c.beginPath();
          c.moveTo(br.x + 4, br.y + (BH * i) / br.hits);
          c.lineTo(br.x + BW - 4, br.y + (BH * i) / br.hits);
          c.stroke();
        }
      }
    }

    for (const p of powers) {
      const color = { wide: pal.blue, multi: pal.purple, slow: pal.teal, life: pal.red }[p.kind];
      c.fillStyle = color;
      roundRect(c, p.x - 13, p.y - 7, 26, 14, 7);
      c.fill();
      text(c, POWER_LABEL[p.kind], p.x, p.y + 0.5, { size: 11, weight: 800, color: '#fff' });
    }

    // Paddle
    c.fillStyle = wideTimer > 0 ? pal.blue : pal.text;
    roundRect(c, paddleX - paddleW / 2, PADDLE_Y, paddleW, PADDLE_H, 5);
    c.fill();

    c.fillStyle = slowTimer > 0 ? pal.teal : pal.accent;
    for (const b of balls) {
      c.beginPath();
      c.arc(b.x, b.y, R, 0, Math.PI * 2);
      c.fill();
    }
    drawParticles(c, particles);

    if (banner > 0) {
      c.globalAlpha = Math.min(1, banner);
      text(c, `Level ${level + 1}`, W / 2, H * 0.58, { size: 26, weight: 750, color: pal.text });
      c.globalAlpha = 1;
    }
    if (phase === 'playing' && balls.some((b) => b.stuck)) {
      text(c, ctx.isTouch ? 'Drag to aim · tap to launch' : 'Click or press Space to launch', W / 2, H * 0.66, { size: 14, color: pal.muted });
    }
  };

  // ---------- Input ----------
  const area = stage.canvas.parentElement!;
  gestures(
    area,
    {
      move: (_p, info, e) => {
        if (phase !== 'playing') return;
        if (e.pointerType === 'mouse') return;
        movePaddle(paddleX + info.delta.x * 1.25);
      },
      tap: () => launch(),
    },
    { signal, toLocal: stage.toLocal, slop: 6 },
  );
  // Mouse: paddle follows the cursor.
  area.addEventListener(
    'pointermove',
    (e) => {
      if (e.pointerType !== 'mouse' || phase !== 'playing') return;
      movePaddle(stage.toLocal(e.clientX, e.clientY).x);
    },
    { signal },
  );
  const kb = keyboard(signal, (e) => {
    if (e.code === 'Space') launch();
    else if (e.key === 'p' || e.key === 'Escape') (phase === 'paused' ? resume() : pause());
  });

  loop(update, render, signal);
  newGame();

  function pause() {
    if (phase !== 'playing') return;
    phase = 'paused';
    overlay.show({ title: 'Paused', actions: [{ label: 'Resume', primary: true, onClick: resume }] });
  }
  function resume() {
    if (phase !== 'paused') return;
    phase = 'playing';
    overlay.hide();
  }
  return { pause, resume, isPaused: () => phase === 'paused' };
});
