import { defineMeta } from '../../core/types';

export default defineMeta({
  id: 'snake',
  title: 'Snake',
  description: 'Eat, grow, and don’t bite your own tail.',
  category: 'arcade',
  order: 10,
  icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M4 18h8a3 3 0 0 0 0-6H8a3 3 0 0 1 0-6h9"/><circle cx="20" cy="6" r="1.4" fill="currentColor" stroke="none"/></svg>',
  controls: {
    touch: [
      'Swipe anywhere to turn; you can keep your finger down and swipe again to turn twice',
      'Swipe to start',
    ],
    keyboard: ['Arrow keys or WASD to turn', 'P or Esc to pause'],
  },
  bestLabel: (s) => {
    const b = s.get<number | null>('best:score', null);
    return b ? `Best ${b}` : null;
  },
});
