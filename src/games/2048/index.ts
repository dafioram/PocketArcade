import './style.css';
import { defineGame } from '../../core/types';
import { gestures, type Direction } from '../../lib/gestures';
import { keyboard } from '../../lib/keyboard';
import { createOverlay } from '../../lib/overlay';
import { h, pick } from '../../lib/util';

const N = 4;
const SLIDE_MS = 110;

interface Tile {
  id: number;
  value: number;
  x: number;
  y: number;
  el: HTMLElement;
}

interface Saved {
  cells: number[]; // row-major values, 0 = empty
  score: number;
  won: boolean;
  keepGoing: boolean;
}

export default defineGame((ctx) => {
  const { root, signal, storage } = ctx;

  const board = h('div', { class: 'g2048-board' });
  for (let i = 0; i < N * N; i++) board.append(h('div', { class: 'g2048-cell' }));
  const area = h('div', { class: 'g2048-area' }, board);
  const undoBtn = h('button', { class: 'btn', textContent: 'Undo' });
  const newBtn = h('button', { class: 'btn', textContent: 'New game' });
  root.append(area, h('div', { class: 'toolbar' }, undoBtn, newBtn));
  const overlay = createOverlay(root, signal);

  let grid: (Tile | null)[][] = [];
  let score = 0;
  let won = false;
  let keepGoing = false;
  let nextId = 1;
  let history: Saved | null = null;
  let pending: Array<() => void> = [];
  let pendingTimer: number | undefined;

  const best = () => storage.get<number>('best:score', 0);

  const updateStats = () => {
    ctx.setStats([
      { label: 'Score', value: score.toLocaleString() },
      { label: 'Best', value: Math.max(best(), score).toLocaleString() },
    ]);
    undoBtn.disabled = !history;
  };

  const place = (t: Tile) => {
    t.el.style.setProperty('--x', String(t.x));
    t.el.style.setProperty('--y', String(t.y));
  };

  const paint = (t: Tile) => {
    t.el.textContent = String(t.value);
    const level = Math.min(Math.log2(t.value), 12);
    t.el.dataset.level = String(level);
    t.el.dataset.digits = String(Math.min(String(t.value).length, 5));
  };

  const makeTile = (x: number, y: number, value: number, appear = true): Tile => {
    const el = h('div', { class: 'g2048-tile' });
    const t: Tile = { id: nextId++, value, x, y, el };
    paint(t);
    place(t);
    if (appear) el.classList.add('appear');
    board.append(el);
    grid[y][x] = t;
    return t;
  };

  const emptyCells = () => {
    const out: Array<[number, number]> = [];
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (!grid[y][x]) out.push([x, y]);
    return out;
  };

  const spawn = () => {
    const cells = emptyCells();
    if (!cells.length) return;
    const [x, y] = pick(cells);
    makeTile(x, y, Math.random() < 0.9 ? 2 : 4);
  };

  const snapshot = (): Saved => ({
    cells: grid.flat().map((t) => t?.value ?? 0),
    score,
    won,
    keepGoing,
  });

  const load = (s: Saved) => {
    board.querySelectorAll('.g2048-tile').forEach((e) => e.remove());
    grid = Array.from({ length: N }, () => Array<Tile | null>(N).fill(null));
    s.cells.forEach((v, i) => {
      if (v) makeTile(i % N, Math.floor(i / N), v, false);
    });
    score = s.score;
    won = s.won;
    keepGoing = s.keepGoing;
  };

  const save = () => storage.set('state', snapshot());

  const flush = () => {
    clearTimeout(pendingTimer);
    const jobs = pending;
    pending = [];
    jobs.forEach((j) => j());
  };

  const canMove = () => {
    if (emptyCells().length) return true;
    for (let y = 0; y < N; y++)
      for (let x = 0; x < N; x++) {
        const v = grid[y][x]!.value;
        if ((x + 1 < N && grid[y][x + 1]!.value === v) || (y + 1 < N && grid[y + 1][x]!.value === v)) return true;
      }
    return false;
  };

  const newGame = () => {
    flush();
    overlay.hide();
    history = null;
    load({ cells: Array(N * N).fill(0), score: 0, won: false, keepGoing: false });
    spawn();
    spawn();
    save();
    updateStats();
  };

  const vectors: Record<Direction, [number, number]> = {
    up: [0, -1],
    down: [0, 1],
    left: [-1, 0],
    right: [1, 0],
  };

  const move = (dir: Direction) => {
    if (overlay.visible) return;
    flush();
    const [vx, vy] = vectors[dir];
    const xs = [...Array(N).keys()];
    const ys = [...Array(N).keys()];
    if (vx === 1) xs.reverse();
    if (vy === 1) ys.reverse();

    const before = snapshot();
    const merged = new Set<number>();
    const removals: Tile[] = [];
    const upgrades: Tile[] = [];
    let moved = false;

    for (const y of ys)
      for (const x of xs) {
        const t = grid[y][x];
        if (!t) continue;
        let cx = x;
        let cy = y;
        while (true) {
          const nx = cx + vx;
          const ny = cy + vy;
          if (nx < 0 || ny < 0 || nx >= N || ny >= N) break;
          const other = grid[ny][nx];
          if (!other) {
            cx = nx;
            cy = ny;
            continue;
          }
          if (other.value === t.value && !merged.has(other.id)) {
            // Merge: t slides onto other and disappears; other doubles.
            grid[y][x] = null;
            other.value *= 2;
            merged.add(other.id);
            score += other.value;
            t.x = nx;
            t.y = ny;
            t.el.style.zIndex = '0';
            place(t);
            removals.push(t);
            upgrades.push(other);
            moved = true;
            cx = -1;
          }
          break;
        }
        if (cx === -1) continue;
        if (cx !== x || cy !== y) {
          grid[y][x] = null;
          grid[cy][cx] = t;
          t.x = cx;
          t.y = cy;
          place(t);
          moved = true;
        }
      }

    if (!moved) {
      board.classList.remove('nudge');
      void board.offsetWidth;
      board.classList.add('nudge');
      return;
    }

    history = before;
    pending.push(() => {
      removals.forEach((t) => t.el.remove());
      upgrades.forEach((t) => {
        paint(t);
        t.el.classList.remove('pop', 'appear');
        void t.el.offsetWidth;
        t.el.classList.add('pop');
      });
      spawn();
      const top = Math.max(...grid.flat().map((t) => t?.value ?? 0));
      if (score > best()) ctx.recordBest('score', score);
      save();
      updateStats();
      if (top >= 2048 && !won) {
        won = true;
        save();
        ctx.haptic(30);
        overlay.show({
          title: 'You made 2048!',
          body: `Score ${score.toLocaleString()}`,
          actions: [
            {
              label: 'Keep going',
              primary: true,
              onClick: () => {
                keepGoing = true;
                save();
                overlay.hide();
              },
            },
            { label: 'New game', onClick: newGame },
          ],
        });
      } else if (!canMove()) {
        storage.set('state', undefined);
        overlay.show({
          title: 'No more moves',
          body: `Score ${score.toLocaleString()}${score >= best() && score > 0 ? '\nNew best!' : ''}`,
          actions: [
            { label: 'Undo', onClick: () => { overlay.hide(); undo(); } },
            { label: 'New game', primary: true, onClick: newGame },
          ],
        });
      }
    });
    pendingTimer = window.setTimeout(flush, SLIDE_MS);
    updateStats();
  };

  const undo = () => {
    flush();
    if (!history) return;
    overlay.hide();
    load(history);
    history = null;
    save();
    updateStats();
  };

  gestures(area, { swipe: move }, { signal, swipeMin: 24 });
  keyboard(signal, (e) => {
    const map: Record<string, Direction> = {
      ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
      w: 'up', s: 'down', a: 'left', d: 'right',
    };
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    if (map[k]) move(map[k]);
    else if (k === 'u') undo();
    else if (k === 'n') newGame();
  });
  undoBtn.onclick = undo;
  newBtn.onclick = newGame;

  const saved = storage.get<Saved | null>('state', null);
  if (saved && saved.cells?.length === N * N && saved.cells.some((v) => v)) {
    load(saved);
    updateStats();
  } else {
    newGame();
  }

  return {
    destroy() {
      flush();
    },
  };
});
