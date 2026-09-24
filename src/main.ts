import './styles.css';
import { renderMenu } from './app/menu';
import { renderPlayer } from './app/player';

const app = document.getElementById('app')!;
const isTouch = window.matchMedia('(pointer: coarse)').matches;
document.documentElement.classList.toggle('touch', isTouch);

let cleanup: () => void = () => {};
// True once we've shown the menu in this tab, so "back" can use history.
let menuInHistory = false;

function goBack() {
  if (menuInHistory) history.back();
  else location.hash = '#/';
}

function route() {
  cleanup();
  const match = location.hash.match(/^#\/play\/([\w-]+)/);
  if (match) {
    cleanup = renderPlayer(app, match[1], isTouch, goBack);
  } else {
    menuInHistory = true;
    document.title = 'Pocket Arcade';
    cleanup = renderMenu(app, isTouch);
  }
  window.scrollTo(0, 0);
}

window.addEventListener('hashchange', route);
route();
