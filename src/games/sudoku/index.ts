import './style.css';
import { defineGame } from '../../core/types';
import { gestures } from '../../lib/gestures';
import { keyboard } from '../../lib/keyboard';
import { createOverlay } from '../../lib/overlay';
import { formatTime, h } from '../../lib/util';
import { generate, type Difficulty } from './generator';

interface State {
  difficulty: Difficulty;
  puzzle: number[];
  solution: number[];
  values: number[];
  notes: number[]; // bitmask per cell
  elapsed: number;
  hints: number;
  done: boolean;
}

interface Step {
  i: number;
  value: number;
  notes: number;
  /** Notes cleared from peers when a value was placed. */
  peers?: Array<[number, number]>;
}

const LEVELS: Array<[Difficulty, string]> = [
  ['easy', 'Easy'],
  ['medium', 'Medium'],
  ['hard', 'Hard'],
];

const rowOf = (i: number) => Math.floor(i / 9);
const colOf = (i: number) => i % 9;
const boxOf = (i: number) => Math.floor(rowOf(i) / 3) * 3 + Math.floor(colOf(i) / 3);
const PEERS: number[][] = Array.from({ length: 81 }, (_, i) =>
  Array.from({ length: 81 }, (_, j) => j).filter(
    (j) => j !== i && (rowOf(j) === rowOf(i) || colOf(j) === colOf(i) || boxOf(j) === boxOf(i)),
  ),
);

