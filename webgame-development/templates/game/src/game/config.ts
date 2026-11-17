/** Balance knobs live in one data object so tests and playtest share them. */

export interface GameConfig {
  world: { width: number; height: number };
  player: { radius: number; accel: number; maxSpeed: number; friction: number };
  spawn: { baseIntervalMs: number; minIntervalMs: number; intervalPerLevel: number; starChance: number };
  orb: { starRadius: number; hazardRadius: number; baseSpeed: number; speedPerLevel: number };
  combo: { maxMultiplier: number; windowMs: number };
  levels: { everyMs: number; max: number };
  lives: number;
  invulnMs: number;
}

export const defaultConfig: GameConfig = {
  world: { width: 960, height: 600 },
  player: { radius: 14, accel: 2600, maxSpeed: 430, friction: 9 },
  spawn: { baseIntervalMs: 620, minIntervalMs: 210, intervalPerLevel: 62, starChance: 0.34 },
  orb: { starRadius: 11, hazardRadius: 18, baseSpeed: 105, speedPerLevel: 17 },
  combo: { maxMultiplier: 5, windowMs: 2600 },
  levels: { everyMs: 15_000, max: 8 },
  lives: 3,
  invulnMs: 1_300,
};

/** Returns human-readable problems; empty means the config is safe. */
export function validateConfig(config: GameConfig): string[] {
  const issues: string[] = [];
  const { world, player, spawn, orb, combo, levels } = config;

  if (!(world.width > 0 && world.height > 0)) issues.push('world dimensions must be positive');
  if (!(player.radius > 0 && player.radius < world.height / 2)) issues.push('player.radius must fit the world');
  if (!(player.accel > 0 && player.maxSpeed > 0)) issues.push('player.accel and maxSpeed must be positive');
  if (!(player.friction >= 0)) issues.push('player.friction must be >= 0');
  if (!(spawn.baseIntervalMs > 0)) issues.push('spawn.baseIntervalMs must be > 0');
  if (!(spawn.minIntervalMs > 0 && spawn.minIntervalMs <= spawn.baseIntervalMs)) {
    issues.push('spawn.minIntervalMs must be > 0 and <= spawn.baseIntervalMs');
  }
  if (!(spawn.intervalPerLevel >= 0)) issues.push('spawn.intervalPerLevel must be >= 0');
  if (!(spawn.starChance >= 0 && spawn.starChance <= 1)) issues.push('spawn.starChance must be within 0..1');
  if (!(orb.starRadius > 0 && orb.hazardRadius > 0)) issues.push('orb radii must be positive');
  if (!(orb.baseSpeed > 0 && orb.speedPerLevel >= 0)) issues.push('orb speed must be positive');
  if (!(combo.maxMultiplier >= 1)) issues.push('combo.maxMultiplier must be >= 1');
  if (!(combo.windowMs >= 0)) issues.push('combo.windowMs must be >= 0');
  if (!(levels.everyMs > 0 && levels.max >= 1)) issues.push('levels.everyMs must be > 0 and levels.max >= 1');
  if (!(config.lives >= 1)) issues.push('lives must be >= 1');
  if (!(config.invulnMs >= 0)) issues.push('invulnMs must be >= 0');

  return issues;
}

/** Level ramps every `levels.everyMs` and saturates at `levels.max`. */
export function levelFor(timeMs: number, config: GameConfig = defaultConfig): number {
  const raw = Math.floor(Math.max(0, timeMs) / config.levels.everyMs) + 1;
  return Math.min(raw, config.levels.max);
}

/** Difficulty is a readable scalar derived from the level (1..levels.max). */
export function difficultyFor(level: number, config: GameConfig = defaultConfig): number {
  if (config.levels.max <= 1) return 1;
  return 1 + ((level - 1) / (config.levels.max - 1)) * 2.5;
}
