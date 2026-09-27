# Pocket Arcade

A small collection of classic games in one static web app. Every game plays with a keyboard on desktop and with touch gestures on a phone.

| Game | Type | Phone controls |
| --- | --- | --- |
| Snake | Arcade | Swipe to turn. Keep your finger down and swipe again to turn twice. |
| Blockfall | Arcade | Tap in line with the piece to rotate, left or right of it to move one space. Press and hold the piece and slide to steer it. Swipe down to drop, swipe up to rotate the other way. |
| Bricks | Arcade | Drag anywhere to slide the paddle, tap to launch. |
| Invaders | Arcade | Press and drag to move. Holding your finger down keeps firing. |
| Downhill | Arcade | Drag and the skier steers toward your finger. Let go to point downhill. Double-tap to jump. |
| Meteors | Arcade | Simplified touch mode: the ship stays in the middle. Hold to aim and fire. Double-tap for a shield burst. |
| 2048 | Puzzle | Swipe. Undo button. |
| Sudoku | Puzzle | Tap a square, then a number. Long-press a number to add it as a note. |
| Mines | Puzzle | Tap to dig, long-press to flag. One Digging / Flagging button switches what a tap does. |

Built with Vite and TypeScript. There are no runtime dependencies.

## Run it locally

```bash
npm install
npm run dev        # http://localhost:5173
```

To try it on your phone, run `npm run dev -- --host` and open the "Network" URL it prints. Your phone needs to be on the same Wi-Fi.

## Deploy to GitHub Pages

1. Create a GitHub repository and push this project to its `main` branch.
2. In the repo, go to **Settings → Pages** and set **Source** to **GitHub Actions**.
3. Every push to `main` then builds and deploys the site through `.github/workflows/deploy.yml`. The site appears at `https://<you>.github.io/<repo>/`.

The build uses relative paths and hash routing (`#/play/snake`). It works from any sub-path, so you don't need to configure a base URL.

To host it somewhere else, run `npm run build` and upload the `dist/` folder to any static host.

## Add a new game

Each game is a folder in `src/games/`. The menu discovers games automatically, so you don't register them anywhere.

1. Copy `src/games/_template/` to `src/games/<your-id>/`. Folders that start with `_` are ignored, so the template itself never appears in the menu.
2. Edit `meta.ts`: set `id` to match the folder name, then fill in the title, description, category (`arcade` or `puzzle`), icon, and the controls text shown in the help sheet.
3. Write the game in `index.ts`. It exports `defineGame((ctx) => { ... })`.

`meta.ts` loads with the menu. `index.ts` is split into its own chunk and only downloads when someone opens the game.

### What a game receives (`ctx`)

| Field | Purpose |
| --- | --- |
| `root` | The element to render into. It fills the screen below the header. |
| `signal` | An `AbortSignal` that fires when the player leaves. Pass it to listeners and helpers so they clean up on their own. |
| `setStats([...])` | Sets the chips in the header, for example `[{ label: 'Score', value: 120 }]`. |
| `storage` | Saved data for this game only (localStorage, namespaced). |
| `recordBest(key, value, 'high' \| 'low')` | Saves a best score or time and returns `{ best, isNew }`. |
| `isTouch` | True on touch-first devices. Use it to change controls or hint text. |
| `haptic(ms)` | A short vibration where the device supports it. |

A game can return `{ pause, resume, isPaused, destroy }`. If it has `pause`, the header shows a pause button, and the game pauses on its own when the tab is hidden or the help sheet opens.

### Shared helpers (`src/lib/`)

- **`gestures(el, handlers, opts)`**: one recognizer for mouse, pen and touch. It reports `press`, `move` (drag deltas), `release`, `tap`, `doubleTap`, `longPress` and `swipe`. `tap` fires right away, and `doubleTap` fires in addition on the second tap, so single taps never wait. Set `swipeWhileMoving: true` to get repeated swipes during one drag, the way Snake uses it.
- **`createStage(root, size, signal)`**: a sharp canvas that handles high-DPI screens and resizing. Pass a fixed `{ width, height }` to letterbox the play area, or `{ minWidth, minHeight }` to fill the screen and still guarantee a minimum visible area. `stage.toLocal` converts pointer coordinates into game units.
- **`loop(update, render, signal)`**: a `requestAnimationFrame` loop that passes `dt` in seconds, capped so a slow frame doesn't make objects jump.
- **`createOverlay(root, signal)`**: the centered start, paused and game-over card. Enter and Space trigger its main button.
- **`keyboard(signal, onKey)`**: tracks which keys are held (`kb.down('ArrowLeft', 'a')`).
- **`palette()` / `onThemeChange()`** (in `src/core/theme.ts`): the theme colors for drawing on a canvas, so games follow light and dark mode.

### Tips for phone controls

- Put `touch-action: none` on anything you drag. `.stage` already has it.
- Prefer relative drags, where the object moves by the finger's movement, over "follow the finger". That keeps the player's thumb from covering what they control. Bricks and Invaders work this way.
- Always offer a tap alternative to long-press and double-tap. Mines has its Digging / Flagging button, and Sudoku has its Notes button.

## Project layout

```
src/
  main.ts            router (#/ and #/play/<id>)
  styles.css         theme tokens and shared UI
  app/               menu, game player shell, icons
  core/              types, auto-registry, storage, theme
  lib/               gestures, stage, loop, overlay, keyboard, drawing helpers
  games/<id>/        meta.ts + index.ts (+ optional style.css) per game
```
