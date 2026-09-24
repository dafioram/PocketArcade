import { defineMeta } from '../../core/types';

export default defineMeta({
  id: '2048',
  title: '2048',
  description: 'Slide and merge tiles to reach 2048.',
  category: 'puzzle',
  order: 10,
  icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><rect x="3" y="3" width="8" height="8" rx="2"/><rect x="13" y="3" width="8" height="8" rx="2" fill="currentColor"/><rect x="3" y="13" width="8" height="8" rx="2" fill="currentColor" opacity=".45"/><rect x="13" y="13" width="8" height="8" rx="2"/></svg>',
  restartButton: false,
  controls: {
    touch: ['Swipe up, down, left or right to slide all tiles', 'Tap Undo to take back one move'],
    keyboard: ['Arrow keys or WASD to slide', 'U to undo', 'N for a new game'],
  },
  bestLabel: (s) => {
    const best = s.get<number | null>('best:score', null);
    return best ? `Best ${best.toLocaleString()}` : null;
  },
});