export default defineGame((ctx) => {
  const { root, signal, storage } = ctx;

  // ---------- DOM ----------
  const levelBtns = LEVELS.map(([d, label]) => h('button', { textContent: label, onclick: () => confirmNew(d) }));
  const top = h('div', { class: 'toolbar' }, h('div', { class: 'segmented' }, ...levelBtns));

  const grid = h('div', { class: 'sd-grid' });
  const cellEls = Array.from({ length: 81 }, (_, i) => {
    const el = h('div', { class: 'sd-cell' });
    if (colOf(i) % 3 === 2 && colOf(i) < 8) el.classList.add('br');
    if (rowOf(i) % 3 === 2 && rowOf(i) < 8) el.classList.add('bb');
    grid.append(el);
    return el;
  });

  const tool = (label: string, icon: string, onClick: () => void) => {
    const b = h('button', { class: 'sd-tool', onclick: onClick });
    b.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${icon}</svg>`;
    b.append(h('span', { textContent: label }));
    return b;
  };
  const undoBtn = tool('Undo', '<path d="M9 14L4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>', () => undo());
  const eraseBtn = tool('Erase', '<path d="M20 20H9L4 15a2 2 0 0 1 0-2.8L13.2 3a2 2 0 0 1 2.8 0l4 4a2 2 0 0 1 0 2.8L11 19"/>', () => erase());
  const notesBtn = tool('Notes', '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>', () => setNotesMode(!notesMode));
  const hintBtn = tool('Hint', '<path d="M9 18h6M10 22h4"/><path d="M12 2a7 7 0 0 0-4 12.7V17h8v-2.3A7 7 0 0 0 12 2z"/>', () => hint());
  const tools = h('div', { class: 'sd-tools' }, undoBtn, eraseBtn, notesBtn, hintBtn);

  const padBtns = Array.from({ length: 9 }, (_, k) => {
    const b = h('button', { class: 'sd-num' }, h('span', { class: 'sd-num-digit', textContent: String(k + 1) }), h('span', { class: 'sd-num-left' }));
    gestures(
      b,
      {
        tap: () => input(k + 1, notesMode),
        longPress: () => {
          ctx.haptic(12);
          input(k + 1, true);
        },
      },
      { signal, longPressMs: 400 },
    );
    return b;
  });
  const pad = h('div', { class: 'sd-pad' }, ...padBtns);

  const main = h('div', { class: 'sd-main' }, grid, tools, pad);
  root.append(top, main);
  const overlay = createOverlay(root, signal);

  // ---------- State ----------
  let s: State;
  let selected = -1;
  let notesMode = false;
  let history: Step[] = [];
  let startedAt = performance.now();
  let paused = false;

  const now = () => (s.done || paused ? s.elapsed : s.elapsed + (performance.now() - startedAt) / 1000);
  const save = () => storage.set('state', { ...s, elapsed: now() });

  const updateStats = () =>
    ctx.setStats([
      { label: LEVELS.find(([d]) => d === s.difficulty)![1], value: formatTime(now()) },
      ...(s.hints ? [{ label: 'Hints', value: s.hints }] : []),
    ]);

  function setNotesMode(on: boolean) {
    notesMode = on;
    notesBtn.setAttribute('aria-pressed', String(on));
  }

  const conflicts = (i: number) => {
    const v = s.values[i];
    return !!v && PEERS[i].some((j) => s.values[j] === v);
  };

  const render = () => {
    const selVal = selected >= 0 ? s.values[selected] : 0;
    const counts = new Array(10).fill(0);
    s.values.forEach((v) => v && counts[v]++);
    for (let i = 0; i < 81; i++) {
      const el = cellEls[i];
      const v = s.values[i];
      const given = !!s.puzzle[i];
      el.classList.toggle('given', given);
      el.classList.toggle('selected', i === selected);
      el.classList.toggle(
        'peer',
        selected >= 0 && i !== selected && PEERS[selected].includes(i),
      );
      el.classList.toggle('same', !!selVal && v === selVal && i !== selected);
      el.classList.toggle('bad', !given && conflicts(i));
      if (v) {
        el.textContent = String(v);
      } else if (s.notes[i]) {
        const n = h('div', { class: 'sd-notes' });
        for (let d = 1; d <= 9; d++) {
          const on = s.notes[i] & (1 << d);
          n.append(h('span', { textContent: on ? String(d) : '', class: on && d === selVal ? 'hl' : '' }));
        }
        el.replaceChildren(n);
      } else {
        el.textContent = '';
      }
    }
    padBtns.forEach((b, k) => {
      const left = 9 - counts[k + 1];
      (b.lastElementChild as HTMLElement).textContent = left > 0 ? String(left) : '';
      b.classList.toggle('complete', left <= 0);
    });
    undoBtn.disabled = history.length === 0;
    updateStats();
  };

  const select = (i: number) => {
    selected = i;
    render();
  };

  const place = (i: number, value: number, asNote: boolean) => {
    if (s.done || i < 0 || s.puzzle[i]) return;
    const step: Step = { i, value: s.values[i], notes: s.notes[i] };
    if (asNote) {
      if (s.values[i]) return;
      s.notes[i] ^= 1 << value;
    } else {
      s.values[i] = s.values[i] === value ? 0 : value;
      s.notes[i] = 0;
      if (s.values[i]) {
        // Placing a number removes it from the notes of its row, column and box.
        step.peers = [];
        for (const j of PEERS[i]) {
          if (s.notes[j] & (1 << value)) {
            step.peers.push([j, s.notes[j]]);
            s.notes[j] &= ~(1 << value);
          }
        }
      }
    }
    history.push(step);
    if (history.length > 500) history.shift();
    render();
    checkDone();
    save();
  };

  function input(value: number, asNote: boolean) {
    if (selected < 0) {
      // No cell picked yet: highlight that number instead.
      const first = s.values.indexOf(value);
      if (first >= 0) select(first);
      return;
    }
    place(selected, value, asNote);
  }

  function erase() {
    if (selected < 0 || s.puzzle[selected] || s.done) return;
    if (!s.values[selected] && !s.notes[selected]) return;
    history.push({ i: selected, value: s.values[selected], notes: s.notes[selected] });
    s.values[selected] = 0;
    s.notes[selected] = 0;
    render();
    save();
  }

  function undo() {
    const step = history.pop();
    if (!step || s.done) return;
    s.values[step.i] = step.value;
    s.notes[step.i] = step.notes;
    step.peers?.forEach(([j, n]) => (s.notes[j] = n));
    selected = step.i;
    render();
    save();
  }

  function hint() {
    if (s.done) return;
    let i = selected;
    if (i < 0 || s.puzzle[i] || s.values[i] === s.solution[i]) {
      // Pick an empty (or wrong) cell with the fewest options.
      const open = s.values.map((v, j) => (v !== s.solution[j] ? j : -1)).filter((j) => j >= 0);
      if (!open.length) return;
      i = open[Math.floor(Math.random() * open.length)];
    }
    s.hints++;
    selected = i;
    place(i, s.solution[i], false);
    cellEls[i].classList.add('hinted');
    setTimeout(() => cellEls[i].classList.remove('hinted'), 600);
  }

  const checkDone = () => {
    if (s.values.some((v, i) => v !== s.solution[i])) return;
    s.elapsed = now();
    s.done = true;
    selected = -1;
    render();
    ctx.haptic(30);
    const time = Math.round(s.elapsed);
    const rec = s.hints === 0 ? ctx.recordBest(s.difficulty, time, 'low') : null;
    grid.classList.add('solved');
    storage.set('state', undefined);
    overlay.show({
      title: 'Solved!',
      body: `${formatTime(time)}${s.hints ? ` with ${s.hints} hint${s.hints > 1 ? 's' : ''}` : ''}${
        rec ? (rec.isNew ? '\nNew best time!' : `\nBest ${formatTime(rec.best)}`) : ''
      }`,
      actions: [{ label: 'New puzzle', primary: true, onClick: () => newGame(s.difficulty) }],
    });
  };

  function newGame(difficulty: Difficulty) {
    overlay.hide();
    const { puzzle, solution } = generate(difficulty);
    s = {
      difficulty,
      puzzle,
      solution,
      values: puzzle.slice(),
      notes: new Array(81).fill(0),
      elapsed: 0,
      hints: 0,
      done: false,
    };
    storage.set('difficulty', difficulty);
    start();
  }

  function confirmNew(d: Difficulty) {
    const progress = s && !s.done && s.values.some((v, i) => v && !s.puzzle[i]);
    if (!progress) return newGame(d);
    overlay.show({
      title: 'Start a new puzzle?',
      body: 'Your current puzzle will be lost.',
      actions: [
        { label: 'Cancel', onClick: () => overlay.hide() },
        { label: 'New puzzle', primary: true, onClick: () => newGame(d) },
      ],
    });
  }

  function start() {
    history = [];
    selected = -1;
    paused = false;
    startedAt = performance.now();
    grid.classList.remove('solved', 'hidden');
    levelBtns.forEach((b, k) => b.setAttribute('aria-pressed', String(LEVELS[k][0] === s.difficulty)));
    setNotesMode(false);
    render();
    save();
  }

  // ---------- Input ----------
  gestures(
    grid,
    {
      tap: (p) => {
        const size = grid.getBoundingClientRect().width / 9;
        const c = Math.floor(p.x / size);
        const r = Math.floor(p.y / size);
        if (r < 0 || c < 0 || r > 8 || c > 8) return;
        const i = r * 9 + c;
        select(i === selected && !s.values[i] ? -1 : i);
      },
    },
    { signal },
  );

  keyboard(signal, (e) => {
    if (overlay.visible) return;
    const moves: Record<string, [number, number]> = {
      ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1],
    };
    if (moves[e.key]) {
      const [dr, dc] = moves[e.key];
      const cur = selected < 0 ? 40 : selected;
      const r = (rowOf(cur) + dr + 9) % 9;
      const c = (colOf(cur) + dc + 9) % 9;
      select(selected < 0 ? 40 : r * 9 + c);
      return;
    }
    const digit = /^Digit([1-9])$/.exec(e.code);
    if (digit) return input(Number(digit[1]), e.shiftKey || notesMode);
    const k = e.key.toLowerCase();
    if (k === 'backspace' || k === 'delete' || k === '0') erase();
    else if (k === 'n') setNotesMode(!notesMode);
    else if (k === 'u' || (k === 'z' && (e.metaKey || e.ctrlKey))) undo();
    else if (k === 'h') hint();
    else if (k === 'escape') select(-1);
  });

  const tick = window.setInterval(() => !s.done && !paused && updateStats(), 500);
  const autosave = window.setInterval(() => !s.done && !paused && save(), 5000);
  signal.addEventListener('abort', () => {
    clearInterval(tick);
    clearInterval(autosave);
  });

  // ---------- Boot ----------
  const saved = storage.get<State | null>('state', null);
  if (saved && saved.values?.length === 81 && !saved.done) {
    s = saved;
    start();
  } else {
    newGame(storage.get<Difficulty>('difficulty', 'easy'));
  }

  function pause() {
    if (paused || s.done) return;
    s.elapsed = now();
    paused = true;
    grid.classList.add('hidden');
    save();
    overlay.show({ title: 'Paused', body: formatTime(s.elapsed), actions: [{ label: 'Resume', primary: true, onClick: resume }] });
  }
  function resume() {
    if (!paused) return;
    paused = false;
    startedAt = performance.now();
    grid.classList.remove('hidden');
    overlay.hide();
  }

  return {
    pause,
    resume,
    isPaused: () => paused,
    destroy: () => {
      if (!s.done) save();
    },
  };
});
