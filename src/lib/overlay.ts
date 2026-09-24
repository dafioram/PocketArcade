import { h } from './util';

export interface OverlayAction {
  label: string;
  primary?: boolean;
  onClick: () => void;
}

export interface OverlayOptions {
  title: string;
  body?: string;
  actions?: OverlayAction[];
  /** Called when the backdrop is tapped (or Enter/Space pressed with no primary action). */
  onTap?: () => void;
  /** Small hint under the card, e.g. "Tap to start". */
  hint?: string;
}

export interface Overlay {
  show(opts: OverlayOptions): void;
  hide(): void;
  readonly visible: boolean;
}

/**
 * A centered message card over the game (start, paused, game over...).
 * Enter / Space trigger the primary action (or onTap) while it's showing.
 */
export function createOverlay(root: HTMLElement, signal: AbortSignal): Overlay {
  const el = h('div', { class: 'overlay', hidden: true });
  root.appendChild(el);
  let current: OverlayOptions | null = null;
  let shownAt = 0;

  const trigger = () => {
    if (!current) return;
    const primary = current.actions?.find((a) => a.primary);
    if (primary) primary.onClick();
    else current.onTap?.();
  };

  el.addEventListener(
    'click',
    (e) => {
      if (e.target === el || (e.target as HTMLElement).closest('.overlay-card') && !(e.target as HTMLElement).closest('button')) {
        // Ignore a tap that lands right after the overlay appeared (e.g. the
        // finger that just died still on the screen).
        if (performance.now() - shownAt < 350) return;
        current?.onTap?.();
      }
    },
    { signal },
  );

  window.addEventListener(
    'keydown',
    (e) => {
      if (!current) return;
      if (e.code === 'Enter' || e.code === 'Space') {
        e.preventDefault();
        e.stopImmediatePropagation();
        if (performance.now() - shownAt < 250 || e.repeat) return;
        trigger();
      }
    },
    { signal, capture: true },
  );

  return {
    show(opts) {
      current = opts;
      shownAt = performance.now();
      el.replaceChildren(
        h(
          'div',
          { class: 'overlay-card' },
          h('h2', { textContent: opts.title }),
          opts.body ? h('p', { textContent: opts.body }) : null,
          opts.actions?.length
            ? h(
                'div',
                { class: 'overlay-actions' },
                ...opts.actions.map((a) =>
                  h('button', {
                    class: a.primary ? 'btn btn-primary' : 'btn',
                    textContent: a.label,
                    onclick: (ev: MouseEvent) => {
                      ev.stopPropagation();
                      a.onClick();
                    },
                  }),
                ),
              )
            : null,
          opts.hint ? h('div', { class: 'overlay-hint', textContent: opts.hint }) : null,
        ),
      );
      el.hidden = false;
      el.classList.toggle('overlay-tappable', !!opts.onTap);
    },
    hide() {
      current = null;
      el.hidden = true;
    },
    get visible() {
      return current !== null;
    },
  };
}
