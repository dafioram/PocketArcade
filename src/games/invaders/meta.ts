import { defineMeta } from '../../core/types';

export default defineMeta({
  id: 'invaders',
  title: 'Invaders',
  description: 'Hold the line against waves of descending aliens.',
  category: 'arcade',
  order: 30,
  icon: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 4h2v2H7zM15 4h2v2h-2zM6 6h12v2h2v6h-2v-2h-2v4h-3v-2h-2v2H8v-4H6v2H4V8h2zm3 3v2h2V9zm4 0v2h2V9z"/><path d="M11 18h2v3h-2z" opacity=".6"/></svg>',
  controls: {
    touch: [
      'Press and drag anywhere to slide your ship left and right',
      'Your ship fires automatically while your finger is down',
      'Tap to fire a single shot',
    ],
    keyboard: ['Left / Right (A / D) to move', 'Space to fire (hold to keep firing)', 'P or Esc to pause'],
  },
  bestLabel: (s) => {
    const b = s.get<number | null>('best:score', null);
    return b ? `Best ${b.toLocaleString()}` : null;
  },
});
