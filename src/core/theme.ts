import { appStorage } from './storage';

export type ThemeMode = 'auto' | 'light' | 'dark';

/** Colors pulled from CSS custom properties so canvas games match the page theme. */
export interface Palette {
  bg: string;
  surface: string;
  surface2: string;
  text: string;
  muted: string;
  border: string;
  accent: string;
  red: string;
  orange: string;
  yellow: string;
  green: string;
  teal: string;
  blue: string;
  purple: string;
  pink: string;
  dark: boolean;
}

let cached: Palette | null = null;
const listeners = new Set<() => void>();
const media = window.matchMedia('(prefers-color-scheme: dark)');

function read(): Palette {
  const s = getComputedStyle(document.documentElement);
  const v = (name: string) => s.getPropertyValue(name).trim();
  return {
    bg: v('--bg'),
    surface: v('--surface'),
    surface2: v('--surface-2'),
    text: v('--text'),
    muted: v('--muted'),
    border: v('--border'),
    accent: v('--accent'),
    red: v('--c-red'),
    orange: v('--c-orange'),
    yellow: v('--c-yellow'),
    green: v('--c-green'),
    teal: v('--c-teal'),
    blue: v('--c-blue'),
    purple: v('--c-purple'),
    pink: v('--c-pink'),
    dark: isDark(),
  };
}

export function palette(): Palette {
  if (!cached) cached = read();
  return cached;
}

export function isDark(): boolean {
  const mode = getThemeMode();
  return mode === 'dark' || (mode === 'auto' && media.matches);
}

function changed() {
  cached = null;
  const meta = document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]');
  const bg = palette().bg;
  meta.forEach((m) => (m.content = bg));
  listeners.forEach((fn) => fn());
}

media.addEventListener('change', changed);

export function onThemeChange(fn: () => void, signal?: AbortSignal): void {
  listeners.add(fn);
  signal?.addEventListener('abort', () => listeners.delete(fn));
}

export function getThemeMode(): ThemeMode {
  const t = appStorage.get('theme');
  return t === 'light' || t === 'dark' ? t : 'auto';
}

export function setThemeMode(mode: ThemeMode): void {
  appStorage.set('theme', mode);
  if (mode === 'auto') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = mode;
  changed();
}

export function cycleThemeMode(): ThemeMode {
  const order: ThemeMode[] = ['auto', 'light', 'dark'];
  const next = order[(order.indexOf(getThemeMode()) + 1) % order.length];
  setThemeMode(next);
  return next;
}
