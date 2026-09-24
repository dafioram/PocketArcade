import { findGame, loadGame } from '../core/registry';
import { createStorage } from '../core/storage';
import type { GameContext, GameInstance, GameMeta, Stat } from '../core/types';
import { h } from '../lib/util';
import { icons } from './icons';

function iconButton(icon: string, label: string, onClick: () => void) {
  const b = h('button', { class: 'icon-btn', title: label, onclick: onClick });
  b.setAttribute('aria-label', label);
  b.innerHTML = icon;
  return b;
}

function helpDialog(meta: GameMeta, isTouch: boolean): HTMLDialogElement {
  const section = (title: string, icon: string, items: string[]) => {
    const head = h('h3');
    head.innerHTML = icon;
    head.append(title);
    return h('section', {}, head, h('ul', {}, ...items.map((t) => h('li', { textContent: t }))));
  };
  const touch = section('Touch', icons.touch, meta.controls.touch);
  const keys = section('Keyboard', icons.keyboard, meta.controls.keyboard);
  const dlg = h(
    'dialog',
    { class: 'help' },
    h('h2', { textContent: `How to play ${meta.title}` }),
    ...(isTouch ? [touch, keys] : [keys, touch]),
    h(
      'form',
      { method: 'dialog' },
      h('button', { class: 'btn btn-primary', textContent: 'Got it' }),
    ),
  );
  // Tap outside the sheet to close.
  dlg.addEventListener('click', (e) => {
    if (e.target === dlg) dlg.close();
  });
  return dlg;
}

export function renderPlayer(
  app: HTMLElement,
  id: string,
  isTouch: boolean,
  goBack: () => void,
): () => void {
  const meta = findGame(id);
  if (!meta) {
    app.replaceChildren(
      h(
        'div',
        { class: 'menu' },
        h('p', { class: 'empty', textContent: `No game called "${id}".` }),
        h('a', { class: 'btn', href: '#/', textContent: 'Back to games' }),
      ),
    );
    return () => {};
  }

  const storage = createStorage(meta.id);
  const statsEl = h('div', { class: 'stats' });
  const root = h('main', { class: 'game-root' });
  let instance: GameInstance | null = null;
  let controller: AbortController | null = null;
  let disposed = false;

  const pauseBtn = iconButton(icons.pause, 'Pause', () => {
    if (!instance?.pause) return;
    if (instance.isPaused?.()) instance.resume?.();
    else instance.pause();
    syncPause();
  });
  pauseBtn.hidden = true;

  const syncPause = () => {
    const paused = !!instance?.isPaused?.();
    pauseBtn.innerHTML = paused ? icons.play : icons.pause;
    pauseBtn.title = paused ? 'Resume' : 'Pause';
    pauseBtn.setAttribute('aria-label', pauseBtn.title);
  };

  const help = helpDialog(meta, isTouch);
  let pausedForHelp = false;
  const openHelp = () => {
    if (instance?.pause && !instance.isPaused?.()) {
      instance.pause();
      pausedForHelp = true;
      syncPause();
    }
    help.showModal();
  };
  help.addEventListener('close', () => {
    storage.set('seenHelp', true);
    if (pausedForHelp) {
      pausedForHelp = false;
      instance?.resume?.();
      syncPause();
    }
  });

  const restartBtn = iconButton(icons.restart, 'Restart', () => start());
  restartBtn.hidden = meta.restartButton === false;

  const header = h(
    'header',
    { class: 'player-bar' },
    iconButton(icons.back, 'Back to games', goBack),
    h('h1', { textContent: meta.title }),
    statsEl,
    h('div', { class: 'bar-actions' }, pauseBtn, restartBtn, iconButton(icons.help, 'How to play', openHelp)),
  );

  const setStats = (stats: Stat[]) => {
    statsEl.replaceChildren(
      ...stats.map((s) =>
        h('div', { class: 'stat' }, h('span', { class: 'stat-label', textContent: s.label }), h('span', { class: 'stat-value', textContent: String(s.value) })),
      ),
    );
  };

  async function start() {
    controller?.abort();
    instance?.destroy?.();
    instance = null;
    root.replaceChildren();
    setStats([]);
    controller = new AbortController();
    const signal = controller.signal;

    let factory;
    try {
      factory = await loadGame(meta!.id);
    } catch (err) {
      console.error(err);
      root.append(h('p', { class: 'empty', textContent: 'This game failed to load.' }));
      return;
    }
    if (disposed || signal.aborted) return;

    const ctx: GameContext = {
      root,
      signal,
      setStats,
      storage,
      isTouch,
      haptic: (ms = 12) => {
        try {
          // Browsers reject (and log) vibration before the first tap.
          if (navigator.userActivation && !navigator.userActivation.hasBeenActive) return;
          navigator.vibrate?.(ms);
        } catch {
          /* ignore */
        }
      },
      recordBest(key, value, mode = 'high') {
        const prev = storage.get<number | null>(`best:${key}`, null);
        const isNew = prev == null || (mode === 'high' ? value > prev : value < prev);
        if (isNew) storage.set(`best:${key}`, value);
        return { best: isNew ? value : prev!, isNew };
      },
    };
    instance = factory(ctx);
    pauseBtn.hidden = !instance.pause;
    syncPause();
  }

  const onVisibility = () => {
    if (document.hidden && instance?.pause && !instance.isPaused?.()) {
      instance.pause();
      syncPause();
    }
  };
  document.addEventListener('visibilitychange', onVisibility);
  // Games may pause/resume themselves (e.g. overlays); keep the icon honest.
  const syncTimer = window.setInterval(syncPause, 400);

  app.replaceChildren(h('div', { class: 'player' }, header, root, help));
  document.title = `${meta.title} · Pocket Arcade`;
  start().then(() => {
    if (!storage.get('seenHelp', false)) openHelp();
  });

  return () => {
    disposed = true;
    controller?.abort();
    instance?.destroy?.();
    document.removeEventListener('visibilitychange', onVisibility);
    clearInterval(syncTimer);
  };
}
