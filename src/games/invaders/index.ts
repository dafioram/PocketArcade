import { palette } from '../../core/theme';
import { defineGame } from '../../core/types';
import { burst, drawParticles, roundRect, text, updateParticles, type Particle } from '../../lib/draw';
import { gestures } from '../../lib/gestures';
import { keyboard } from '../../lib/keyboard';
import { loop } from '../../lib/loop';
import { createOverlay } from '../../lib/overlay';
import { createStage } from '../../lib/stage';
import { clamp, rand } from '../../lib/util';

const W = 360;
const H = 560;
const PX = 2.4; // size of one sprite pixel
const COLS = 8;
const ROWS = 5;
const SPACING_X = 36;
const SPACING_Y = 30;
const SHIP_Y = H - 40;

// Original 11x8 sprites, two animation frames each.
const SPRITES: string[][][] = [
  [
    ['...XXXXX...', '..XXXXXXX..', '.XX.XXX.XX.', '.XXXXXXXXX.', '..XXXXXXX..', '..X.X.X.X..', '.X.X...X.X.', '...........'],
    ['...XXXXX...', '..XXXXXXX..', '.XX.XXX.XX.', '.XXXXXXXXX.', '..XXXXXXX..', '..X.X.X.X..', '..X.X.X.X..', '.X.......X.'],
  ],
  [
    ['.....X.....', '....XXX....', '..XXXXXXX..', '.XX..X..XX.', '.XXXXXXXXX.', '..XXX.XXX..', '.X.......X.', '..X.....X..'],
    ['.....X.....', '....XXX....', '..XXXXXXX..', '.XX..X..XX.', '.XXXXXXXXX.', '..XXX.XXX..', '..X.....X..', '.X.......X.'],
  ],
  [
    ['.....X.....', '....XXX....', '...XXXXX...', '..XX.X.XX..', '.XXXXXXXXX.', '...X.X.X...', '..X.....X..', '...........'],
    ['.....X.....', '....XXX....', '...XXXXX...', '..XX.X.XX..', '.XXXXXXXXX.', '...X.X.X...', '...X...X...', '..X.....X..'],
  ],
];
const SPRITE_W = 11 * PX;
const SPRITE_H = 8 * PX;

const SHIELD = ['..XXXXXXXX..', '.XXXXXXXXXX.', 'XXXXXXXXXXXX', 'XXXXXXXXXXXX', 'XXXXXXXXXXXX', 'XXX......XXX', 'XX........XX'];
const SHIELD_PX = 3.5;

interface Alien { col: number; row: number; alive: boolean; type: number }
interface Shot { x: number; y: number; vy: number }
interface Block { x: number; y: number }

