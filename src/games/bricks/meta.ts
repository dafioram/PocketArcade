import { defineMeta } from '../../core/types';

export default defineMeta({
  id: 'bricks',
  title: 'Bricks',
  description: 'Bounce the ball and break every brick.',
  category: 'arcade',
  order: 20,
  icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="4" width="5" height="3" rx="1" fill="currentColor"/><rect x="9.5" y="4" width="5" height="3" rx="1" fill="currentColor"/><rect x="16" y="4" width="5" height="3" rx="1" fill="currentColor"/><rect x="6" y="9" width="5" height="3" rx="1" fill="currentColor" opacity=".5"/><rect x="13" y="9" width="5" height="3" rx="1" fill="currentColor" opacity=".5"/><circle cx="13" cy="16" r="1.6" fill="currentColor"/><path d="M8 20.5h8"/></svg>',
  controls: {
    touch: [
      'Drag anywhere to slide the paddle (your finger doesn’t need to be on it)',
      'Tap to launch the ball',
      'Catch falling capsules for power-ups',
    ],
    keyboard: ['Mouse, or Left / Right (A / D) to move', 'Click or Space to launch', 'P or Esc to pause'],
  },
  bestLabel: (s) => {
    const b = s.get<number | null>('best:score', null);
    return b ? `Best ${b.toLocaleString()}` : null;
  },
});
