import './style.css';
import { createSfx } from './audio';
import { installBridge } from './bridge';
import { createGame } from './game/game';
import type { GameEvent } from './game/types';
import { createInput } from './input';
import { createLoop } from './loop';
import { createSaveStore, safeLocalStorage } from './persist/save';
import { createRenderer } from './render/renderer';
import { createUi } from './ui/ui';

const canvas = document.getElementById('game');
if (!(canvas instanceof HTMLCanvasElement)) throw new Error('#game canvas is missing');

const params = new URLSearchParams(window.location.search);
const requestedSeed = Number(params.get('seed'));
const initialSeed =
  Number.isFinite(requestedSeed) && requestedSeed > 0 ? Math.floor(requestedSeed) : Math.floor(Math.random() * 0xffffffff) || 1;

const manual = __WG_E2E__ && !params.has('live');
const reducedMotion =
  window.matchMedia('(prefers-reduced-motion: reduce)').matches || params.get('reduced') === '1';

const store = createSaveStore(safeLocalStorage());
let save = store.load();

const renderer = createRenderer(canvas);
renderer.setReducedMotion(reducedMotion);
renderer.resize();

const game = createGame({ seed: initialSeed, best: save.best });
const input = createInput();
const sfx = createSfx(save.muted || params.get('mute') === '1' || __WG_E2E__);
const errors: string[] = [];
const eventLog: GameEvent[] = [];

let seedCounter = initialSeed;
const nextSeed = (): number => {
  seedCounter = (Math.imul(seedCounter, 1664525) + 1013904223) >>> 0;
  if (seedCounter === 0) seedCounter = 1;
  return seedCounter;
};

const ui = createUi({
  onStart: () => startRun(nextSeed()),
  onResume: () => {
    game.resume();
    ui.sync(game.snapshot(), sfx.isMuted());
    render();
  },
  onRestart: () => startRun(nextSeed()),
  onQuit: () => {
    game.end();
    persistBest();
    ui.sync(game.snapshot(), sfx.isMuted());
    render();
  },
  onPause: togglePause,
  onToggleMute: toggleMute,
});

function persistBest(): void {
  if (game.state.best !== save.best || game.state.seed !== save.lastSeed) {
    save = { ...save, best: game.state.best, muted: sfx.isMuted(), lastSeed: game.state.seed };
    store.save(save);
  }
}

function togglePause(): void {
  if (game.state.phase === 'playing') {
    game.pause();
    ui.announce('Paused');
  } else if (game.state.phase === 'paused') {
    game.resume();
    ui.announce('Resumed');
  }
  ui.sync(game.snapshot(), sfx.isMuted());
  render();
}

function toggleMute(): void {
  sfx.setMuted(!sfx.isMuted());
  save = { ...save, muted: sfx.isMuted() };
  store.save(save);
  ui.sync(game.snapshot(), sfx.isMuted());
}

function startRun(seed: number): void {
  if (game.state.phase === 'gameover' || game.state.phase === 'paused') persistBest();
  sfx.unlock();
  sfx.play('start');
  game.start(seed);
  persistBest();
  renderer.setReducedMotion(reducedMotion);
  ui.sync(game.snapshot(), sfx.isMuted());
  render();
  if (!manual) loop.start();
}

function render(): void {
  renderer.draw(game.snapshot());
}

function tick(dtMs: number): void {
  game.update(input.intent(), dtMs);
  const events = game.drainEvents();
  if (events.length > 0) {
    renderer.handle(events);
    for (const event of events) {
      eventLog.push(event);
      switch (event.type) {
        case 'star':
          sfx.play('star');
          break;
        case 'hit':
          sfx.play('hit');
          ui.announce(`Hull hit. ${Math.max(0, game.state.lives)} hull left.`);
          break;
        case 'level-up':
          ui.announce(`Level ${event.value ?? ''}. The field speeds up.`);
          break;
        case 'game-over':
          sfx.play('over');
          ui.announce(`Run over. Score ${game.state.score}.`);
          persistBest();
          break;
        default:
          break;
      }
    }
    if (eventLog.length > 1_000) eventLog.splice(0, eventLog.length - 1_000);
  }
  renderer.update(dtMs);
  persistBest();
  ui.sync(game.snapshot(), sfx.isMuted());
}

const loop = createLoop({ step: tick, render });

input.attach(window);
input.onAction((action) => {
  if (action === 'pause') togglePause();
  else toggleMute();
});

// Pointer / touch steering: hold and drag toward where you want the ship.
let dragging = false;
canvas.addEventListener('pointerdown', (event) => {
  dragging = true;
  canvas.setPointerCapture(event.pointerId);
});
canvas.addEventListener('pointermove', (event) => {
  if (!dragging) return;
  const rect = canvas.getBoundingClientRect();
  const x = ((event.clientX - rect.left) / rect.width) * game.config.world.width;
  const y = ((event.clientY - rect.top) / rect.height) * game.config.world.height;
  const { player } = game.state;
  const deadZone = 26;
  input.setVirtual({
    left: x < player.x - deadZone,
    right: x > player.x + deadZone,
    up: y < player.y - deadZone,
    down: y > player.y + deadZone,
  });
});
const endDrag = (): void => {
  dragging = false;
  input.clearVirtual();
};
canvas.addEventListener('pointerup', endDrag);
canvas.addEventListener('pointercancel', endDrag);

window.addEventListener('resize', () => {
  renderer.resize();
  render();
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden && game.state.phase === 'playing') togglePause();
});

window.addEventListener('error', (event) => {
  errors.push(String(event.error ?? event.message));
});
window.addEventListener('unhandledrejection', (event) => {
  errors.push(String(event.reason));
});

if (__WG_E2E__ || params.has('bridge')) {
  installBridge({
    game,
    tick,
    render,
    input,
    fps: () => loop.fps(),
    errors,
    events: () => eventLog,
    setReducedMotion: (value: boolean) => renderer.setReducedMotion(value),
  });
}

ui.sync(game.snapshot(), sfx.isMuted());
render();
if (!manual) {
  loop.start();
} else {
  // Manual mode: tests drive `step()`; expose a ready marker for boot checks.
  document.documentElement.dataset.wgReady = 'manual';
}

