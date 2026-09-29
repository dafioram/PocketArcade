import { defineMeta } from '../../core/types';

export default defineMeta({
  id: 'tower',
  title: 'Tower',
  description: 'Draw flight paths and land every plane safely.',
  category: 'arcade',
  order: 60,
  icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 20h18" /><path d="M5 20l4-4"/><path d="M14.5 4.5l5 5-2 .5-2.5-1-4 4 .5 3-1.5 1.5-1.5-3.5L5 12.5 6.5 11l3 .5 4-4-1-2.5z" fill="currentColor" stroke="none"/><path d="M4 6s1.5-2 4-2" stroke-dasharray="2 2.5"/></svg>',
  controls: {
    touch: [
      'Touch a plane and drag to draw its route; it follows the line',
      'Finish the route in a green circle at the end of a matching runway',
      'Red jets use the long runway, blue props use either runway, yellow helicopters use the helipad',
      'A red ring means two planes are too close. One collision ends your shift',
    ],
    keyboard: [
      'Click a plane and drag to draw its route',
      'Finish in a green circle at the end of a matching runway',
      'Red jets: long runway · Blue props: either runway · Yellow helicopters: helipad',
      'P or Esc to pause',
    ],
  },
  bestLabel: (s) => {
    const b = s.get<number | null>('best:score', null);
    return b ? `Best ${b} landed` : null;
  },
});
