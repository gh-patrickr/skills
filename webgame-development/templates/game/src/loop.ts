/** Fixed-timestep game loop. Framework code: uses the clock, so it is not core. */

export const FIXED_STEP_MS = 1000 / 60;
const MAX_FRAME_MS = 250;
const MAX_STEPS_PER_FRAME = 8;

export interface LoopOptions {
  step(dtMs: number): void;
  render(alpha: number): void;
}

export interface Loop {
  start(): void;
  stop(): void;
  readonly running: boolean;
  fps(): number;
}

export function createLoop(options: LoopOptions): Loop {
  let raf = 0;
  let running = false;
  let last = 0;
  let accumulator = 0;
  let fps = 0;

  const frame = (now: number): void => {
    if (!running) return;
    const delta = Math.min(Math.max(now - last, 0), MAX_FRAME_MS);
    last = now;
    if (delta > 0) fps = fps === 0 ? 1000 / delta : fps * 0.9 + (1000 / delta) * 0.1;

    accumulator += delta;
    let steps = 0;
    while (accumulator >= FIXED_STEP_MS && steps < MAX_STEPS_PER_FRAME) {
      options.step(FIXED_STEP_MS);
      accumulator -= FIXED_STEP_MS;
      steps += 1;
    }
    // Drop the backlog rather than spiral when the tab was suspended.
    if (steps === MAX_STEPS_PER_FRAME) accumulator = 0;

    options.render(accumulator / FIXED_STEP_MS);
    raf = requestAnimationFrame(frame);
  };

  return {
    get running(): boolean {
      return running;
    },

    start(): void {
      if (running) return;
      running = true;
      last = performance.now();
      accumulator = 0;
      raf = requestAnimationFrame(frame);
    },

    stop(): void {
      running = false;
      cancelAnimationFrame(raf);
    },

    fps(): number {
      return Math.round(fps);
    },
  };
}
