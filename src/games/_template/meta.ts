// Copy this folder to src/games/<your-id>/ (no leading underscore) to add a game.
// Folders starting with "_" are ignored by the menu.
import { defineMeta } from '../../core/types';

export default defineMeta({
  id: '_template', // must match the folder name
  title: 'Template',
  description: 'Tap the dot before it moves.',
  category: 'arcade', // or 'puzzle'
  order: 100,
  icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3" fill="currentColor"/></svg>',
  controls: {
    touch: ['Tap the dot'],
    keyboard: ['Click the dot'],
  },
  bestLabel: (s) => {
    const best = s.get<number | null>('best:score', null);
    return best ? `Best ${best}` : null;
  },
});
