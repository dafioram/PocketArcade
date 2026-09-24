// A minimal canvas game showing the pieces most games use:
// stage (sized canvas), loop, gestures, overlay, stats and best score.
import { palette } from '../../core/theme';
import { defineGame } from '../../core/types';
import { gestures } from '../../lib/gestures';
import { loop } from '../../lib/loop';
import { createOverlay } from '../../lib/overlay';
import { createStage } from '../../lib/stage';
import { rand } from '../../lib/util';

export default defineGame((ctx) => {
  const stage = createStage(ctx.root, { width: 360, height: 540 }, ctx.signal);
  const overlay = createOverlay(ctx.root, ctx.signal);

  let score = 0;
  let timeLeft = 20;
  let paused = false;
  let dot = { x: 180, y: 270, r: 26, ttl: 1.2 };

  const moveDot = () => (dot = { x: rand(40, 320), y: rand(40, 500), r: 26, ttl: Math.max(0.5, 1.2 - score * 0.03) });
  const stats = () => ctx.setStats([{ label: 'Score', value: score }, { label: 'Time', value: Math.ceil(timeLeft) }]);

  const newGame = () => {
    overlay.hide();
    score = 0;
    timeLeft = 20;
    moveDot();
    stats();
  };

  const l = loop(
    (dt) => {
      if (overlay.visible) return;
      timeLeft -= dt;
      dot.ttl -= dt;
      if (dot.ttl <= 0) moveDot();
      if (timeLeft <= 0) {
        const { isNew } = ctx.recordBest('score', score);
        overlay.show({
          title: 'Time!',
          body: `Score ${score}${isNew ? '\nNew best!' : ''}`,
          actions: [{ label: 'Play again', primary: true, onClick: newGame }],
        });
      }
      stats();
    },
    () => {
      const c = stage.begin();
      const pal = palette();
      c.fillStyle = pal.surface;
      c.fillRect(0, 0, stage.width, stage.height);
      c.fillStyle = pal.accent;
      c.beginPath();
      c.arc(dot.x, dot.y, dot.r, 0, Math.PI * 2);
      c.fill();
    },
    ctx.signal,
  );

  gestures(
    stage.canvas,
    {
      tap: (p) => {
        if (Math.hypot(p.x - dot.x, p.y - dot.y) <= dot.r + 8) {
          score++;
          ctx.haptic();
          moveDot();
        }
      },
    },
    { signal: ctx.signal, toLocal: stage.toLocal },
  );

  newGame();

  return {
    pause() {
      paused = l.paused = true;
    },
    resume() {
      paused = l.paused = false;
    },
    isPaused: () => paused,
  };
});
