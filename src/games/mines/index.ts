import './style.css';
import { defineGame } from '../../core/types';
import { gestures } from '../../lib/gestures';
import { keyboard } from '../../lib/keyboard';
import { createOverlay } from '../../lib/overlay';
import { formatTime, h } from '../../lib/util';

type Level = 'easy' | 'medium' | 'hard';
const LEVELS: Record<Level, { label: string; w: number; h: number; mines: number }> = {
  easy: { label: 'Easy', w: 9, h: 9, mines: 10 },
  medium: { label: 'Medium', w: 16, h: 16, mines: 40 },
  hard: { label: 'Hard', w: 30, h: 16, mines: 99 },
};

const FLAG =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 21V4" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/><path d="M7.5 4.5h10l-2.8 4 2.8 4h-10z" fill="var(--c-red)"/></svg>';
const MINE =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><g stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 3.5v17M3.5 12h17M6 6l12 12M18 6L6 18"/></g><circle cx="12" cy="12" r="5.5" fill="currentColor"/><circle cx="10" cy="10" r="1.6" fill="var(--surface)"/></svg>';

interface Cell {
  mine: boolean;
  open: boolean;
  flag: boolean;
  n: number;
  el: HTMLElement;
}

type Phase = 'ready' | 'playing' | 'won' | 'lost';

