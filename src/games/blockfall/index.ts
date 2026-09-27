import { palette, type Palette } from '../../core/theme';
import { defineGame } from '../../core/types';
import { burst, drawParticles, roundRect, text, updateParticles, type Particle } from '../../lib/draw';
import { gestures, type Point } from '../../lib/gestures';
import { keyboard } from '../../lib/keyboard';
import { loop } from '../../lib/loop';
import { createOverlay } from '../../lib/overlay';
import { createStage } from '../../lib/stage';

const COLS = 10;
const ROWS = 20;
const CELL = 30;
const TOP = 64; // strip above the well for the "next" preview
const W = COLS * CELL;
const H = TOP + ROWS * CELL;

type Kind = 'I' | 'O' | 'T' | 'S' | 'Z' | 'J' | 'L';
const SHAPES: Record<Kind, number[][]> = {
  I: [[0, 0, 0, 0], [1, 1, 1, 1], [0, 0, 0, 0], [0, 0, 0, 0]],
  O: [[1, 1], [1, 1]],
  T: [[0, 1, 0], [1, 1, 1], [0, 0, 0]],
  S: [[0, 1, 1], [1, 1, 0], [0, 0, 0]],
  Z: [[1, 1, 0], [0, 1, 1], [0, 0, 0]],
  J: [[1, 0, 0], [1, 1, 1], [0, 0, 0]],
  L: [[0, 0, 1], [1, 1, 1], [0, 0, 0]],
};
const KINDS = Object.keys(SHAPES) as Kind[];
const colorOf = (pal: Palette, k: Kind) =>
  ({ I: pal.teal, O: pal.yellow, T: pal.purple, S: pal.green, Z: pal.red, J: pal.blue, L: pal.orange })[k];

interface Piece {
  kind: Kind;
  m: number[][];
  x: number;
  y: number;
}

const rotateCW = (m: number[][]) => m.map((_, r) => m.map((row) => row[r]).reverse());
const rotateCCW = (m: number[][]) => m.map((_, r) => m.map((row) => row[row.length - 1 - r]));
const KICKS: Array<[number, number]> = [[0, 0], [-1, 0], [1, 0], [-2, 0], [2, 0], [0, -1], [-1, -1], [1, -1]];
const LINE_POINTS = [0, 100, 300, 500, 800];

