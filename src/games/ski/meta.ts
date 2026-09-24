import { defineMeta } from '../../core/types';

export default defineMeta({
  id: 'ski',
  title: 'Downhill',
  description: 'Carve through gates and dodge the trees.',
  category: 'arcade',
  order: 40,
  icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="14" cy="4.5" r="1.8" fill="currentColor" stroke="none"/><path d="M8 9l5-1.5 1.5 4-3.5 3 1.5 4"/><path d="M13 7.5l3 3.5 3-1"/><path d="M4 17l15 5"/><path d="M5 5l3 4" opacity=".5"/></svg>',
  controls: {
    touch: [
      'Press and drag left or right: the skier steers toward your finger',
      'Let go to point straight downhill and speed up',
      'Double-tap to jump over rocks',
      'Pass between each pair of flags for bonus points',
    ],
    keyboard: ['Left / Right (A / D) to turn', 'Down (S) to point straight downhill', 'Space to jump', 'P or Esc to pause'],
  },
  bestLabel: (s) => {
    const b = s.get<number | null>('best:score', null);
    return b ? `Best ${b.toLocaleString()}` : null;
  },
});
