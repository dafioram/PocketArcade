import { defineMeta } from '../../core/types';
import { formatTime } from '../../lib/util';

export default defineMeta({
  id: 'mines',
  title: 'Mines',
  description: 'Clear the field without setting off a mine.',
  category: 'puzzle',
  order: 30,
  icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="13" r="6" fill="currentColor"/><path d="M12 3v2.5M12 20.5V23M3 13h2.5M18.5 13H21M5.6 6.6l1.8 1.8M16.6 17.6l1.8 1.8M5.6 19.4l1.8-1.8M16.6 8.4l1.8-1.8"/></svg>',
  controls: {
    touch: [
      'Tap a square to dig',
      'Long-press a square to plant or remove a flag',
      'Switch the Dig / Flag toggle to swap what tap and long-press do',
      'Tap a number whose mines are all flagged to clear around it',
      'Drag to scroll on the big board',
    ],
    keyboard: [
      'Click to dig, right-click to flag',
      'Click a number to clear around it when its flags are placed',
      'Or use arrow keys to move, Space to dig, F to flag',
    ],
  },
  bestLabel: (s) => {
    const b = s.get<number | null>('best:easy', null);
    return b != null ? `Best easy ${formatTime(b)}` : null;
  },
});
