/**
 * Seeded PRNG (mulberry32) with the state carried explicitly.
 *
 * Purity is the point: every call returns the next state, so the whole run is
 * serialisable and a bug is reproducible from `{ seed, tick }` alone.
 */

export interface RngStep {
  value: number;
  state: number;
}

/** Advance the generator once. `value` is in [0, 1). */
export function nextRandom(state: number): RngStep {
  let t = (state + 0x6d2b79f5) >>> 0;
  t = Math.imul(t ^ (t >>> 15), t | 1) >>> 0;
  t ^= (t + Math.imul(t ^ (t >>> 7), t | 61)) >>> 0;
  const value = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  return { value, state: t >>> 0 };
}

/** Uniform integer in [min, max] inclusive. */
export function nextInt(state: number, min: number, max: number): { value: number; state: number } {
  const low = Math.min(min, max);
  const high = Math.max(min, max);
  const step = nextRandom(state);
  return { value: low + Math.floor(step.value * (high - low + 1)), state: step.state };
}

/** Uniform float in [min, max). */
export function nextFloat(state: number, min: number, max: number): { value: number; state: number } {
  const step = nextRandom(state);
  return { value: min + step.value * (max - min), state: step.state };
}

/** Deterministic seed for a run id, useful for replay links. */
export function normalizeSeed(seed: number | undefined): number {
  if (seed === undefined || !Number.isFinite(seed)) return 1;
  const int = Math.floor(Math.abs(seed)) >>> 0;
  return int === 0 ? 1 : int;
}
