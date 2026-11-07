/** Shared types for the deterministic game core (no DOM, no timers). */

export type Phase = 'menu' | 'playing' | 'paused' | 'gameover';

export type OrbKind = 'star' | 'hazard';

/** Abstract player intent, produced by adapters (keyboard, gamepad, test bridge). */
export interface Intent {
  left: boolean;
  right: boolean;
  up: boolean;
  down: boolean;
}

export interface Player {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  invulnMs: number;
}

export interface Orb {
  id: number;
  kind: OrbKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  spin: number;
}

export type GameEventType =
  | 'run-start'
  | 'star'
  | 'hit'
  | 'level-up'
  | 'game-over'
  | 'pause'
  | 'resume';

export interface GameEvent {
  type: GameEventType;
  tick: number;
  value: number | null;
  /** World position for VFX (null for run-level events). */
  x: number | null;
  y: number | null;
}

export interface GameState {
  phase: Phase;
  seed: number;
  tick: number;
  timeMs: number;
  score: number;
  best: number;
  lives: number;
  combo: number;
  comboMs: number;
  level: number;
  difficulty: number;
  player: Player;
  orbs: Orb[];
  spawnTimerMs: number;
  nextOrbId: number;
  rngState: number;
  events: GameEvent[];
}

/** A frozen, JSON-safe view of the world used by renderers, tests and the UI. */
export interface Snapshot {
  phase: Phase;
  seed: number;
  tick: number;
  timeMs: number;
  score: number;
  best: number;
  lives: number;
  combo: number;
  level: number;
  difficulty: number;
  player: { x: number; y: number; vx: number; vy: number; r: number; invuln: boolean };
  orbs: ReadonlyArray<{ id: number; kind: OrbKind; x: number; y: number; r: number; spin: number }>;
  hash: string;
}