export default defineGame((ctx) => {
  const { root, signal, storage } = ctx;
  let level: Level = storage.get<Level>('level', 'easy');
  if (!(level in LEVELS)) level = 'easy';
  let flagMode = false;

  // ---------- DOM ----------
  const levelBtns = (Object.keys(LEVELS) as Level[]).map((l) =>
    h('button', { textContent: LEVELS[l].label, onclick: () => { level = l; storage.set('level', l); newGame(); } }),
  );
  const digBtn = h('button', { textContent: 'Dig', onclick: () => setMode(false) });
  const flagBtn = h('button', { textContent: 'Flag', onclick: () => setMode(true) });
  const modeSeg = h('div', { class: 'segmented' }, digBtn, flagBtn);
  const toolbar = h('div', { class: 'toolbar' }, h('div', { class: 'segmented' }, ...levelBtns));
  if (ctx.isTouch) toolbar.append(modeSeg);
  const board = h('div', { class: 'mines-board' });
  const scroller = h('div', { class: 'mines-scroller' }, board);
  root.append(toolbar, scroller);
  const overlay = createOverlay(root, signal);

  // ---------- State ----------
  let W = 9;
  let H = 9;
  let M = 10;
  let cells: Cell[] = [];
  let phase: Phase = 'ready';
  let startTime = 0;
  let elapsed = 0;
  let paused = false;
  let cursor = -1;

  const idx = (x: number, y: number) => y * W + x;
  const neighbors = (i: number) => {
    const x = i % W;
    const y = Math.floor(i / W);
    const out: number[] = [];
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const nx = x + dx;
        const ny = y + dy;
        if (nx >= 0 && ny >= 0 && nx < W && ny < H) out.push(idx(nx, ny));
      }
    return out;
  };

  const time = () => (phase === 'playing' && !paused ? elapsed + (performance.now() - startTime) / 1000 : elapsed);
  const flags = () => cells.filter((c) => c.flag).length;

  const updateStats = () => {
    ctx.setStats([
      { label: 'Mines', value: M - flags() },
      { label: 'Time', value: formatTime(time()) },
    ]);
  };

  function setMode(flag: boolean) {
    flagMode = flag;
    digBtn.setAttribute('aria-pressed', String(!flag));
    flagBtn.setAttribute('aria-pressed', String(flag));
  }

  const sizeBoard = () => {
    const availW = scroller.clientWidth - 18;
    const availH = scroller.clientHeight - 18;
    const minCell = ctx.isTouch ? 32 : 22;
    const size = Math.max(minCell, Math.min(44, Math.floor(availW / W) - 1, Math.floor(availH / H) - 1));
    board.style.setProperty('--cell', `${size}px`);
    board.style.gridTemplateColumns = `repeat(${W}, var(--cell))`;
  };

  function newGame() {
    overlay.hide();
    const cfg = LEVELS[level];
    // On a tall screen, stand the wide board on its side.
    const portrait = scroller.clientHeight > scroller.clientWidth;
    W = portrait ? Math.min(cfg.w, cfg.h) : Math.max(cfg.w, cfg.h);
    H = portrait ? Math.max(cfg.w, cfg.h) : Math.min(cfg.w, cfg.h);
    M = cfg.mines;
    phase = 'ready';
    elapsed = 0;
    paused = false;
    cursor = -1;
    levelBtns.forEach((b, i) => b.setAttribute('aria-pressed', String(Object.keys(LEVELS)[i] === level)));
    board.replaceChildren();
    cells = Array.from({ length: W * H }, () => {
      const el = h('div', { class: 'mc' });
      board.append(el);
      return { mine: false, open: false, flag: false, n: 0, el };
    });
    sizeBoard();
    board.classList.remove('lost', 'won');
    updateStats();
  }

  const layMines = (safe: number) => {
    const forbidden = new Set([safe, ...neighbors(safe)]);
    const spots = cells.map((_, i) => i).filter((i) => !forbidden.has(i));
    for (let k = 0; k < M; k++) {
      const j = k + Math.floor(Math.random() * (spots.length - k));
      [spots[k], spots[j]] = [spots[j], spots[k]];
      cells[spots[k]].mine = true;
    }
    cells.forEach((c, i) => (c.n = neighbors(i).filter((j) => cells[j].mine).length));
  };

  const paint = (i: number) => {
    const c = cells[i];
    const el = c.el;
    el.className = 'mc';
    el.innerHTML = '';
    if (c.open) {
      el.classList.add('open');
      if (c.mine) {
        el.innerHTML = MINE;
        el.classList.add('mine');
      } else if (c.n) {
        el.textContent = String(c.n);
        el.dataset.n = String(c.n);
      }
    } else if (c.flag) {
      el.innerHTML = FLAG;
      el.classList.add('flag');
    }
    if (i === cursor) el.classList.add('cursor');
  };

  const reveal = (start: number) => {
    const stack = [start];
    while (stack.length) {
      const i = stack.pop()!;
      const c = cells[i];
      if (c.open || c.flag) continue;
      c.open = true;
      paint(i);
      if (!c.mine && c.n === 0) stack.push(...neighbors(i));
    }
  };

  const lose = (hit: number) => {
    elapsed = time();
    phase = 'lost';
    ctx.haptic(60);
    cells.forEach((c, i) => {
      if (c.mine && !c.flag) {
        c.open = true;
        paint(i);
      } else if (c.flag && !c.mine) {
        c.el.classList.add('wrong');
      }
    });
    cells[hit].el.classList.add('hit');
    board.classList.add('lost');
    updateStats();
    setTimeout(() => {
      if (phase !== 'lost') return;
      overlay.show({
        title: 'Boom',
        body: `You cleared ${cells.filter((c) => c.open && !c.mine).length} of ${W * H - M} squares.`,
        actions: [
          { label: 'Look at board', onClick: () => overlay.hide() },
          { label: 'Play again', primary: true, onClick: newGame },
        ],
      });
    }, 700);
  };

  const checkWin = () => {
    if (cells.some((c) => !c.mine && !c.open)) return;
    elapsed = time();
    phase = 'won';
    cells.forEach((c, i) => {
      if (c.mine && !c.flag) {
        c.flag = true;
        paint(i);
      }
    });
    board.classList.add('won');
    const { best, isNew } = ctx.recordBest(level, Math.round(elapsed * 10) / 10, 'low');
    updateStats();
    ctx.haptic(30);
    overlay.show({
      title: 'Cleared!',
      body: `${LEVELS[level].label} in ${formatTime(elapsed)}\n${isNew ? 'New best time!' : `Best ${formatTime(best)}`}`,
      actions: [{ label: 'Play again', primary: true, onClick: newGame }],
    });
  };

  const dig = (i: number) => {
    if (phase === 'won' || phase === 'lost' || paused) return;
    const c = cells[i];
    if (phase === 'ready') {
      layMines(i);
      phase = 'playing';
      startTime = performance.now();
    }
    if (c.flag) return;
    if (c.open) {
      // Chord: if the right number of flags surround it, open the rest.
      if (!c.n) return;
      const around = neighbors(i);
      if (around.filter((j) => cells[j].flag).length !== c.n) {
        around.forEach((j) => {
          if (!cells[j].open && !cells[j].flag) {
            cells[j].el.classList.add('peek');
            setTimeout(() => cells[j]?.el.classList.remove('peek'), 180);
          }
        });
        return;
      }
      const hit = around.find((j) => cells[j].mine && !cells[j].flag);
      around.forEach((j) => reveal(j));
      if (hit !== undefined) return lose(hit);
      return checkWin();
    }
    if (c.mine) {
      reveal(i);
      return lose(i);
    }
    reveal(i);
    checkWin();
  };

  const toggleFlag = (i: number) => {
    if (phase === 'won' || phase === 'lost' || paused) return;
    const c = cells[i];
    if (c.open) return dig(i); // long-press on a number also chords
    c.flag = !c.flag;
    paint(i);
    ctx.haptic(15);
    updateStats();
  };

  const cellAt = (x: number, y: number): number => {
    // Board has a 1px border and 1px gaps between cells.
    const pitch = (board.getBoundingClientRect().width - 2 + 1) / W;
    const cx = Math.floor((x - 1) / pitch);
    const cy = Math.floor((y - 1) / pitch);
    if (cx < 0 || cy < 0 || cx >= W || cy >= H) return -1;
    return idx(cx, cy);
  };

  // ---------- Input ----------
  gestures(
    board,
    {
      tap: (p, e) => {
        const i = cellAt(p.x, p.y);
        if (i < 0) return;
        if (e.pointerType === 'mouse') return dig(i);
        if (flagMode) toggleFlag(i);
        else dig(i);
      },
      longPress: (p) => {
        const i = cellAt(p.x, p.y);
        if (i < 0) return;
        if (flagMode) dig(i);
        else toggleFlag(i);
      },
      press: (p, e) => {
        const i = cellAt(p.x, p.y);
        if (i >= 0 && !cells[i].open && !cells[i].flag && e.pointerType !== 'mouse') cells[i].el.classList.add('pressing');
      },
      release: () => board.querySelectorAll('.pressing').forEach((el) => el.classList.remove('pressing')),
    },
    { signal, slop: 8, longPressMs: 380 },
  );
  // Right-click to flag with a mouse.
  board.addEventListener(
    'mousedown',
    (e) => {
      if (e.button !== 2) return;
      const r = board.getBoundingClientRect();
      const i = cellAt(e.clientX - r.left, e.clientY - r.top);
      if (i >= 0) toggleFlag(i);
    },
    { signal },
  );

  keyboard(signal, (e) => {
    const moves: Record<string, [number, number]> = {
      ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0],
    };
    if (moves[e.key]) {
      const prev = cursor;
      if (cursor < 0) cursor = idx(Math.floor(W / 2), Math.floor(H / 2));
      else {
        const x = Math.min(W - 1, Math.max(0, (cursor % W) + moves[e.key][0]));
        const y = Math.min(H - 1, Math.max(0, Math.floor(cursor / W) + moves[e.key][1]));
        cursor = idx(x, y);
      }
      if (prev >= 0) paint(prev);
      paint(cursor);
      cells[cursor].el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    } else if ((e.code === 'Space' || e.key === 'Enter') && cursor >= 0) {
      dig(cursor);
    } else if (e.key.toLowerCase() === 'f' && cursor >= 0) {
      toggleFlag(cursor);
    }
  });

  const ro = new ResizeObserver(sizeBoard);
  ro.observe(scroller);
  const tick = window.setInterval(() => phase === 'playing' && updateStats(), 250);
  signal.addEventListener('abort', () => {
    ro.disconnect();
    clearInterval(tick);
  });

  setMode(false);
  newGame();

  function pause() {
    if (phase !== 'playing' || paused) return;
    elapsed = time();
    paused = true;
    board.classList.add('hidden');
    overlay.show({ title: 'Paused', actions: [{ label: 'Resume', primary: true, onClick: resume }] });
  }
  function resume() {
    if (!paused) return;
    paused = false;
    startTime = performance.now();
    board.classList.remove('hidden');
    overlay.hide();
  }

  return { pause, resume, isPaused: () => paused };
});
