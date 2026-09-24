import { defineMeta } from '../../core/types';

export default defineMeta({
  id: 'meteors',
  title: 'Meteors',
  description: 'Blast drifting space rocks into dust.',
  category: 'arcade',
  order: 50,
  icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"><path d="M13 3l5 1 3 5-1 5-4 2-5-1-2-4 1-5z"/><path d="M4 21l3-7 3 7-3-1.5z"/><path d="M7 12v-1.5"/></svg>',
  touchNote: 'Simplified touch mode: your ship stays in the middle',
  controls: {
    touch: [
      'Your ship stays in the middle of the screen',
      'Touch and hold anywhere: the ship turns toward your finger and keeps firing',
      'Tap to fire one shot in that direction',
      'Double-tap for a shield burst that pushes rocks away (recharges over time)',
    ],
    keyboard: [
      'Left / Right (A / D) to rotate',
      'Up (W) to thrust',
      'Space to fire',
      'Shift or Down (S) for the shield burst',
      'P or Esc to pause',
    ],
  },
  bestLabel: (s) => {
    const b = s.get<number | null>('best:score', null);
    return b ? `Best ${b.toLocaleString()}` : null;
  },
});
