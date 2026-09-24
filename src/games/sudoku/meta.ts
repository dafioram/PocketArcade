import { defineMeta } from '../../core/types';
import { formatTime } from '../../lib/util';

export default defineMeta({
  id: 'sudoku',
  title: 'Sudoku',
  description: 'Fill the grid so every row, column and box has 1 to 9.',
  category: 'puzzle',
  order: 20,
  icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="3"/><path d="M9 3v18M15 3v18M3 9h18M3 15h18" stroke-width="1.2"/><path d="M5.2 6.8l1-1v2.5" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  restartButton: false,
  controls: {
    touch: [
      'Tap a square, then tap a number to fill it',
      'Long-press a number to pencil it in as a note',
      'Or turn on Notes so every tap adds a note',
      'Tap a filled number on the grid to highlight all of that number',
    ],
    keyboard: [
      'Click or use arrow keys to pick a square',
      '1 to 9 to fill, Shift + number for a note',
      'Backspace to erase, N toggles notes, U to undo, H for a hint',
    ],
  },
  bestLabel: (s) => {
    const b = s.get<number | null>('best:easy', null);
    return b != null ? `Best easy ${formatTime(b)}` : null;
  },
});