export default defineGame((ctx) => {
  const { root, signal } = ctx;
  const stage = createStage(root, { width: W, height: H }, signal);
  const overlay = createOverlay(root, signal);

  type Phase = 'playing' | 'clearing' | 'paused' | 'over';
  let phase: Phase = 'playing';
  let board: (Kind | null)[][] = [];
  let piece!: Piece;
  let queue: Kind[] = [];
  let bag: Kind[] = [];
  let score = 0;
  let lines = 0;
  let level = 1;
  let fallTimer = 0;
  let lockTimer = 0;
  let lockResets = 0;
  let clearing: number[] = [];
  let clearTimer = 0;
  let dropTrail: { kind: Kind; x0: number; x1: number; y0: number; y1: number; t: number } | null = null;
  let softDrop = false;
  let grabbed = false;
  const particles: Particle[] = [];

  const stats = () =>
    ctx.setStats([
      { label: 'Score', value: score.toLocaleString() },
      { label: 'Lines', value: lines },
      { label: 'Level', value: level },
    ]);

  // ---------- Rules ----------
  const nextKind = (): Kind => {
    if (!bag.length) {
      bag = [...KINDS];
      for (let i = bag.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [bag[i], bag[j]] = [bag[j], bag[i]];
      }
    }
    return bag.pop()!;
  };

  const collides = (m: number[][], x: number, y: number) => {
    for (let r = 0; r < m.length; r++)
      for (let c = 0; c < m[r].length; c++) {
        if (!m[r][c]) continue;
        const bx = x + c;
        const by = y + r;
        if (bx < 0 || bx >= COLS || by >= ROWS) return true;
        if (by >= 0 && board[by][bx]) return true;
      }
    return false;
  };

  const cells = (p: Piece) => {
    const out: Array<[number, number]> = [];
    p.m.forEach((row, r) => row.forEach((v, c) => v && out.push([p.x + c, p.y + r])));
    return out;
  };

  const spawn = () => {
    while (queue.length < 2) queue.push(nextKind());
    const kind = queue.shift()!;
    queue.push(nextKind());
    const m = SHAPES[kind].map((r) => r.slice());
    piece = { kind, m, x: Math.floor((COLS - m[0].length) / 2), y: kind === 'I' ? -1 : 0 };
    fallTimer = 0;
    lockTimer = 0;
    lockResets = 0;
    grabbed = false;
    if (collides(piece.m, piece.x, piece.y)) gameOver();
  };

  const grounded = () => collides(piece.m, piece.x, piece.y + 1);

  /** Moving or rotating a landed piece buys it a little more time (limited). */
  const touched = () => {
    if (grounded() && lockResets < 15) {
      lockTimer = 0;
      lockResets++;
    }
  };

  const shift = (dx: number): boolean => {
    if (phase !== 'playing' || collides(piece.m, piece.x + dx, piece.y)) return false;
    piece.x += dx;
    touched();
    return true;
  };

  const rotate = (dir: 1 | -1) => {
    if (phase !== 'playing' || piece.kind === 'O') return;
    const m = dir === 1 ? rotateCW(piece.m) : rotateCCW(piece.m);
    for (const [kx, ky] of KICKS) {
      if (!collides(m, piece.x + kx, piece.y + ky)) {
        piece.m = m;
        piece.x += kx;
        piece.y += ky;
        touched();
        ctx.haptic(4);
        return;
      }
    }
  };

  const ghostY = () => {
    let y = piece.y;
    while (!collides(piece.m, piece.x, y + 1)) y++;
    return y;
  };

  const hardDrop = () => {
    if (phase !== 'playing') return;
    const y = ghostY();
    const cs = cells(piece);
    const xs = cs.map(([x]) => x);
    dropTrail = { kind: piece.kind, x0: Math.min(...xs), x1: Math.max(...xs) + 1, y0: piece.y, y1: y, t: 0.18 };
    score += (y - piece.y) * 2;
    piece.y = y;
    ctx.haptic(10);
    lock();
  };

  const lock = () => {
    for (const [x, y] of cells(piece)) {
      if (y < 0) return gameOver();
      board[y][x] = piece.kind;
    }
    grabbed = false;
    const full = board.map((row, i) => (row.every(Boolean) ? i : -1)).filter((i) => i >= 0);
    if (full.length) {
      clearing = full;
      clearTimer = 0.22;
      phase = 'clearing';
      const pal = palette();
      for (const r of full)
        for (let c = 0; c < COLS; c++) burst(particles, c * CELL + CELL / 2, TOP + r * CELL + CELL / 2, colorOf(pal, board[r][c]!), 3, 90, 3);
      score += LINE_POINTS[full.length] * level;
      lines += full.length;
      level = 1 + Math.floor(lines / 10);
      ctx.haptic(full.length >= 4 ? 40 : 15);
    } else {
      spawn();
    }
    stats();
  };

  const finishClear = () => {
    board = board.filter((_, i) => !clearing.includes(i));
    while (board.length < ROWS) board.unshift(Array(COLS).fill(null));
    clearing = [];
    phase = 'playing';
    spawn();
  };

  const gameOver = () => {
    phase = 'over';
    grabbed = false;
    ctx.haptic(80);
    const { isNew } = ctx.recordBest('score', score);
    stats();
    setTimeout(
      () =>
        overlay.show({
          title: 'Game over',
          body: `Score ${score.toLocaleString()} · ${lines} line${lines === 1 ? '' : 's'}${isNew && score > 0 ? '\nNew best!' : ''}`,
          actions: [{ label: 'Play again', primary: true, onClick: newGame }],
        }),
      500,
    );
  };

  const newGame = () => {
    overlay.hide();
    board = Array.from({ length: ROWS }, () => Array(COLS).fill(null));
    queue = [];
    bag = [];
    score = 0;
    lines = 0;
    level = 1;
    phase = 'playing';
    spawn();
    stats();
  };

  const gravity = () => Math.max(0.04, 0.8 * Math.pow(0.83, level - 1));

  const update = (dt: number) => {
    updateParticles(particles, dt);
    if (dropTrail) {
      dropTrail.t -= dt;
      if (dropTrail.t <= 0) dropTrail = null;
    }
    if (phase === 'clearing') {
      clearTimer -= dt;
      if (clearTimer <= 0) finishClear();
      return;
    }
    if (phase !== 'playing') return;

    const interval = softDrop ? Math.min(0.04, gravity()) : gravity();
    if (grounded()) {
      lockTimer += dt;
      if (lockTimer >= 0.5) lock();
      return;
    }
    fallTimer += dt;
    while (fallTimer >= interval && !grounded()) {
      fallTimer -= interval;
      piece.y++;
      if (softDrop) score++;
    }
  };

  // ---------- Drawing ----------
  const block = (c: CanvasRenderingContext2D, x: number, y: number, color: string, size = CELL) => {
    c.fillStyle = color;
    roundRect(c, x + 1, y + 1, size - 2, size - 2, size * 0.18);
    c.fill();
    c.fillStyle = 'rgb(255 255 255 / 0.18)';
    roundRect(c, x + 3, y + 3, size - 6, size * 0.28, size * 0.12);
    c.fill();
  };

  const render = () => {
    const c = stage.begin();
    const pal = palette();
    c.fillStyle = pal.surface;
    c.fillRect(0, 0, W, H);

    // Next preview strip
    c.fillStyle = pal.surface2;
    c.fillRect(0, 0, W, TOP);
    text(c, 'NEXT', 14, TOP / 2, { size: 12, weight: 700, color: pal.muted, align: 'left' });
    queue.slice(0, 2).forEach((k, i) => {
      const m = SHAPES[k];
      const s = i === 0 ? 16 : 12;
      const rows = m.filter((r) => r.some(Boolean));
      const minC = Math.min(...rows.map((r) => r.indexOf(1)).filter((v) => v >= 0));
      const ox = (i === 0 ? 70 : 150) - minC * s;
      const oy = TOP / 2 - (rows.length * s) / 2;
      c.globalAlpha = i === 0 ? 1 : 0.5;
      rows.forEach((row, r) => row.forEach((v, cc) => v && block(c, ox + cc * s, oy + r * s, colorOf(pal, k), s)));
      c.globalAlpha = 1;
    });

    // Well grid
    c.strokeStyle = pal.border;
    c.lineWidth = 1;
    c.globalAlpha = 0.6;
    c.beginPath();
    for (let x = 1; x < COLS; x++) {
      c.moveTo(x * CELL + 0.5, TOP);
      c.lineTo(x * CELL + 0.5, H);
    }
    for (let y = 1; y < ROWS; y++) {
      c.moveTo(0, TOP + y * CELL + 0.5);
      c.lineTo(W, TOP + y * CELL + 0.5);
    }
    c.stroke();
    c.globalAlpha = 1;

    // Settled blocks
    const flash = phase === 'clearing' && Math.floor(clearTimer * 30) % 2 === 0;
    board.forEach((row, r) =>
      row.forEach((k, col) => {
        if (!k) return;
        const clearingRow = clearing.includes(r);
        block(c, col * CELL, TOP + r * CELL, clearingRow && flash ? pal.text : colorOf(pal, k));
      }),
    );

    if (phase === 'playing' || phase === 'paused') {
      // Column guide while steering with a finger
      if (grabbed) {
        const xs = cells(piece).map(([x]) => x);
        c.fillStyle = colorOf(pal, piece.kind);
        c.globalAlpha = 0.08;
        c.fillRect(Math.min(...xs) * CELL, TOP, (Math.max(...xs) + 1 - Math.min(...xs)) * CELL, H - TOP);
        c.globalAlpha = 1;
      }
      // Ghost
      const gy = ghostY();
      c.strokeStyle = colorOf(pal, piece.kind);
      c.lineWidth = 2;
      c.globalAlpha = 0.55;
      for (const [x, y] of cells({ ...piece, y: gy })) {
        if (y < 0) continue;
        roundRect(c, x * CELL + 3, TOP + y * CELL + 3, CELL - 6, CELL - 6, 5);
        c.stroke();
      }
      c.globalAlpha = 1;
      // Active piece
      c.save();
      c.beginPath();
      c.rect(0, TOP, W, H - TOP);
      c.clip();
      for (const [x, y] of cells(piece)) block(c, x * CELL, TOP + y * CELL, colorOf(pal, piece.kind));
      if (grabbed) {
        c.strokeStyle = pal.text;
        c.lineWidth = 2;
        for (const [x, y] of cells(piece)) {
          roundRect(c, x * CELL + 1, TOP + y * CELL + 1, CELL - 2, CELL - 2, 5);
          c.stroke();
        }
      }
      c.restore();
    }

    if (dropTrail) {
      c.fillStyle = colorOf(pal, dropTrail.kind);
      c.globalAlpha = (dropTrail.t / 0.18) * 0.25;
      c.fillRect(dropTrail.x0 * CELL + 4, TOP + Math.max(0, dropTrail.y0) * CELL, (dropTrail.x1 - dropTrail.x0) * CELL - 8, (dropTrail.y1 - Math.max(0, dropTrail.y0)) * CELL);
      c.globalAlpha = 1;
    }
    drawParticles(c, particles);
  };

  // ---------- Touch controls ----------
  // tap in line with the piece → rotate · tap left/right of it → move one column
  // press on the piece and slide → it follows your finger
  // swipe left/right anywhere → it slides as far as you swipe
  // swipe down or double-tap anywhere → drop · swipe up → rotate back
  const colAt = (x: number) => Math.floor(x / CELL);
  const SWIPE_GAIN = 1.25; // off-piece swipes: columns moved per column of finger travel
  const DOUBLE_TAP_MS = 280;
  let pressOnPiece = false;
  let grabOffset = 0;
  let pressAt: Point = { x: 0, y: 0 };
  let pieceXAtPress = 0;
  let steered = false;
  /** The last tap, so a second quick tap can undo it and drop instead. */
  let lastTap: { t: number; at: Point; piece: Piece; m: number[][]; x: number } | null = null;

  const onPiece = (p: Point) => {
    const cs = cells(piece);
    const xs = cs.map(([x]) => x);
    const ys = cs.map(([, y]) => y);
    const pad = 0.6 * CELL;
    return (
      p.x >= Math.min(...xs) * CELL - pad &&
      p.x <= (Math.max(...xs) + 1) * CELL + pad &&
      p.y >= TOP + Math.min(...ys) * CELL - pad &&
      p.y <= TOP + (Math.max(...ys) + 1) * CELL + pad
    );
  };

  const moveTo = (target: number) => {
    while (piece.x < target && shift(1));
    while (piece.x > target && shift(-1));
  };

  gestures(
    stage.canvas.parentElement!,
    {
      press: (p) => {
        pressAt = p;
        steered = false;
        pressOnPiece = phase === 'playing' && onPiece(p);
        grabOffset = colAt(p.x) - piece.x;
        pieceXAtPress = piece.x;
      },
      move: (p, info) => {
        if (phase !== 'playing') return;
        const dx = Math.abs(info.total.x);
        const dy = Math.abs(info.total.y);
        // Start steering once the finger moves sideways more than it moves vertically.
        if (!steered && dx > CELL * 0.35 && dx > dy * 0.8) steered = true;
        if (!steered) return;
        grabbed = true;
        if (pressOnPiece) {
          // Holding the piece: it sits under your finger.
          moveTo(colAt(p.x) - grabOffset);
        } else {
          // Swiping elsewhere: it moves by how far you swipe.
          moveTo(pieceXAtPress + Math.round((info.total.x / CELL) * SWIPE_GAIN));
        }
      },
      release: (p, info) => {
        const wasSteering = steered;
        grabbed = false;
        steered = false;
        if (phase !== 'playing' || wasSteering) return;
        const dx = p.x - pressAt.x;
        const dy = p.y - pressAt.y;
        if (info.moved) {
          lastTap = null;
          // Vertical swipes (measured in game units; a cell is 30).
          if (Math.abs(dy) > CELL * 1.2 && Math.abs(dy) > Math.abs(dx) * 1.2 && info.duration < 700) {
            if (dy > 0) hardDrop();
            else rotate(-1);
          }
          return;
        }
        if (info.duration > 350) return; // a hold that never moved

        const now = performance.now();
        if (lastTap && now - lastTap.t < DOUBLE_TAP_MS && Math.hypot(p.x - lastTap.at.x, p.y - lastTap.at.y) < CELL * 1.5) {
          // Double tap: take back what the first tap did, then drop.
          if (lastTap.piece === piece && !collides(lastTap.m, lastTap.x, piece.y)) {
            piece.m = lastTap.m;
            piece.x = lastTap.x;
          }
          lastTap = null;
          hardDrop();
          return;
        }
        lastTap = { t: now, at: p, piece, m: piece.m, x: piece.x };

        const xs = cells(piece).map(([x]) => x);
        const col = colAt(p.x);
        if (col < Math.min(...xs)) shift(-1);
        else if (col > Math.max(...xs)) shift(1);
        else rotate(1);
      },
    },
    { signal, toLocal: stage.toLocal, slop: 8 },
  );

  keyboard(signal, (e) => {
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    if (k === 'p' || k === 'Escape') return phase === 'paused' ? resume() : pause();
    if (phase !== 'playing') return;
    if (k === 'ArrowLeft' || k === 'a') shift(-1);
    else if (k === 'ArrowRight' || k === 'd') shift(1);
    else if (k === 'ArrowUp' || k === 'x' || k === 'w') !e.repeat && rotate(1);
    else if (k === 'z') !e.repeat && rotate(-1);
    else if (k === 'ArrowDown' || k === 's') softDrop = true;
    else if (e.code === 'Space') !e.repeat && hardDrop();
  });
  window.addEventListener(
    'keyup',
    (e) => {
      if (e.key === 'ArrowDown' || e.key.toLowerCase() === 's') softDrop = false;
    },
    { signal },
  );

  loop(update, render, signal);
  newGame();
  // Test hook (development builds only).
  if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).__blockfall = { piece: () => ({ ...piece, cells: cells(piece) }), phase: () => phase, board: () => board, lines: () => lines };

  let pausedFrom: Phase = 'playing';
  function pause() {
    if (phase !== 'playing' && phase !== 'clearing') return;
    pausedFrom = phase;
    phase = 'paused';
    grabbed = false;
    softDrop = false;
    overlay.show({ title: 'Paused', actions: [{ label: 'Resume', primary: true, onClick: resume }] });
  }
  function resume() {
    if (phase !== 'paused') return;
    phase = pausedFrom;
    overlay.hide();
  }
  return { pause, resume, isPaused: () => phase === 'paused' };
});
