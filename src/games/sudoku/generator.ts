/** Sudoku generator: random full grid, then dig holes while the solution stays unique. */

const ALL = 0x3fe; // bits 1..9
const box = (r: number, c: number) => Math.floor(r / 3) * 3 + Math.floor(c / 3);

function popcount(n: number) {
  let c = 0;
  while (n) {
    n &= n - 1;
    c++;
  }
  return c;
}

/** Counts solutions up to `limit`. Fills `out` with the first solution found. */
export function solve(grid: number[], limit = 2, out?: number[]): number {
  const g = grid.slice();
  const rows = new Array(9).fill(0);
  const cols = new Array(9).fill(0);
  const boxes = new Array(9).fill(0);
  for (let i = 0; i < 81; i++) {
    const v = g[i];
    if (!v) continue;
    const r = Math.floor(i / 9);
    const c = i % 9;
    const bit = 1 << v;
    if (rows[r] & bit || cols[c] & bit || boxes[box(r, c)] & bit) return 0;
    rows[r] |= bit;
    cols[c] |= bit;
    boxes[box(r, c)] |= bit;
  }
  let count = 0;
  const rec = (): boolean => {
    // Pick the empty cell with the fewest candidates.
    let best = -1;
    let bestMask = 0;
    let bestCount = 10;
    for (let i = 0; i < 81; i++) {
      if (g[i]) continue;
      const r = Math.floor(i / 9);
      const c = i % 9;
      const mask = ALL & ~(rows[r] | cols[c] | boxes[box(r, c)]);
      const n = popcount(mask);
      if (n < bestCount) {
        best = i;
        bestMask = mask;
        bestCount = n;
        if (n <= 1) break;
      }
    }
    if (best < 0) {
      count++;
      if (out && count === 1) out.splice(0, 81, ...g);
      return count >= limit;
    }
    if (!bestMask) return false;
    const r = Math.floor(best / 9);
    const c = best % 9;
    const b = box(r, c);
    for (let v = 1; v <= 9; v++) {
      const bit = 1 << v;
      if (!(bestMask & bit)) continue;
      g[best] = v;
      rows[r] |= bit;
      cols[c] |= bit;
      boxes[b] |= bit;
      if (rec()) return true;
      rows[r] &= ~bit;
      cols[c] &= ~bit;
      boxes[b] &= ~bit;
    }
    g[best] = 0;
    return false;
  };
  rec();
  return count;
}

function shuffled(n: number) {
  const a = Array.from({ length: n }, (_, i) => i);
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function fullGrid(): number[] {
  const g = new Array(81).fill(0);
  // Fill the three diagonal boxes randomly (they don't constrain each other), then solve.
  for (let b = 0; b < 3; b++) {
    const digits = shuffled(9).map((d) => d + 1);
    for (let k = 0; k < 9; k++) {
      const r = b * 3 + Math.floor(k / 3);
      const c = b * 3 + (k % 3);
      g[r * 9 + c] = digits[k];
    }
  }
  const out: number[] = [];
  solve(g, 1, out);
  return out;
}

export type Difficulty = 'easy' | 'medium' | 'hard';
const TARGET_CLUES: Record<Difficulty, number> = { easy: 38, medium: 30, hard: 25 };

export function generate(difficulty: Difficulty): { puzzle: number[]; solution: number[] } {
  const solution = fullGrid();
  const puzzle = solution.slice();
  let clues = 81;
  const target = TARGET_CLUES[difficulty];
  // Remove symmetric pairs for a classic look.
  for (const i of shuffled(81)) {
    if (clues <= target) break;
    const j = 80 - i;
    if (!puzzle[i]) continue;
    const a = puzzle[i];
    const b = puzzle[j];
    puzzle[i] = 0;
    puzzle[j] = 0;
    if (solve(puzzle, 2) === 1) {
      clues -= i === j ? 1 : 2;
    } else {
      puzzle[i] = a;
      puzzle[j] = b;
    }
  }
  return { puzzle, solution };
}
