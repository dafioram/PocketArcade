import { defineMeta } from '../../core/types';

export default defineMeta({
  id: 'kitty',
  title: 'Kitty Chomp',
  description: 'Eat every treat, grab catnip, and make the dogs run.',
  category: 'arcade',
  order: 25,
  icon: '<svg viewBox="0 0 24 24" fill="currentColor"><path fill-rule="evenodd" d="M5 8.2L5.6 2.8 9.6 5.6A8.3 8.3 0 0 1 14.4 5.6L18.4 2.8 19 8.2A8.3 8.3 0 0 1 20.2 11L13 14.2 20.2 17.4A8.3 8.3 0 1 1 5 8.2ZM9.2 10.6a1.4 1.4 0 1 0 0 .01Z"/><circle cx="22" cy="14.2" r="1.2" opacity=".5"/></svg>',
  controls: {
    touch: [
      'Press and hold on the side of the cat you want her to go (left, right, above or below); she takes that turn as soon as it opens',
      'Hold off at an angle and she uses the second direction to round corners; slide your finger to re-aim',
      'Quick flicks work as swipes, and the on-screen d-pad works too (hide it with the d-pad button under the maze)',
      'Treats 10 · Catnip 50 and scares the dogs · Scared dogs 200, 400, 800, 1600 · Goodies 100 to 5000',
      'Extra life at 10,000 points',
    ],
    keyboard: [
      'Arrow keys or WASD to move',
      'Click and hold the mouse on the maze to steer the same way as touch',
      'P or Esc to pause · M to turn sound on or off',
    ],
  },
  bestLabel: (s) => {
    const b = s.get<number | null>('best:score', null);
    return b ? `Best ${b.toLocaleString()}` : null;
  },
});
