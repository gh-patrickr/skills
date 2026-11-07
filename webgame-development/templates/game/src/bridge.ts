import { autopilotIntent } from './game/autopilot';
import { FIXED_STEP_MS } from './loop';
import type { Game } from './game/game';
import type { GameEvent, Intent, Snapshot } from './game/types';
import type { InputController } from './input';

export const BRIDGE_VERSION = 1;

export interface Bridge {
  readonly version: number;
  readonly ready: true;
  snapshot(): Snapshot;
  step(frames: number): Snapshot;
  start(seed?: number): Snapshot;
  restart(seed?: number): Snapshot;
  /** Deterministic demo bot: steer toward stars, away from nearby hazards. */
  autoplay(frames?: number): Snapshot;
  pause(): void;
  resume(): void;
  endRun(): void;
  setInput(patch: Partial<Intent>): void;
  clearInput(): void;
  events(): GameEvent[];
  errors(): string[];
  fps(): number;
  setReducedMotion(value: boolean): void;
}

export interface BridgeHost {
  game: Game;
  tick(dtMs: number): void;
  render(): void;
  input: InputController;
  fps(): number;
  errors: string[];
  events(): GameEvent[];
  setReducedMotion(value: boolean): void;
}

declare global {
  interface Window {
    __WG__?: Bridge;
  }
}

/**
 * Deterministic control surface for UI tests.
 *
 * It drives the exact same `tick` used by the real loop, so a test never waits
 * on wall-clock time and a seed always produces the same run.
 */
export function installBridge(host: BridgeHost): Bridge {
  const bridge: Bridge = {
    version: BRIDGE_VERSION,
    ready: true,
    snapshot: () => host.game.snapshot(),
    step(frames: number): Snapshot {
      const count = Math.max(0, Math.min(Math.floor(frames), 10_000));
      for (let index = 0; index < count; index++) host.tick(FIXED_STEP_MS);
      host.render();
      return host.game.snapshot();
    },
    start(seed?: number): Snapshot {
      host.game.start(seed);
      host.render();
      return host.game.snapshot();
    },
    restart(seed?: number): Snapshot {
      host.game.start(seed);
      host.render();
      return host.game.snapshot();
    },
    autoplay(frames = 600): Snapshot {
      const limit = Math.max(0, Math.min(Math.floor(frames), 20_000));
      for (let index = 0; index < limit; index++) {
        const snapshot = host.game.snapshot();
        if (snapshot.phase !== 'playing') break;
        host.input.setVirtual(autopilotIntent(snapshot));
        host.tick(FIXED_STEP_MS);
      }
      host.input.clearVirtual();
      host.render();
      return host.game.snapshot();
    },
    pause: () => host.game.pause(),
    resume: () => host.game.resume(),
    endRun: () => {
      host.game.end();
      host.tick(0);
      host.render();
    },
    setInput(patch: Partial<Intent>): void {
      host.input.setVirtual(patch);
    },
    clearInput: () => host.input.clearVirtual(),
    events: () => host.events().slice(),
    errors: () => host.errors.slice(),
    fps: () => host.fps(),
    setReducedMotion: (value: boolean) => host.setReducedMotion(value),
  };

  window.__WG__ = bridge;
  return bridge;
}
