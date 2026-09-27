import { defineMeta } from '../../core/types';

export default defineMeta({
  id: 'blockfall',
  title: 'Blockfall',
  description: 'Fit the falling pieces together and clear lines.',
  category: 'arcade',
  order: 15,
  icon: '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="3" y="15" width="5.5" height="5.5" rx="1"/><rect x="9.25" y="15" width="5.5" height="5.5" rx="1"/><rect x="15.5" y="15" width="5.5" height="5.5" rx="1" opacity=".45"/><rect x="9.25" y="3" width="5.5" height="5.5" rx="1"/><rect x="9.25" y="8.8" width="5.5" height="5.5" rx="1" opacity=".45"/><rect x="15.5" y="8.8" width="5.5" height="5.5" rx="1"/></svg>',
  controls: {
    touch: [
      'Tap above or below the piece (in line with it) to rotate it clockwise',
      'Tap left of the piece to move it one space left, right of it to move one space right',
      'Press and hold on the piece, then slide your finger to steer it while it keeps falling',
      'Swipe down to drop it straight down',
      'Swipe up to rotate it the other way',
    ],
    keyboard: [
      'Left / Right to move',
      'Up or X to rotate clockwise, Z to rotate the other way',
      'Down to drop faster, Space to drop straight down',
      'P or Esc to pause',
    ],
  },
  bestLabel: (s) => {
    const b = s.get<number | null>('best:score', null);
    return b ? `Best ${b.toLocaleString()}` : null;
  },
});
