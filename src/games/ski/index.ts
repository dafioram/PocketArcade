import { palette } from '../../core/theme';
import { defineGame } from '../../core/types';
import { burst, drawParticles, text, updateParticles, type Particle } from '../../lib/draw';
import { gestures } from '../../lib/gestures';
import { keyboard } from '../../lib/keyboard';
import { loop } from '../../lib/loop';
import { createOverlay } from '../../lib/overlay';
import { createStage } from '../../lib/stage';
import { clamp, rand } from '../../lib/util';

type Kind = 'tree' | 'rock' | 'ramp' | 'gate';
interface Obj {
  kind: Kind;
  x: number;
  y: number;
  size: number;
  /** Gates: half-width of the opening. */
  gap?: number;
  passed?: boolean;
  hit?: boolean;
}

const MAX_ANGLE = 1.35;
const JUMP_TIME = 0.7;

export default defineGame((ctx) => {
  const { root, signal } = ctx;
  const stage = createStage(root, { minWidth: 320, minHeight: 520 }, signal);
  const overlay = createOverlay(root, signal);

  type Phase = 'ready' | 'playing' | 'crashed' | 'paused' | 'over';
  let phase: Phase = 'ready';
  let x = 0;
  let y = 0;
  let angle = 0;
  let targetAngle: number | null = null;
  let speed = 0;
  let camX = 0;
  let jumpT = 0;
  let jumpDur = JUMP_TIME;
  let crashT = 0;
  let invuln = 0;
  let lives = 3;
  let bonus = 0;
  let combo = 0;
  let objects: Obj[] = [];
  let spawnedTo = 0;
  let courseX = 0;
  let nextGateY = 400;
  let trail: Array<{ x: number; y: number; air: boolean }> = [];
  let popups: Array<{ x: number; y: number; t: number; text: string; color: string }> = [];
  const particles: Particle[] = [];

  const skierScreenY = () => stage.height * 0.3;
  const distance = () => Math.floor(y / 10);
  const score = () => distance() + bonus;

  const stats = () =>
    ctx.setStats([
      { label: 'Score', value: score().toLocaleString() },
      { label: 'Lives', value: lives },
      ...(combo > 1 ? [{ label: 'Combo', value: `×${combo}` }] : []),
    ]);

  const spawnUntil = (limit: number) => {
    const W = stage.width;
    while (spawnedTo < limit) {
      const band = 60;
      const y0 = spawnedTo;
      spawnedTo += band;
      const difficulty = clamp(y0 / 20000, 0, 1);
      // Gates follow a meandering course.
      if (y0 >= nextGateY) {
        courseX += rand(-1, 1) * W * 0.35;
        const gap = 70 - difficulty * 22;
        objects.push({ kind: 'gate', x: courseX, y: y0, size: 1, gap });
        nextGateY = y0 + rand(260, 360);
      }
      const n = Math.random() < 0.5 + difficulty * 0.5 ? 2 : 1;
      for (let i = 0; i < n; i++) {
        const ox = camX + rand(-W * 1.1, W * 1.1);
        const oy = y0 + rand(0, band);
        // Keep the gate opening clear.
        const nearGate = objects.some((o) => o.kind === 'gate' && Math.abs(o.y - oy) < 70 && Math.abs(o.x - ox) < (o.gap ?? 60) + 30);
        if (nearGate) continue;
        const r = Math.random();
        const kind: Kind = r < 0.68 ? 'tree' : r < 0.92 ? 'rock' : 'ramp';
        objects.push({ kind, x: ox, y: oy, size: kind === 'tree' ? rand(0.8, 1.3) : rand(0.8, 1.2) });
      }
    }
  };

  const reset = () => {
    overlay.hide();
    phase = 'ready';
    x = 0;
    y = 0;
    angle = 0;
    targetAngle = null;
    speed = 0;
    camX = 0;
    jumpT = 0;
    lives = 3;
    bonus = 0;
    combo = 0;
    courseX = 0;
    nextGateY = 400;
    objects = [];
    trail = [];
    popups = [];
    spawnedTo = 120; // clear run-out at the start
    spawnUntil(stage.height * 2);
    stats();
  };

  const start = () => {
    if (phase === 'ready') phase = 'playing';
  };

  const jump = () => {
    start();
    if (phase === 'playing' && jumpT <= 0) {
      jumpT = jumpDur = JUMP_TIME;
      ctx.haptic(10);
    }
  };

  const popup = (px: number, py: number, str: string, color: string) => popups.push({ x: px, y: py, t: 1, text: str, color });

  const crash = () => {
    phase = 'crashed';
    crashT = 1.2;
    speed = 0;
    lives--;
    combo = 0;
    ctx.haptic(80);
    burst(particles, x, y, palette().muted, 18, 120, 3);
    stats();
  };

  const update = (dt: number) => {
    updateParticles(particles, dt);
    popups.forEach((p) => (p.t -= dt));
    popups = popups.filter((p) => p.t > 0);

    if (phase === 'crashed') {
      crashT -= dt;
      if (crashT <= 0) {
        if (lives <= 0) {
          phase = 'over';
          const { isNew } = ctx.recordBest('score', score());
          overlay.show({
            title: 'Wipeout',
            body: `Score ${score().toLocaleString()} · ${distance().toLocaleString()} m${isNew && score() > 0 ? '\nNew best!' : ''}`,
            actions: [{ label: 'Ski again', primary: true, onClick: reset }],
          });
        } else {
          phase = 'playing';
          invuln = 1.5;
          angle = 0;
        }
      }
      return;
    }
    if (phase !== 'playing') return;

    // Steering
    if (kb.down('ArrowLeft', 'a')) angle -= 3.2 * dt;
    else if (kb.down('ArrowRight', 'd')) angle += 3.2 * dt;
    else if (kb.down('ArrowDown', 's')) angle += (0 - angle) * Math.min(1, dt * 8);
    else if (targetAngle !== null) angle += (targetAngle - angle) * Math.min(1, dt * 9);
    else if (ctx.isTouch) angle += (0 - angle) * Math.min(1, dt * 2.5);
    angle = clamp(angle, -MAX_ANGLE, MAX_ANGLE);

    // Speed: fastest pointing downhill, scrubs off when turned across the slope.
    const top = 250 + Math.min(y * 0.012, 260);
    const want = top * Math.max(0, Math.cos(angle));
    speed += (want - speed) * Math.min(1, dt * (want > speed ? 0.9 : 2.2));
    x += Math.sin(angle) * speed * dt;
    const dy = Math.cos(angle) * speed * dt;
    y += dy;
    camX += (x - camX) * Math.min(1, dt * 3);
    invuln = Math.max(0, invuln - dt);
    if (jumpT > 0) jumpT = Math.max(0, jumpT - dt);

    const air = jumpT > 0;
    trail.push({ x, y, air });
    trail = trail.filter((p) => p.y > y - stage.height);

    spawnUntil(y + stage.height * 1.5);
    objects = objects.filter((o) => o.y > y - stage.height * 0.5);

    // Collisions & gates
    for (const o of objects) {
      if (o.kind === 'gate') {
        if (!o.passed && y >= o.y) {
          o.passed = true;
          if (Math.abs(x - o.x) <= o.gap!) {
            combo++;
            const pts = 50 * combo;
            bonus += pts;
            popup(x, y, `+${pts}`, palette().green);
            ctx.haptic(8);
          } else {
            combo = 0;
            popup(o.x, o.y, 'Missed', palette().red);
          }
          stats();
        }
        continue;
      }
      if (o.hit) continue;
      const dx = x - o.x;
      const dyo = y - o.y;
      if (o.kind === 'ramp') {
        if (!air && Math.abs(dx) < 16 * o.size && Math.abs(dyo) < 6) {
          o.hit = true;
          jumpT = jumpDur = JUMP_TIME * 1.6;
          bonus += 25;
          popup(x, y, '+25', palette().blue);
          stats();
        }
        continue;
      }
      const r = o.kind === 'tree' ? 8 * o.size : 9 * o.size;
      if (dx * dx + dyo * dyo < r * r) {
        if (o.kind === 'rock' && air) continue;
        if (invuln > 0) continue;
        o.hit = true;
        crash();
        return;
      }
    }
    if (Math.floor((y - dy) / 100) !== Math.floor(y / 100)) stats();
  };

  // ---------- Drawing ----------
  const drawTree = (c: CanvasRenderingContext2D, sx: number, sy: number, s: number) => {
    const pal = palette();
    c.fillStyle = pal.dark ? '#6b4a33' : '#8a5a3b';
    c.fillRect(sx - 2 * s, sy - 6 * s, 4 * s, 7 * s);
    c.fillStyle = pal.green;
    for (let i = 0; i < 3; i++) {
      const w = (14 - i * 3) * s;
      const top = sy - (14 + i * 8) * s - 8 * s;
      c.beginPath();
      c.moveTo(sx, top);
      c.lineTo(sx + w, top + 16 * s);
      c.lineTo(sx - w, top + 16 * s);
      c.closePath();
      c.fill();
    }
  };

  const drawRock = (c: CanvasRenderingContext2D, sx: number, sy: number, s: number) => {
    const pal = palette();
    c.fillStyle = pal.muted;
    c.beginPath();
    c.moveTo(sx - 11 * s, sy + 2 * s);
    c.lineTo(sx - 7 * s, sy - 6 * s);
    c.lineTo(sx + 1 * s, sy - 9 * s);
    c.lineTo(sx + 9 * s, sy - 4 * s);
    c.lineTo(sx + 11 * s, sy + 2 * s);
    c.closePath();
    c.fill();
  };

  const drawRamp = (c: CanvasRenderingContext2D, sx: number, sy: number, s: number) => {
    const pal = palette();
    c.fillStyle = pal.blue;
    c.globalAlpha = 0.35;
    c.beginPath();
    c.moveTo(sx - 16 * s, sy - 7 * s);
    c.lineTo(sx + 16 * s, sy - 7 * s);
    c.lineTo(sx + 18 * s, sy + 5 * s);
    c.lineTo(sx - 18 * s, sy + 5 * s);
    c.closePath();
    c.fill();
    c.globalAlpha = 1;
    c.strokeStyle = pal.blue;
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(sx - 18 * s, sy + 5 * s);
    c.lineTo(sx + 18 * s, sy + 5 * s);
    c.stroke();
  };

  const drawFlag = (c: CanvasRenderingContext2D, sx: number, sy: number, color: string, side: number) => {
    c.strokeStyle = palette().text;
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(sx, sy);
    c.lineTo(sx, sy - 24);
    c.stroke();
    c.fillStyle = color;
    c.beginPath();
    c.moveTo(sx, sy - 24);
    c.lineTo(sx + 12 * side, sy - 19);
    c.lineTo(sx, sy - 14);
    c.closePath();
    c.fill();
  };

  const drawSkier = (c: CanvasRenderingContext2D, sx: number, sy: number) => {
    const pal = palette();
    const lift = jumpT > 0 ? Math.sin((1 - jumpT / jumpDur) * Math.PI) * 14 * (jumpDur / JUMP_TIME) : 0;
    if (lift > 0) {
      c.fillStyle = pal.text;
      c.globalAlpha = 0.15;
      c.beginPath();
      c.ellipse(sx, sy + 2, 10, 4, 0, 0, Math.PI * 2);
      c.fill();
      c.globalAlpha = 1;
    }
    c.save();
    c.translate(sx, sy - lift);
    const blink = invuln > 0 && Math.floor(invuln * 10) % 2 === 0;
    if (blink) c.globalAlpha = 0.4;
    if (phase === 'crashed') {
      c.rotate(crashT * 12);
    }
    // Skis: perpendicular-ish to travel direction, drawn along the heading.
    c.save();
    c.rotate(-angle);
    c.strokeStyle = pal.text;
    c.lineWidth = 2.4;
    c.lineCap = 'round';
    for (const off of [-3.5, 3.5]) {
      c.beginPath();
      c.moveTo(off, -7);
      c.lineTo(off, 11);
      c.stroke();
    }
    c.restore();
    // Body
    c.fillStyle = pal.red;
    c.beginPath();
    c.roundRect(-5, -14, 10, 12, 4);
    c.fill();
    c.fillStyle = pal.text;
    c.beginPath();
    c.arc(0, -17, 4, 0, Math.PI * 2);
    c.fill();
    // Poles
    c.strokeStyle = pal.muted;
    c.lineWidth = 1.5;
    const lean = Math.sin(angle) * 5;
    for (const side of [-1, 1]) {
      c.beginPath();
      c.moveTo(side * 6, -9);
      c.lineTo(side * 9 - lean, 4);
      c.stroke();
    }
    c.restore();
  };

  const render = () => {
    const c = stage.begin();
    const pal = palette();
    const W = stage.width;
    const H = stage.height;
    c.fillStyle = pal.surface;
    c.fillRect(0, 0, W, H);

    const ox = W / 2 - camX;
    const oy = skierScreenY() - y;

    // Ski tracks
    c.strokeStyle = pal.border;
    c.lineWidth = 1.5;
    for (const off of [-3.5, 3.5]) {
      c.beginPath();
      let drawing = false;
      for (const p of trail) {
        if (p.air) {
          drawing = false;
          continue;
        }
        const tx = p.x + ox + off;
        const ty = p.y + oy;
        if (!drawing) c.moveTo(tx, ty);
        else c.lineTo(tx, ty);
        drawing = true;
      }
      c.stroke();
    }

    // Objects sorted by y so nearer things overlap farther ones.
    const sorted = objects.slice().sort((a, b) => a.y - b.y);
    let skierDrawn = false;
    for (const o of sorted) {
      if (!skierDrawn && o.y > y) {
        drawSkier(c, x + ox, y + oy);
        skierDrawn = true;
      }
      const sx = o.x + ox;
      const sy = o.y + oy;
      if (sy < -40 || sy > H + 60) continue;
      if (o.kind === 'tree') drawTree(c, sx, sy, o.size);
      else if (o.kind === 'rock') drawRock(c, sx, sy, o.size);
      else if (o.kind === 'ramp') drawRamp(c, sx, sy, o.size);
      else if (o.kind === 'gate') {
        const done = o.passed;
        c.globalAlpha = done ? 0.4 : 1;
        drawFlag(c, sx - o.gap!, sy, pal.red, -1);
        drawFlag(c, sx + o.gap!, sy, pal.blue, 1);
        c.globalAlpha = 1;
      }
    }
    if (!skierDrawn) drawSkier(c, x + ox, y + oy);

    c.save();
    c.translate(ox, oy);
    drawParticles(c, particles);
    for (const p of popups) {
      c.globalAlpha = Math.min(1, p.t * 2);
      text(c, p.text, p.x, p.y - 30 - (1 - p.t) * 24, { size: 16, weight: 750, color: p.color });
    }
    c.globalAlpha = 1;
    c.restore();

    // Speed meter
    const kmh = Math.round(speed * 0.18);
    text(c, `${kmh} km/h`, W - 10, H - 14, { size: 13, weight: 650, color: pal.muted, align: 'right' });

    if (phase === 'ready') {
      c.fillStyle = pal.surface;
      c.globalAlpha = 0.85;
      c.fillRect(0, H * 0.6 - 30, W, 60);
      c.globalAlpha = 1;
      text(c, ctx.isTouch ? 'Touch and drag to start' : 'Press Down or Space to start', W / 2, H * 0.6 - 8, { size: 17, color: pal.text });
      text(c, 'Pass between the flags', W / 2, H * 0.6 + 14, { size: 13, color: pal.muted });
    }
  };

  // ---------- Input ----------
  const area = stage.canvas.parentElement!;
  const aimAt = (px: number) => {
    const skierSX = stage.width / 2 + (x - camX);
    targetAngle = clamp(Math.atan2(px - skierSX, 140), -MAX_ANGLE, MAX_ANGLE);
  };
  gestures(
    area,
    {
      press: (p) => {
        start();
        if (phase === 'playing') aimAt(p.x);
      },
      move: (p) => aimAt(p.x),
      release: () => (targetAngle = null),
      doubleTap: () => jump(),
    },
    { signal, toLocal: stage.toLocal, doubleTapMs: 320 },
  );
  const kb = keyboard(signal, (e) => {
    if (e.code === 'Space') jump();
    else if (['ArrowDown', 'ArrowLeft', 'ArrowRight', 's', 'a', 'd'].includes(e.key)) start();
    else if (e.key === 'p' || e.key === 'Escape') phase === 'paused' ? resume() : pause();
  });

  loop(update, render, signal);
  reset();
  stage.onResize(() => spawnUntil(y + stage.height * 1.5));

  let pausedFrom: Phase = 'playing';
  function pause() {
    if (phase !== 'playing' && phase !== 'crashed') return;
    pausedFrom = phase;
    phase = 'paused';
    targetAngle = null;
    overlay.show({ title: 'Paused', actions: [{ label: 'Resume', primary: true, onClick: resume }] });
  }
  function resume() {
    if (phase !== 'paused') return;
    phase = pausedFrom;
    overlay.hide();
  }
  return { pause, resume, isPaused: () => phase === 'paused' };
});
