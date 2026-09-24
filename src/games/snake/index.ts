import { palette } from '../../core/theme';
import { defineGame } from '../../core/types';
import { burst, drawParticles, text, updateParticles, type Particle } from '../../lib/draw';
import { gestures, type Direction } from '../../lib/gestures';
import { keyboard } from '../../lib/keyboard';
import { loop } from '../../lib/loop';
import { createOverlay } from '../../lib/overlay';
import { createStage } from '../../lib/stage';

const CELL = 20;
type P = { x: number; y: number };
const VEC: Record<Direction, P> = { up: { x: 0, y: -1 }, down: { x: 0, y: 1 }, left: { x: -1, y: 0 }, right: { x: 1, y: 0 } };
const OPPOSITE: Record<Direction, Direction> = { up: 'down', down: 'up', left: 'right', right: 'left' };

export default defineGame((ctx) => {
  const { root, signal } = ctx;
  const portrait = root.clientHeight >= root.clientWidth;
  const COLS = portrait ? 17 : 27;
  const aspect = Math.max(1, root.clientHeight) / Math.max(1, root.clientWidth);
  const ROWS = Math.max(12, Math.min(portrait ? 28 : 18, Math.round(COLS * aspect)));
  const stage = createStage(root, { width: COLS * CELL, height: ROWS * CELL }, signal);
  const overlay = createOverlay(root, signal);

  type Phase = 'ready' | 'playing' | 'paused' | 'over';
  let phase: Phase = 'ready';
  let snake: P[] = [];
  let dir: Direction = 'right';
  let queue: Direction[] = [];
  let food: P = { x: 0, y: 0 };
  let score = 0;
  let acc = 0;
  let ate = 0; // flash timer
  const particles: Particle[] = [];

  const best = () => ctx.storage.get<number>('best:score', 0);
  const stats = () =>
    ctx.setStats([
      { label: 'Score', value: score },
      { label: 'Best', value: Math.max(best(), score) },
    ]);

  const stepTime = () => Math.max(0.055, 0.14 - snake.length * 0.0018);

  const placeFood = () => {
    const free: P[] = [];
    for (let y = 0; y < ROWS; y++)
      for (let x = 0; x < COLS; x++) if (!snake.some((s) => s.x === x && s.y === y)) free.push({ x, y });
    food = free[Math.floor(Math.random() * free.length)] ?? { x: -1, y: -1 };
  };

  const reset = () => {
    const cy = Math.floor(ROWS / 2);
    const cx = Math.floor(COLS / 2) - 2;
    snake = [{ x: cx, y: cy }, { x: cx - 1, y: cy }, { x: cx - 2, y: cy }];
    dir = 'right';
    queue = [];
    score = 0;
    acc = 0;
    placeFood();
    phase = 'ready';
    overlay.hide();
    stats();
  };

  const turn = (d: Direction) => {
    if (phase === 'over' || overlay.visible) return;
    if (phase === 'ready') {
      if (d === 'left') return; // can't reverse into yourself at the start
      phase = 'playing';
    }
    if (phase === 'paused') return;
    const last = queue.length ? queue[queue.length - 1] : dir;
    if (d === last || d === OPPOSITE[last]) return;
    if (queue.length < 3) queue.push(d);
  };

  const die = () => {
    phase = 'over';
    ctx.haptic(80);
    const head = snake[0];
    burst(particles, head.x * CELL + CELL / 2, head.y * CELL + CELL / 2, palette().red, 24, 160, 4);
    const { isNew } = ctx.recordBest('score', score);
    stats();
    setTimeout(() => {
      overlay.show({
        title: 'Game over',
        body: `Score ${score}${isNew && score > 0 ? '\nNew best!' : ''}`,
        actions: [{ label: 'Play again', primary: true, onClick: reset }],
      });
    }, 500);
  };

  const step = () => {
    if (queue.length) dir = queue.shift()!;
    const v = VEC[dir];
    const head = { x: snake[0].x + v.x, y: snake[0].y + v.y };
    const eating = head.x === food.x && head.y === food.y;
    const body = eating ? snake : snake.slice(0, -1);
    if (head.x < 0 || head.y < 0 || head.x >= COLS || head.y >= ROWS || body.some((s) => s.x === head.x && s.y === head.y)) {
      return die();
    }
    snake.unshift(head);
    if (eating) {
      score += 10;
      ate = 0.15;
      ctx.haptic(8);
      burst(particles, food.x * CELL + CELL / 2, food.y * CELL + CELL / 2, palette().red, 10, 90);
      placeFood();
      stats();
    } else {
      snake.pop();
    }
  };

  const update = (dt: number) => {
    updateParticles(particles, dt);
    ate = Math.max(0, ate - dt);
    if (phase !== 'playing') return;
    acc += dt;
    while (acc >= stepTime() && phase === 'playing') {
      acc -= stepTime();
      step();
    }
  };

  const render = () => {
    const c = stage.begin();
    const pal = palette();
    const W = COLS * CELL;
    const H = ROWS * CELL;
    c.fillStyle = pal.surface;
    c.fillRect(0, 0, W, H);
    // Subtle checkerboard
    c.fillStyle = pal.surface2;
    for (let y = 0; y < ROWS; y++)
      for (let x = (y % 2); x < COLS; x += 2) c.fillRect(x * CELL, y * CELL, CELL, CELL);

    // Food
    const t = performance.now() / 1000;
    const pulse = 1 + Math.sin(t * 6) * 0.06;
    c.fillStyle = pal.red;
    c.beginPath();
    c.arc(food.x * CELL + CELL / 2, food.y * CELL + CELL / 2 + 1, CELL * 0.36 * pulse, 0, Math.PI * 2);
    c.fill();
    c.strokeStyle = pal.green;
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(food.x * CELL + CELL / 2, food.y * CELL + 5);
    c.quadraticCurveTo(food.x * CELL + CELL / 2 + 3, food.y * CELL + 1, food.x * CELL + CELL / 2 + 5, food.y * CELL + 2);
    c.stroke();

    // Snake body as a thick rounded polyline
    if (phase !== 'over' || Math.floor(t * 8) % 2 === 0) {
      c.lineCap = 'round';
      c.lineJoin = 'round';
      c.strokeStyle = pal.green;
      c.lineWidth = CELL * 0.72;
      c.beginPath();
      snake.forEach((s, i) => {
        const px = s.x * CELL + CELL / 2;
        const py = s.y * CELL + CELL / 2;
        if (i === 0) c.moveTo(px, py);
        else c.lineTo(px, py);
      });
      if (snake.length === 1) c.lineTo(snake[0].x * CELL + CELL / 2 + 0.1, snake[0].y * CELL + CELL / 2);
      c.stroke();
      // Head
      const hd = snake[0];
      const hx = hd.x * CELL + CELL / 2;
      const hy = hd.y * CELL + CELL / 2;
      c.fillStyle = pal.green;
      c.beginPath();
      c.arc(hx, hy, CELL * (0.44 + ate), 0, Math.PI * 2);
      c.fill();
      const v = VEC[dir];
      const ex = -v.y;
      const ey = v.x;
      c.fillStyle = pal.surface;
      for (const side of [-1, 1]) {
        c.beginPath();
        c.arc(hx + v.x * 3 + ex * 4.5 * side, hy + v.y * 3 + ey * 4.5 * side, 2.6, 0, Math.PI * 2);
        c.fill();
      }
      c.fillStyle = pal.text;
      for (const side of [-1, 1]) {
        c.beginPath();
        c.arc(hx + v.x * 4 + ex * 4.5 * side, hy + v.y * 4 + ey * 4.5 * side, 1.3, 0, Math.PI * 2);
        c.fill();
      }
    }
    drawParticles(c, particles);

    if (phase === 'ready') {
      c.fillStyle = pal.surface;
      c.globalAlpha = 0.85;
      c.fillRect(0, H * 0.72 - 24, W, 48);
      c.globalAlpha = 1;
      text(c, ctx.isTouch ? 'Swipe to start' : 'Press an arrow key to start', W / 2, H * 0.72, { size: 17, color: pal.text });
    }
  };

  gestures(stage.canvas.parentElement!, { swipe: (d) => turn(d) }, { signal, swipeWhileMoving: true, swipeMin: 22 });
  keyboard(signal, (e) => {
    const map: Record<string, Direction> = {
      ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
      w: 'up', s: 'down', a: 'left', d: 'right',
    };
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    if (map[k]) turn(map[k]);
    else if (k === 'p' || k === 'Escape') phase === 'paused' ? resume() : pause();
  });

  loop(update, render, signal);
  reset();

  function pause() {
    if (phase !== 'playing') return;
    phase = 'paused';
    overlay.show({ title: 'Paused', actions: [{ label: 'Resume', primary: true, onClick: resume }] });
  }
  function resume() {
    if (phase !== 'paused') return;
    overlay.hide();
    phase = 'playing';
  }
  return { pause, resume, isPaused: () => phase === 'paused' };
});
