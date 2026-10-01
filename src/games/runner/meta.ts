import { defineMeta } from '../../core/types';

export default defineMeta({
  id: 'runner',
  title: 'Rooftop Runner',
  description: 'Jump the gaps and duck the bars across the rooftops.',
  category: 'arcade',
  order: 45,
  icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="14.5" cy="4" r="1.9" fill="currentColor" stroke="none"/><path d="M9 9.5l3.5-2 2.5 3 3 .5"/><path d="M12.5 7.5L11 13l3 2.5-1 4"/><path d="M11 13l-3 1.5-2-1"/><path d="M2 21h7M14 21h8"/></svg>',
  controls: {
    touch: [
      'Tap, hold, or swipe up to jump',
      'Swipe down to duck; keep your finger down to stay ducked',
      'Swipe down in the air to drop faster',
      'Jump over gaps and crates, duck under the bars',
    ],
    keyboard: ['Space, Up or W to jump', 'Down or S to duck (hold to stay ducked; in the air it drops you faster)', 'P or Esc to pause'],
  },
  bestLabel: (s) => {
    const b = s.get<number | null>('best:distance', null);
    return b ? `Best ${b.toLocaleString()} m` : null;
  },
});