export default defineGame((ctx) => {
  const { root, signal } = ctx;
  const stage = createStage(root, { width: W, height: H }, signal);
  const overlay = createOverlay(root, signal);

  type Phase = 'playing' | 'paused' | 'over' | 'dead';
  let phase: Phase = 'playing';
  let wave = 0;
  let score = 0;
  let lives = 3;
  let shipX = W / 2;
  let aliens: Alien[] = [];
  let gridX = 0;
  let gridY = 0;
  let dirX = 1;
  let stepTimer = 0;
  let frame = 0;
  let shots: Shot[] = [];
  let bombs: Shot[] = [];
  let blocks: Block[] = [];
  let cooldown = 0;
  let firing = false;
  let deadTimer = 0;
  let ufo: { x: number; dir: number } | null = null;
  let ufoTimer = rand(12, 20);
  let banner = 0;
  const particles: Particle[] = [];

  const stats = () =>
    ctx.setStats([
      { label: 'Score', value: score.toLocaleString() },
      { label: 'Lives', value: lives },
      { label: 'Wave', value: wave + 1 },
    ]);

  const buildShields = () => {
    blocks = [];
    const n = 4;
    const sw = SHIELD[0].length * SHIELD_PX;
    for (let i = 0; i < n; i++) {
      const ox = ((i + 0.5) * W) / n - sw / 2;
      const oy = SHIP_Y - 70;
      SHIELD.forEach((row, r) =>
        [...row].forEach((ch, c) => {
          if (ch === 'X') blocks.push({ x: ox + c * SHIELD_PX, y: oy + r * SHIELD_PX });
        }),
      );
    }
  };

  const startWave = () => {
    aliens = [];
    for (let r = 0; r < ROWS; r++)
      for (let c = 0; c < COLS; c++) aliens.push({ col: c, row: r, alive: true, type: r === 0 ? 2 : r < 3 ? 1 : 0 });
    gridX = (W - (COLS - 1) * SPACING_X - SPRITE_W) / 2;
    gridY = 60 + Math.min(wave, 5) * 12;
    dirX = 1;
    shots = [];
    bombs = [];
    banner = 1.5;
    if (wave === 0 || wave % 2 === 0) buildShields();
  };

  const newGame = () => {
    overlay.hide();
    wave = 0;
    score = 0;
    lives = 3;
    shipX = W / 2;
    phase = 'playing';
    ufo = null;
    startWave();
    stats();
  };

  const alienPos = (a: Alien) => ({ x: gridX + a.col * SPACING_X, y: gridY + a.row * SPACING_Y });
  const alive = () => aliens.filter((a) => a.alive);

  const fire = () => {
    if (phase !== 'playing' || cooldown > 0 || shots.length >= 2) return;
    shots.push({ x: shipX, y: SHIP_Y - 10, vy: -520 });
    cooldown = 0.28;
  };

  const hitShield = (s: Shot): boolean => {
    const i = blocks.findIndex((b) => s.x >= b.x - 1 && s.x <= b.x + SHIELD_PX + 1 && s.y >= b.y && s.y <= b.y + SHIELD_PX);
    if (i < 0) return false;
    const hit = blocks[i];
    // Chip away a small ragged area.
    blocks = blocks.filter((b) => Math.hypot(b.x - hit.x, b.y - hit.y) > SHIELD_PX * (1 + Math.random() * 0.9));
    return true;
  };

  const shipHit = () => {
    const pal = palette();
    burst(particles, shipX, SHIP_Y, pal.accent, 30, 180, 3);
    ctx.haptic(80);
    lives--;
    stats();
    bombs = [];
    if (lives <= 0) return gameOver();
    phase = 'dead';
    deadTimer = 1.4;
  };

  const gameOver = () => {
    phase = 'over';
    const { isNew } = ctx.recordBest('score', score);
    setTimeout(
      () =>
        overlay.show({
          title: 'Game over',
          body: `Score ${score.toLocaleString()} · Wave ${wave + 1}${isNew && score > 0 ? '\nNew best!' : ''}`,
          actions: [{ label: 'Play again', primary: true, onClick: newGame }],
        }),
      600,
    );
  };

  const update = (dt: number) => {
    updateParticles(particles, dt);
    banner = Math.max(0, banner - dt);
    if (phase === 'dead') {
      deadTimer -= dt;
      if (deadTimer <= 0) phase = 'playing';
      return;
    }
    if (phase !== 'playing') return;

    const k = (kb.down('ArrowLeft', 'a') ? -1 : 0) + (kb.down('ArrowRight', 'd') ? 1 : 0);
    shipX = clamp(shipX + k * 220 * dt, 16, W - 16);
    cooldown -= dt;
    if (firing || kb.down('Space')) fire();

    // Alien march: fewer aliens → faster steps.
    const left = alive();
    const interval = Math.max(0.05, 0.55 * (left.length / (ROWS * COLS)) - wave * 0.02 + 0.05);
    stepTimer -= dt;
    if (stepTimer <= 0) {
      stepTimer = interval;
      frame ^= 1;
      const xs = left.map((a) => alienPos(a).x);
      const minX = Math.min(...xs);
      const maxX = Math.max(...xs) + SPRITE_W;
      const step = 6;
      if ((dirX > 0 && maxX + step > W - 6) || (dirX < 0 && minX - step < 6)) {
        dirX = -dirX;
        gridY += 12;
      } else {
        gridX += step * dirX;
      }
    }

    // Aliens drop bombs from the lowest alien in a random column.
    const bombRate = 0.9 + wave * 0.25;
    if (Math.random() < bombRate * dt && bombs.length < 3 + wave) {
      const cols = [...new Set(left.map((a) => a.col))];
      const col = cols[Math.floor(Math.random() * cols.length)];
      const shooter = left.filter((a) => a.col === col).sort((a, b) => b.row - a.row)[0];
      if (shooter) {
        const p = alienPos(shooter);
        bombs.push({ x: p.x + SPRITE_W / 2, y: p.y + SPRITE_H, vy: 170 + wave * 12 });
      }
    }

    // UFO
    ufoTimer -= dt;
    if (!ufo && ufoTimer <= 0) {
      const dir = Math.random() < 0.5 ? 1 : -1;
      ufo = { x: dir > 0 ? -30 : W + 30, dir };
      ufoTimer = rand(15, 25);
    }
    if (ufo) {
      ufo.x += ufo.dir * 90 * dt;
      if (ufo.x < -40 || ufo.x > W + 40) ufo = null;
    }

    const pal = palette();
    // Player shots
    for (const s of shots) s.y += s.vy * dt;
    shots = shots.filter((s) => {
      if (s.y < 0) return false;
      if (hitShield(s)) return false;
      if (ufo && Math.abs(s.x - ufo.x) < 16 && Math.abs(s.y - 36) < 8) {
        const pts = [50, 100, 150, 300][Math.floor(Math.random() * 4)];
        score += pts;
        burst(particles, ufo.x, 36, pal.pink, 20, 140);
        ufo = null;
        stats();
        return false;
      }
      for (const a of left) {
        if (!a.alive) continue;
        const p = alienPos(a);
        if (s.x >= p.x && s.x <= p.x + SPRITE_W && s.y >= p.y && s.y <= p.y + SPRITE_H) {
          a.alive = false;
          score += [10, 20, 30][a.type];
          burst(particles, p.x + SPRITE_W / 2, p.y + SPRITE_H / 2, alienColor(a.type), 12, 120);
          ctx.haptic(5);
          stats();
          return false;
        }
      }
      return true;
    });

    // Bombs
    for (const b of bombs) b.y += b.vy * dt;
    bombs = bombs.filter((b) => {
      if (b.y > H) return false;
      if (hitShield(b)) return false;
      if (Math.abs(b.x - shipX) < 14 && b.y > SHIP_Y - 8 && b.y < SHIP_Y + 10) {
        shipHit();
        return false;
      }
      return true;
    });

    // Shots can knock out bombs.
    for (const s of shots)
      for (const b of bombs)
        if (Math.abs(s.x - b.x) < 5 && Math.abs(s.y - b.y) < 10) {
          s.y = -100;
          b.y = H + 100;
        }

    const remaining = alive();
    // Aliens chew through shields and win if they reach the ship.
    for (const a of remaining) {
      const p = alienPos(a);
      blocks = blocks.filter((bl) => !(bl.x > p.x - 2 && bl.x < p.x + SPRITE_W + 2 && bl.y > p.y && bl.y < p.y + SPRITE_H));
      if (p.y + SPRITE_H >= SHIP_Y - 10) {
        lives = 0;
        stats();
        burst(particles, shipX, SHIP_Y, pal.accent, 30, 180, 3);
        return gameOver();
      }
    }
    if (!remaining.length) {
      wave++;
      score += 200;
      stats();
      startWave();
    }
  };

  const alienColor = (type: number) => {
    const pal = palette();
    return [pal.green, pal.teal, pal.purple][type];
  };

  const drawSprite = (c: CanvasRenderingContext2D, rows: string[], x: number, y: number) => {
    rows.forEach((row, r) => {
      for (let i = 0; i < row.length; i++) if (row[i] === 'X') c.fillRect(x + i * PX, y + r * PX, PX + 0.3, PX + 0.3);
    });
  };

  const render = () => {
    const c = stage.begin();
    const pal = palette();
    c.fillStyle = pal.surface;
    c.fillRect(0, 0, W, H);

    // Ground line
    c.fillStyle = pal.border;
    c.fillRect(0, SHIP_Y + 16, W, 2);

    for (const a of aliens) {
      if (!a.alive) continue;
      const p = alienPos(a);
      c.fillStyle = alienColor(a.type);
      drawSprite(c, SPRITES[a.type][frame], p.x, p.y);
    }

    if (ufo) {
      c.fillStyle = pal.pink;
      c.beginPath();
      c.ellipse(ufo.x, 38, 16, 5, 0, 0, Math.PI * 2);
      c.fill();
      c.beginPath();
      c.ellipse(ufo.x, 34, 8, 5, 0, Math.PI, 0);
      c.fill();
    }

    c.fillStyle = pal.muted;
    for (const b of blocks) c.fillRect(b.x, b.y, SHIELD_PX + 0.2, SHIELD_PX + 0.2);

    // Ship
    if (phase !== 'over' && (phase !== 'dead' || Math.floor(deadTimer * 10) % 2 === 0)) {
      c.fillStyle = pal.accent;
      c.beginPath();
      c.moveTo(shipX, SHIP_Y - 11);
      c.lineTo(shipX + 4, SHIP_Y - 3);
      c.lineTo(shipX + 15, SHIP_Y + 3);
      c.lineTo(shipX + 15, SHIP_Y + 9);
      c.lineTo(shipX - 15, SHIP_Y + 9);
      c.lineTo(shipX - 15, SHIP_Y + 3);
      c.lineTo(shipX - 4, SHIP_Y - 3);
      c.closePath();
      c.fill();
    }

    c.fillStyle = pal.text;
    for (const s of shots) {
      roundRect(c, s.x - 1.5, s.y - 6, 3, 12, 1.5);
      c.fill();
    }
    c.strokeStyle = pal.red;
    c.lineWidth = 2;
    for (const b of bombs) {
      c.beginPath();
      const z = Math.floor(b.y / 6) % 2 ? 2 : -2;
      c.moveTo(b.x, b.y - 7);
      c.lineTo(b.x + z, b.y - 3);
      c.lineTo(b.x - z, b.y + 1);
      c.lineTo(b.x, b.y + 5);
      c.stroke();
    }
    drawParticles(c, particles);

    if (banner > 0) {
      c.globalAlpha = Math.min(1, banner);
      text(c, `Wave ${wave + 1}`, W / 2, H * 0.55, { size: 26, weight: 750, color: pal.text });
      c.globalAlpha = 1;
    }
  };

  // ---------- Input ----------
  const area = stage.canvas.parentElement!;
  gestures(
    area,
    {
      press: () => (firing = true),
      move: (_p, info, e) => {
        if (phase !== 'playing' && phase !== 'dead') return;
        if (e.pointerType === 'mouse') return;
        shipX = clamp(shipX + info.delta.x * 1.3, 16, W - 16);
      },
      release: () => (firing = false),
      tap: () => fire(),
    },
    { signal, toLocal: stage.toLocal },
  );
  area.addEventListener(
    'pointermove',
    (e) => {
      if (e.pointerType !== 'mouse' || (phase !== 'playing' && phase !== 'dead')) return;
      shipX = clamp(stage.toLocal(e.clientX, e.clientY).x, 16, W - 16);
    },
    { signal },
  );
  const kb = keyboard(signal, (e) => {
    if (e.key === 'p' || e.key === 'Escape') phase === 'paused' ? resume() : pause();
  });

  loop(update, render, signal);
  newGame();

  let pausedFrom: Phase = 'playing';
  function pause() {
    if (phase !== 'playing' && phase !== 'dead') return;
    pausedFrom = phase;
    phase = 'paused';
    firing = false;
    overlay.show({ title: 'Paused', actions: [{ label: 'Resume', primary: true, onClick: resume }] });
  }
  function resume() {
    if (phase !== 'paused') return;
    phase = pausedFrom;
    overlay.hide();
  }
  return { pause, resume, isPaused: () => phase === 'paused' };
});
