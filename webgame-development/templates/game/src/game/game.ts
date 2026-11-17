import {
  defaultConfig,
  difficultyFor,
  levelFor,
  validateConfig,
  type GameConfig,
} from './config';
import { hashState } from './hash';
import { nextFloat, nextInt, normalizeSeed } from './rng';
import type {
  GameEvent,
  GameState,
  Intent,
  OrbKind,
  Snapshot,
} from './types';

export interface GameOptions {
  seed?: number;
  best?: number;
  config?: GameConfig;
}

/**
 * The whole game as a pure state machine: `update(intent, dt)` in, snapshot out.
 * No DOM, no clock, no randomness outside `state.rngState`.
 */
export interface Game {
  readonly state: Readonly<GameState>;
  readonly config: GameConfig;
  start(seed?: number): void;
  pause(): void;
  resume(): void;
  end(): void;
  reset(seed?: number): void;
  update(intent: Intent, dtMs: number): void;
  snapshot(): Snapshot;
  drainEvents(): GameEvent[];
}

const MAX_DT_MS = 50;

function makeState(seed: number, best: number, config: GameConfig): GameState {
  return {
    phase: 'menu',
    seed,
    tick: 0,
    timeMs: 0,
    score: 0,
    best,
    lives: config.lives,
    combo: 1,
    comboMs: 0,
    level: 1,
    difficulty: 1,
    player: {
      x: config.world.width / 2,
      y: config.world.height * 0.72,
      vx: 0,
      vy: 0,
      r: config.player.radius,
      invulnMs: 0,
    },
    orbs: [],
    spawnTimerMs: config.spawn.baseIntervalMs,
    nextOrbId: 1,
    rngState: seed,
    events: [],
  };
}

function pushEvent(
  state: GameState,
  type: GameEvent['type'],
  value: number | null = null,
  x: number | null = null,
  y: number | null = null,
): void {
  state.events.push({ type, tick: state.tick, value, x, y });
  if (state.events.length > 200) state.events.splice(0, state.events.length - 200);
}

function intervalFor(level: number, config: GameConfig): number {
  return Math.max(
    config.spawn.minIntervalMs,
    config.spawn.baseIntervalMs - (level - 1) * config.spawn.intervalPerLevel,
  );
}

function spawnOrb(state: GameState, config: GameConfig): void {
  const kindRoll = nextFloat(state.rngState, 0, 1);
  state.rngState = kindRoll.state;
  const kind: OrbKind = kindRoll.value < config.spawn.starChance ? 'star' : 'hazard';
  const radius = kind === 'star' ? config.orb.starRadius : config.orb.hazardRadius;

  const xRoll = nextInt(
    state.rngState,
    Math.ceil(radius + 12),
    Math.floor(config.world.width - radius - 12),
  );
  state.rngState = xRoll.state;

  const speedRoll = nextFloat(
    state.rngState,
    config.orb.baseSpeed + state.level * config.orb.speedPerLevel * 0.4,
    config.orb.baseSpeed + state.level * config.orb.speedPerLevel,
  );
  state.rngState = speedRoll.state;

  const driftRoll = nextFloat(state.rngState, -45, 45);
  state.rngState = driftRoll.state;

  const spinRoll = nextFloat(state.rngState, 0, Math.PI * 2);
  state.rngState = spinRoll.state;

  state.orbs.push({
    id: state.nextOrbId++,
    kind,
    x: xRoll.value,
    y: -radius,
    vx: driftRoll.value,
    vy: speedRoll.value,
    r: radius,
    spin: spinRoll.value,
  });
}

function clampPlayer(state: GameState, config: GameConfig): void {
  const { player } = state;
  const minX = player.r;
  const maxX = config.world.width - player.r;
  const minY = player.r;
  const maxY = config.world.height - player.r;

  if (player.x < minX) {
    player.x = minX;
    player.vx = 0;
  } else if (player.x > maxX) {
    player.x = maxX;
    player.vx = 0;
  }
  if (player.y < minY) {
    player.y = minY;
    player.vy = 0;
  } else if (player.y > maxY) {
    player.y = maxY;
    player.vy = 0;
  }
}

function gameOver(state: GameState): void {
  state.phase = 'gameover';
  state.best = Math.max(state.best, state.score);
  pushEvent(state, 'game-over', state.score);
}

