import { palette } from '../../core/theme';
import { defineGame } from '../../core/types';
import { burst, drawParticles, text, updateParticles, type Particle } from '../../lib/draw';
import { gestures, type Point } from '../../lib/gestures';
import { keyboard } from '../../lib/keyboard';
import { loop } from '../../lib/loop';
import { createOverlay } from '../../lib/overlay';
import { createStage } from '../../lib/stage';
import { rand } from '../../lib/util';

interface Rock {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: 1 | 2 | 3;
  r: number;
  shape: number[];
  rot: number;
  spin: number;
}
interface Bullet { x: number; y: number; vx: number; vy: number; life: number }

const RADIUS = { 1: 11, 2: 22, 3: 40 } as const;
const POINTS = { 1: 100, 2: 50, 3: 20 } as const;
const SHIELD_COOLDOWN = 12;
const SHIELD_RADIUS = 120;

/** Signed smallest difference between two angles. */
const angleDiff = (a: number, b: number) => Math.atan2(Math.sin(b - a), Math.cos(b - a));

export default defineGame((ctx) => {
  const { root, signal } = ctx;
  const stage = createStage(root, { minWidth: 360, minHeight: 480 }, signal);
  const overlay = createOverlay(root, signal);
  // Touch mode: ship is pinned to the center and aims wherever you touch.
  const touchMode = ctx.isTouch;
  const speedScale = touchMode ? 0.8 : 1;

  type Phase = 'playing' | 'paused' | 'over' | 'respawn';
  let phase: Phase = 'playing';
  let ship = { x: 0, y: 0, vx: 0, vy: 0, a: -Math.PI / 2 };
  let rocks: Rock[] = [];
  let bullets: Bullet[] = [];
  let lives = 3;
  let score = 0;
  let wave = 0;
  let invuln = 0;
  let cooldown = 0;
  let shieldCd = 0;
  let shieldFx = 0;
  let respawnT = 0;
  let nextLifeAt = 10000;
  let waveBanner = 0;
  let aim: Point | null = null;
  let holding = false;
  let thrusting = false;
  const particles: Particle[] = [];
  let stars: Array<{ x: number; y: number; s: number }> = [];

  const W = () => stage.width;
  const H = () => stage.height;

  const stats = () =>
    ctx.setStats([
      { label: 'Score', value: score.toLocaleString() },
      { label: 'Lives', value: lives },
      { label: 'Wave', value: wave },
    ]);

  const makeRock = (x: number, y: number, size: 1 | 2 | 3, dir?: number): Rock => {
    const sp = (size === 3 ? rand(28, 55) : size === 2 ? rand(45, 85) : rand(65, 115)) * speedScale * (1 + wave * 0.04);
    const a = dir ?? rand(0, Math.PI * 2);
    const n = 9 + size * 2;
    return {
      x,
      y,
      vx: Math.cos(a) * sp,
      vy: Math.sin(a) * sp,
      size,
      r: RADIUS[size],
      shape: Array.from({ length: n }, () => rand(0.72, 1.12)),
      rot: rand(0, Math.PI * 2),
      spin: rand(-1, 1),
    };
  };

  const center = () => ({ x: W() / 2, y: H() / 2 });

  const startWave = () => {
    wave++;
    waveBanner = 1.5;
    const count = Math.min(3 + wave, 10);
    for (let i = 0; i < count; i++) {
      // Spawn along the edges, away from the ship.
      let x = 0;
      let y = 0;
      do {
        if (Math.random() < 0.5) {
          x = Math.random() < 0.5 ? -30 : W() + 30;
          y = rand(0, H());
        } else {
          x = rand(0, W());
          y = Math.random() < 0.5 ? -30 : H() + 30;
        }
      } while (Math.hypot(x - ship.x, y - ship.y) < 180);
      // Aim roughly across the screen so rocks come into view.
      const c = center();
      const dir = Math.atan2(c.y - y, c.x - x) + rand(-0.7, 0.7);
      rocks.push(makeRock(x, y, 3, dir));
    }
    stats();
  };

  const spawnShip = () => {
    const c = center();
    ship = { x: c.x, y: c.y, vx: 0, vy: 0, a: ship.a };
    invuln = 2.5;
    phase = 'playing';
  };

  const newGame = () => {
    overlay.hide();
    rocks = [];
    bullets = [];
    lives = 3;
    score = 0;
    wave = 0;
    shieldCd = 0;
    nextLifeAt = 10000;
    ship.a = -Math.PI / 2;
    spawnShip();
    invuln = 1;
    startWave();
  };

  const makeStars = () => {
    stars = Array.from({ length: Math.round((W() * H()) / 5000) }, () => ({ x: rand(0, W()), y: rand(0, H()), s: rand(0.6, 1.6) }));
  };

  const fire = () => {
    if (phase !== 'playing' || cooldown > 0 || bullets.length >= 8) return;
    const sp = 480;
    bullets.push({
      x: ship.x + Math.cos(ship.a) * 14,
      y: ship.y + Math.sin(ship.a) * 14,
      vx: Math.cos(ship.a) * sp + (touchMode ? 0 : ship.vx),
      vy: Math.sin(ship.a) * sp + (touchMode ? 0 : ship.vy),
      life: touchMode ? Math.max(W(), H()) / 2 / sp + 0.15 : 0.95,
    });
    cooldown = 0.17;
  };

  const shieldBurst = () => {
    if (phase !== 'playing' || shieldCd > 0) return;
    shieldCd = SHIELD_COOLDOWN;
    shieldFx = 0.5;
    invuln = Math.max(invuln, 0.6);
    ctx.haptic(25);
    for (const r of rocks.slice()) {
      const dx = r.x - ship.x;
      const dy = r.y - ship.y;
      const d = Math.hypot(dx, dy) || 1;
      if (d >= SHIELD_RADIUS + r.r) continue;
      if (r.size === 1) {
        destroyRock(r, false);
        continue;
      }
      const push = 170 * speedScale;
      r.vx = (dx / d) * push;
      r.vy = (dy / d) * push;
    }
  };

  const addScore = (n: number) => {
    score += n;
    if (score >= nextLifeAt) {
      lives++;
      nextLifeAt += 10000;
      ctx.haptic(20);
    }
    stats();
  };

  const destroyRock = (r: Rock, split = true) => {
    rocks.splice(rocks.indexOf(r), 1);
    addScore(POINTS[r.size]);
    burst(particles, r.x, r.y, palette().muted, 6 + r.size * 4, 60 + r.size * 30, 2.5);
    if (split && r.size > 1) {
      const next = (r.size - 1) as 1 | 2;
      const base = Math.atan2(r.vy, r.vx);
      rocks.push(makeRock(r.x, r.y, next, base + rand(0.4, 1.0)), makeRock(r.x, r.y, next, base - rand(0.4, 1.0)));
    }
  };

  const shipDestroyed = () => {
    const pal = palette();
    burst(particles, ship.x, ship.y, pal.accent, 34, 200, 3);
    ctx.haptic(90);
    lives--;
    stats();
    holding = false;
    if (lives <= 0) {
      phase = 'over';
      const { isNew } = ctx.recordBest('score', score);
      setTimeout(
        () =>
          overlay.show({
            title: 'Game over',
            body: `Score ${score.toLocaleString()} · Wave ${wave}${isNew && score > 0 ? '\nNew best!' : ''}`,
            actions: [{ label: 'Play again', primary: true, onClick: newGame }],
          }),
        700,
      );
    } else {
      phase = 'respawn';
      respawnT = 1.5;
    }
  };

  const wrap = (o: { x: number; y: number }, m: number) => {
    if (o.x < -m) o.x += W() + m * 2;
    else if (o.x > W() + m) o.x -= W() + m * 2;
    if (o.y < -m) o.y += H() + m * 2;
    else if (o.y > H() + m) o.y -= H() + m * 2;
  };

  const update = (dt: number) => {
    updateParticles(particles, dt);
    waveBanner = Math.max(0, waveBanner - dt);
    shieldFx = Math.max(0, shieldFx - dt);
    if (phase === 'paused' || phase === 'over') {
      if (phase === 'over') for (const r of rocks) moveRock(r, dt);
      return;
    }
    for (const r of rocks) moveRock(r, dt);

    if (phase === 'respawn') {
      respawnT -= dt;
      // Wait until the middle is reasonably clear.
      const c = center();
      const clear = rocks.every((r) => Math.hypot(r.x - c.x, r.y - c.y) > r.r + 70);
      if (respawnT <= 0 && (clear || respawnT < -3)) spawnShip();
      return;
    }

    cooldown -= dt;
    shieldCd = Math.max(0, shieldCd - dt);
    invuln = Math.max(0, invuln - dt);

    if (touchMode) {
      const c = center();
      ship.x = c.x;
      ship.y = c.y;
      if (aim) {
        const target = Math.atan2(aim.y - ship.y, aim.x - ship.x);
        const diff = angleDiff(ship.a, target);
        const maxTurn = 10 * dt;
        ship.a += Math.max(-maxTurn, Math.min(maxTurn, diff));
        if (holding && Math.abs(diff) < 0.35) fire();
      }
    } else {
      if (kb.down('ArrowLeft', 'a')) ship.a -= 4.2 * dt;
      if (kb.down('ArrowRight', 'd')) ship.a += 4.2 * dt;
      thrusting = kb.down('ArrowUp', 'w');
      if (thrusting) {
        ship.vx += Math.cos(ship.a) * 280 * dt;
        ship.vy += Math.sin(ship.a) * 280 * dt;
        if (Math.random() < 0.6) {
          particles.push({
            x: ship.x - Math.cos(ship.a) * 10,
            y: ship.y - Math.sin(ship.a) * 10,
            vx: -Math.cos(ship.a) * 120 + rand(-30, 30),
            vy: -Math.sin(ship.a) * 120 + rand(-30, 30),
            life: 0.25,
            max: 0.25,
            color: palette().orange,
            size: 2.5,
          });
        }
      }
      const sp = Math.hypot(ship.vx, ship.vy);
      if (sp > 330) {
        ship.vx *= 330 / sp;
        ship.vy *= 330 / sp;
      }
      const drag = Math.pow(0.55, dt);
      ship.vx *= drag;
      ship.vy *= drag;
      ship.x += ship.vx * dt;
      ship.y += ship.vy * dt;
      wrap(ship, 12);
      if (kb.down('Space')) fire();
    }

    for (const b of bullets) {
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.life -= dt;
      if (!touchMode) wrap(b, 2);
    }
    bullets = bullets.filter((b) => {
      if (b.life <= 0) return false;
      const hit = rocks.find((r) => Math.hypot(r.x - b.x, r.y - b.y) < r.r * 0.95);
      if (hit) {
        destroyRock(hit);
        ctx.haptic(5);
        return false;
      }
      return true;
    });

    if (invuln <= 0) {
      const hit = rocks.find((r) => Math.hypot(r.x - ship.x, r.y - ship.y) < r.r * 0.85 + 9);
      if (hit) {
        destroyRock(hit);
        shipDestroyed();
      }
    }

    if (!rocks.length && phase === 'playing') startWave();
  };

  const moveRock = (r: Rock, dt: number) => {
    r.x += r.vx * dt;
    r.y += r.vy * dt;
    r.rot += r.spin * dt;
    wrap(r, r.r);
  };

  const render = () => {
    const c = stage.begin();
    const pal = palette();
    c.fillStyle = pal.surface;
    c.fillRect(0, 0, W(), H());
    c.fillStyle = pal.border;
    for (const s of stars) c.fillRect(s.x, s.y, s.s, s.s);

    c.strokeStyle = pal.text;
    c.lineWidth = 1.8;
    c.lineJoin = 'round';
    for (const r of rocks) {
      c.beginPath();
      r.shape.forEach((k, i) => {
        const a = r.rot + (i / r.shape.length) * Math.PI * 2;
        const px = r.x + Math.cos(a) * r.r * k;
        const py = r.y + Math.sin(a) * r.r * k;
        if (i === 0) c.moveTo(px, py);
        else c.lineTo(px, py);
      });
      c.closePath();
      c.stroke();
    }

    c.fillStyle = pal.text;
    for (const b of bullets) {
      c.beginPath();
      c.arc(b.x, b.y, 2, 0, Math.PI * 2);
      c.fill();
    }

    if (phase === 'playing' && (invuln <= 0 || Math.floor(invuln * 10) % 2 === 0)) {
      c.save();
      c.translate(ship.x, ship.y);
      c.rotate(ship.a);
      c.strokeStyle = pal.accent;
      c.lineWidth = 2;
      c.beginPath();
      c.moveTo(14, 0);
      c.lineTo(-10, 9);
      c.lineTo(-6, 0);
      c.lineTo(-10, -9);
      c.closePath();
      c.stroke();
      c.restore();
    }

    // Shield charge ring
    if (phase === 'playing') {
      const ready = shieldCd <= 0;
      c.strokeStyle = ready ? pal.teal : pal.border;
      c.lineWidth = 2;
      c.globalAlpha = ready ? 0.55 : 0.8;
      c.beginPath();
      c.arc(ship.x, ship.y, 22, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (1 - shieldCd / SHIELD_COOLDOWN));
      c.stroke();
      c.globalAlpha = 1;
    }
    if (shieldFx > 0) {
      c.strokeStyle = pal.teal;
      c.lineWidth = 3;
      c.globalAlpha = shieldFx * 2;
      c.beginPath();
      c.arc(ship.x, ship.y, SHIELD_RADIUS * (1 - shieldFx * 1.2 + 0.2), 0, Math.PI * 2);
      c.stroke();
      c.globalAlpha = 1;
    }

    // Aim marker in touch mode
    if (touchMode && holding && aim && phase === 'playing') {
      c.strokeStyle = pal.accent;
      c.globalAlpha = 0.4;
      c.lineWidth = 1.5;
      c.beginPath();
      c.arc(aim.x, aim.y, 16, 0, Math.PI * 2);
      c.stroke();
      c.globalAlpha = 1;
    }

    drawParticles(c, particles);

    if (waveBanner > 0) {
      c.globalAlpha = Math.min(1, waveBanner);
      text(c, `Wave ${wave}`, W() / 2, H() * 0.3, { size: 26, weight: 750, color: pal.text });
      c.globalAlpha = 1;
    }
  };

  // ---------- Input ----------
  const area = stage.canvas.parentElement!;
  if (touchMode) {
    gestures(
      area,
      {
        press: (p) => {
          aim = p;
          holding = true;
        },
        move: (p) => (aim = p),
        release: () => (holding = false),
        tap: (p) => {
          // Snap to the tapped direction and fire once.
          aim = p;
          if (phase === 'playing') {
            ship.a = Math.atan2(p.y - ship.y, p.x - ship.x);
            cooldown = 0;
            fire();
          }
        },
        doubleTap: () => shieldBurst(),
      },
      { signal, toLocal: stage.toLocal, doubleTapMs: 280 },
    );
  }
  const kb = keyboard(signal, (e) => {
    if (e.key === 'Shift' || e.key === 'ArrowDown' || e.key === 's') shieldBurst();
    else if (e.key === 'p' || e.key === 'Escape') phase === 'paused' ? resume() : pause();
  });

  stage.onResize(makeStars);
  makeStars();
  loop(update, render, signal);
  newGame();

  let pausedFrom: Phase = 'playing';
  function pause() {
    if (phase !== 'playing' && phase !== 'respawn') return;
    pausedFrom = phase;
    phase = 'paused';
    holding = false;
    overlay.show({ title: 'Paused', actions: [{ label: 'Resume', primary: true, onClick: resume }] });
  }
  function resume() {
    if (phase !== 'paused') return;
    phase = pausedFrom;
    overlay.hide();
  }
  return { pause, resume, isPaused: () => phase === 'paused' };
});
