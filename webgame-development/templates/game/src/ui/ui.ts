import type { Snapshot } from '../game/types';

export interface UiHandlers {
  onStart(): void;
  onResume(): void;
  onRestart(): void;
  onQuit(): void;
  onPause(): void;
  onToggleMute(): void;
}

export interface Ui {
  sync(snapshot: Snapshot, muted: boolean): void;
  announce(message: string): void;
  screen(): HTMLButtonElement;
}

function el<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (node === null) throw new Error(`UI element #${id} is missing from index.html`);
  return node as T;
}

function setText(node: HTMLElement, text: string): void {
  if (node.textContent !== text) node.textContent = text;
}

/**
 * DOM HUD and screens. Keeping menus in real DOM (not canvas) is what makes
 * the game keyboard-accessible and assertable by roles in Playwright.
 */
export function createUi(handlers: UiHandlers): Ui {
  const menu = el('screen-menu');
  const pause = el('screen-pause');
  const over = el('screen-over');
  const score = el('hud-score');
  const best = el('hud-best');
  const lives = el('hud-lives');
  const combo = el('hud-combo');
  const pauseButton = el<HTMLButtonElement>('btn-pause');
  const muteButton = el<HTMLButtonElement>('btn-mute');
  const live = el('live');
  const overScore = el('over-score');
  const overBest = el('over-best');

  el<HTMLButtonElement>('btn-start').addEventListener('click', handlers.onStart);
  el<HTMLButtonElement>('btn-resume').addEventListener('click', handlers.onResume);
  el<HTMLButtonElement>('btn-restart').addEventListener('click', handlers.onRestart);
  el<HTMLButtonElement>('btn-quit').addEventListener('click', handlers.onQuit);
  pauseButton.addEventListener('click', handlers.onPause);
  muteButton.addEventListener('click', handlers.onToggleMute);

  let announced = 0;

  return {
    sync(snapshot: Snapshot, muted: boolean): void {
      menu.hidden = snapshot.phase !== 'menu';
      pause.hidden = snapshot.phase !== 'paused';
      over.hidden = snapshot.phase !== 'gameover';

      setText(score, String(snapshot.score));
      setText(best, String(snapshot.best));
      setText(lives, String(Math.max(0, snapshot.lives)));
      setText(combo, `×${snapshot.combo}`);

      pauseButton.disabled = snapshot.phase !== 'playing';
      pauseButton.setAttribute('aria-label', snapshot.phase === 'paused' ? 'Resume game' : 'Pause game');

      if (snapshot.phase === 'gameover') {
        setText(overScore, String(snapshot.score));
        setText(overBest, String(snapshot.best));
      }

      const pressed = muted ? 'true' : 'false';
      if (muteButton.getAttribute('aria-pressed') !== pressed) {
        muteButton.setAttribute('aria-pressed', pressed);
        muteButton.setAttribute('aria-label', muted ? 'Unmute sound' : 'Mute sound');
      }
    },

    announce(message: string): void {
      const now = Date.now();
      if (now - announced < 250) return;
      announced = now;
      live.textContent = message;
    },

    screen(): HTMLButtonElement {
      return menu.hidden ? (pause.hidden ? el<HTMLButtonElement>('btn-restart') : el<HTMLButtonElement>('btn-resume')) : el<HTMLButtonElement>('btn-start');
    },
  };
}
