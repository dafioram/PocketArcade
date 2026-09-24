import { games } from '../core/registry';
import { createStorage } from '../core/storage';
import { cycleThemeMode, getThemeMode, type ThemeMode } from '../core/theme';
import type { Category, GameMeta } from '../core/types';
import { h } from '../lib/util';
import { icons } from './icons';

const CATEGORY_TITLES: Record<Category, string> = {
  arcade: 'Arcade',
  puzzle: 'Puzzle',
};

const themeIcon = (m: ThemeMode) => (m === 'auto' ? icons.auto : m === 'light' ? icons.sun : icons.moon);
const themeLabel = (m: ThemeMode) => `Theme: ${m}`;

export function renderMenu(app: HTMLElement, isTouch: boolean): () => void {
  const themeBtn = h('button', { class: 'icon-btn', title: themeLabel(getThemeMode()) });
  themeBtn.setAttribute('aria-label', themeLabel(getThemeMode()));
  themeBtn.innerHTML = themeIcon(getThemeMode());
  themeBtn.onclick = () => {
    const m = cycleThemeMode();
    themeBtn.innerHTML = themeIcon(m);
    themeBtn.title = themeLabel(m);
    themeBtn.setAttribute('aria-label', themeLabel(m));
  };

  const card = (g: GameMeta) => {
    const best = g.bestLabel?.(createStorage(g.id)) ?? null;
    const iconEl = h('span', { class: 'card-icon' });
    iconEl.innerHTML = g.icon;
    return h(
      'a',
      { class: 'card', href: `#/play/${g.id}` },
      iconEl,
      h(
        'span',
        { class: 'card-text' },
        h('span', { class: 'card-title', textContent: g.title }),
        h('span', { class: 'card-desc', textContent: g.description }),
        best ? h('span', { class: 'card-best', textContent: best }) : null,
        isTouch && g.touchNote ? h('span', { class: 'card-note', textContent: g.touchNote }) : null,
      ),
    );
  };

  const order = Object.keys(CATEGORY_TITLES);
  const categories = [...new Set(games.map((g) => g.category))].sort(
    (a, b) => (order.indexOf(a) + 1 || 99) - (order.indexOf(b) + 1 || 99),
  );

  const page = h(
    'div',
    { class: 'menu' },
    h(
      'header',
      { class: 'menu-header' },
      h('h1', { textContent: 'Pocket Arcade' }),
      themeBtn,
    ),
    ...categories.map((cat) =>
      h(
        'section',
        { class: 'menu-section' },
        h('h2', { textContent: CATEGORY_TITLES[cat] ?? cat }),
        h('div', { class: 'card-grid' }, ...games.filter((g) => g.category === cat).map(card)),
      ),
    ),
    games.length === 0
      ? h('p', { class: 'empty', textContent: 'No games yet. Add one under src/games/.' })
      : null,
  );

  app.replaceChildren(page);
  return () => {};
}
