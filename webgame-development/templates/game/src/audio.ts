/**
 * Tiny WebAudio synth so the starter ships with zero binary assets.
 * All sounds are generated, which keeps the bundle under budget and makes the
 * audio path testable without fixture files.
 */

export type SfxName = 'star' | 'hit' | 'start' | 'over' | 'ui';

interface SfxSpec {
  frequency: number;
  endFrequency: number;
  duration: number;
  type: OscillatorType;
  gain: number;
}

const SPECS: Record<SfxName, SfxSpec> = {
  star: { frequency: 880, endFrequency: 1_320, duration: 0.12, type: 'triangle', gain: 0.16 },
  hit: { frequency: 160, endFrequency: 60, duration: 0.28, type: 'sawtooth', gain: 0.22 },
  start: { frequency: 320, endFrequency: 640, duration: 0.22, type: 'sine', gain: 0.18 },
  over: { frequency: 300, endFrequency: 90, duration: 0.6, type: 'triangle', gain: 0.2 },
  ui: { frequency: 520, endFrequency: 520, duration: 0.05, type: 'square', gain: 0.08 },
};

export interface Sfx {
  unlock(): void;
  play(name: SfxName): void;
  setMuted(muted: boolean): void;
  isMuted(): boolean;
  dispose(): void;
}

type AudioContextCtor = new () => AudioContext;

export function createSfx(initialMuted: boolean): Sfx {
  let muted = initialMuted;
  let context: AudioContext | null = null;

  const ensureContext = (): AudioContext | null => {
    if (muted) return null;
    if (context) return context;
    const Ctor =
      (globalThis as { AudioContext?: AudioContextCtor; webkitAudioContext?: AudioContextCtor }).AudioContext ??
      (globalThis as { webkitAudioContext?: AudioContextCtor }).webkitAudioContext;
    if (!Ctor) return null;
    try {
      context = new Ctor();
    } catch {
      return null;
    }
    return context;
  };

  return {
    unlock(): void {
      const ctx = ensureContext();
      if (ctx && ctx.state === 'suspended') void ctx.resume();
    },

    play(name: SfxName): void {
      const ctx = ensureContext();
      if (!ctx) return;
      const spec = SPECS[name];
      const now = ctx.currentTime;
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      oscillator.type = spec.type;
      oscillator.frequency.setValueAtTime(spec.frequency, now);
      oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, spec.endFrequency), now + spec.duration);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(spec.gain, now + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + spec.duration);
      oscillator.connect(gain).connect(ctx.destination);
      oscillator.start(now);
      oscillator.stop(now + spec.duration + 0.02);
    },

    setMuted(value: boolean): void {
      muted = value;
      if (muted && context && context.state === 'running') void context.suspend();
    },

    isMuted(): boolean {
      return muted;
    },

    dispose(): void {
      if (context) void context.close();
      context = null;
    },
  };
}