export function createGame(options: GameOptions = {}): Game {
  const config = options.config ?? defaultConfig;
  const issues = validateConfig(config);
  if (issues.length > 0) {
    throw new Error(`invalid game config:\n- ${issues.join('\n- ')}`);
  }

  let best = Math.max(0, options.best ?? 0);
  const state = makeState(normalizeSeed(options.seed), best, config);

  const resetRun = (seed: number): void => {
    state.phase = 'playing';
    state.seed = seed;
    state.tick = 0;
    state.timeMs = 0;
    state.score = 0;
    state.lives = config.lives;
    state.combo = 1;
    state.comboMs = 0;
    state.level = 1;
    state.difficulty = difficultyFor(1, config);
    state.orbs = [];
    state.spawnTimerMs = config.spawn.baseIntervalMs;
    state.nextOrbId = 1;
    state.rngState = seed;
    state.player = {
      x: config.world.width / 2,
      y: config.world.height * 0.72,
      vx: 0,
      vy: 0,
      r: config.player.radius,
      invulnMs: config.invulnMs,
    };
    state.events = [];
    pushEvent(state, 'run-start', 0);
  };

  const api: Game = {
    state,
    config,

    start(seed?: number): void {
      resetRun(seed === undefined ? state.seed : normalizeSeed(seed));
    },

    reset(seed?: number): void {
      const fresh = makeState(seed === undefined ? state.seed : normalizeSeed(seed), best, config);
      Object.assign(state, fresh);
    },

    pause(): void {
      if (state.phase !== 'playing') return;
      state.phase = 'paused';
      pushEvent(state, 'pause');
    },

    resume(): void {
      if (state.phase !== 'paused') return;
      state.phase = 'playing';
      pushEvent(state, 'resume');
    },

    end(): void {
      if (state.phase === 'gameover') return;
      if (state.phase === 'menu') return;
      gameOver(state);
    },

    update(intent: Intent, dtMs: number): void {
      if (state.phase !== 'playing') return;
      const dt = Math.min(Math.max(dtMs, 0), MAX_DT_MS) / 1000;
      if (dt === 0) return;

      state.tick += 1;
      state.timeMs += dt * 1000;

      const { player } = state;
      const ax = (intent.right ? 1 : 0) - (intent.left ? 1 : 0);
      const ay = (intent.down ? 1 : 0) - (intent.up ? 1 : 0);
      player.vx += ax * config.player.accel * dt;
      player.vy += ay * config.player.accel * dt;
      if (ax === 0) player.vx *= Math.exp(-config.player.friction * dt);
      if (ay === 0) player.vy *= Math.exp(-config.player.friction * dt);

      const speed = Math.hypot(player.vx, player.vy);
      if (speed > config.player.maxSpeed) {
        const scale = config.player.maxSpeed / speed;
        player.vx *= scale;
        player.vy *= scale;
      }

      player.x += player.vx * dt;
      player.y += player.vy * dt;
      clampPlayer(state, config);

      state.spawnTimerMs -= dt * 1000;
      let spawnGuard = 0;
      while (state.spawnTimerMs <= 0 && spawnGuard < 8) {
        spawnGuard += 1;
        state.spawnTimerMs += intervalFor(state.level, config);
        spawnOrb(state, config);
      }

      for (let i = state.orbs.length - 1; i >= 0; i--) {
        const orb = state.orbs[i];
        if (orb === undefined) continue;
        orb.x += orb.vx * dt;
        orb.y += orb.vy * dt;
        orb.spin += dt * 1.6;

        const dx = orb.x - player.x;
        const dy = orb.y - player.y;
        const reach = orb.r + player.r;
        const touching = dx * dx + dy * dy <= reach * reach;

        if (touching && orb.kind === 'star') {
          state.orbs.splice(i, 1);
          state.combo = Math.min(state.combo + 1, config.combo.maxMultiplier);
          state.comboMs = config.combo.windowMs;
          state.score += 10 * state.combo;
          pushEvent(state, 'star', state.score, orb.x, orb.y);
          continue;
        }

        if (touching && orb.kind === 'hazard' && player.invulnMs <= 0) {
          state.orbs.splice(i, 1);
          state.lives -= 1;
          state.combo = 1;
          state.comboMs = 0;
          player.invulnMs = config.invulnMs;
          pushEvent(state, 'hit', state.lives, orb.x, orb.y);
          if (state.lives <= 0) {
            gameOver(state);
            return;
          }
          continue;
        }

        if (orb.y > config.world.height + 60 || orb.x < -80 || orb.x > config.world.width + 80) {
          state.orbs.splice(i, 1);
        }
      }

      if (player.invulnMs > 0) player.invulnMs = Math.max(0, player.invulnMs - dt * 1000);
      if (state.combo > 1) {
        state.comboMs -= dt * 1000;
        if (state.comboMs <= 0) {
          state.combo = 1;
          state.comboMs = 0;
        }
      }

      const level = levelFor(state.timeMs, config);
      if (level > state.level) {
        state.level = level;
        state.difficulty = difficultyFor(level, config);
        pushEvent(state, 'level-up', level);
      }
    },

    snapshot(): Snapshot {
      const { player } = state;
      return {
        phase: state.phase,
        seed: state.seed,
        tick: state.tick,
        timeMs: state.timeMs,
        score: state.score,
        best: state.best,
        lives: state.lives,
        combo: state.combo,
        level: state.level,
        difficulty: state.difficulty,
        player: {
          x: player.x,
          y: player.y,
          vx: player.vx,
          vy: player.vy,
          r: player.r,
          invuln: player.invulnMs > 0,
        },
        orbs: state.orbs.map((orb) => ({
          id: orb.id,
          kind: orb.kind,
          x: orb.x,
          y: orb.y,
          r: orb.r,
          spin: orb.spin,
        })),
        hash: hashState(state),
      };
    },

    drainEvents(): GameEvent[] {
      const drained = state.events.slice();
      state.events.length = 0;
      return drained;
    },
  };

  return api;
}
