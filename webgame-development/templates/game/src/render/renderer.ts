import { nextRandom } from '../game/rng';
import type { GameEvent, Snapshot } from '../game/types';

const W = 960;
const H = 600;
const STAR_COUNT = 120;
const MAX_PARTICLES = 420;

const PALETTE = {
  deep: '#04070f',
  skyTop: '#0a1124',
  skyBottom: '#04060d',
  star: '#ffd166',
  starCore: '#fff4cc',
  hazard: '#5b6b8c',
  hazardEdge: '#8296bd',
  player: '#8be9fd',
  playerCore: '#e6feff',
  danger: '#ff6b81',
  combo: '#ffd166',
} as const;

interface Star {
  x: number;
  y: number;
  z: number;
  size: number;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
}

export interface Renderer {
  resize(): void;
  update(dtMs: number): void;
  handle(events: readonly GameEvent[]): void;
  draw(snapshot: Snapshot): void;
  setReducedMotion(reduced: boolean): void;
  dispose(): void;
}

function makeStars(seed: number): Star[] {
  let state = seed >>> 0 || 1;
  const stars: Star[] = [];
  for (let index = 0; index < STAR_COUNT; index++) {
    const ax = nextRandom(state);
    state = ax.state;
    const ay = nextRandom(state);
    state = ay.state;
    const az = nextRandom(state);
    state = az.state;
    const as = nextRandom(state);
    state = as.state;
    stars.push({
      x: ax.value * W,
      y: ay.value * H,
      z: 0.25 + az.value * 0.75,
      size: 0.6 + as.value * 1.6,
    });
  }
  return stars;
}

export function createRenderer(canvas: HTMLCanvasElement): Renderer {
  const context = canvas.getContext('2d', { alpha: false });
  if (!context) throw new Error('Canvas 2D is required');

  let reduced = false;
  let dpr = 1;
  let stars = makeStars(1);
  let seed = 1;
  let starsState = 1;
  let particles: Particle[] = [];
  let shakeMs = 0;
  let flashMs = 0;
  let lastTick = -1;

  const resize = (): void => {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
  };

  const spawnBurst = (x: number, y: number, color: string, count: number, speed: number): void => {
    if (reduced) count = Math.ceil(count / 2);
    for (let index = 0; index < count; index++) {
      const a = nextRandom(starsState);
      starsState = a.state;
      const b = nextRandom(starsState);
      starsState = b.state;
      const angle = a.value * Math.PI * 2;
      const magnitude = speed * (0.35 + b.value);
      particles.push({
        x,
        y,
        vx: Math.cos(angle) * magnitude,
        vy: Math.sin(angle) * magnitude,
        life: 0.45 + a.value * 0.35,
        maxLife: 0.8,
        size: 1.5 + b.value * 2.5,
        color,
      });
    }
    if (particles.length > MAX_PARTICLES) particles.splice(0, particles.length - MAX_PARTICLES);
  };

  const drawBackground = (snapshot: Snapshot): void => {
    const gradient = context.createLinearGradient(0, 0, 0, H);
    gradient.addColorStop(0, PALETTE.skyTop);
    gradient.addColorStop(1, PALETTE.skyBottom);
    context.fillStyle = gradient;
    context.fillRect(0, 0, W, H);

    const nebula = context.createRadialGradient(W * 0.2, H * 0.15, 0, W * 0.2, H * 0.15, W * 0.55);
    nebula.addColorStop(0, 'rgba(64, 120, 255, 0.16)');
    nebula.addColorStop(1, 'rgba(64, 120, 255, 0)');
    context.fillStyle = nebula;
    context.fillRect(0, 0, W, H);

    const warm = context.createRadialGradient(W * 0.85, H * 0.9, 0, W * 0.85, H * 0.9, W * 0.5);
    warm.addColorStop(0, 'rgba(255, 140, 90, 0.08)');
    warm.addColorStop(1, 'rgba(255, 140, 90, 0)');
    context.fillStyle = warm;
    context.fillRect(0, 0, W, H);

    for (const star of stars) {
      const drift = (snapshot.timeMs * 0.02 * star.z) % (H + 40);
      const y = (star.y + drift) % (H + 40) - 20;
      context.globalAlpha = 0.18 + star.z * 0.55;
      context.fillStyle = '#cfe4ff';
      context.fillRect(star.x, y, star.size, star.size);
    }
    context.globalAlpha = 1;
  };

  const drawOrb = (kind: 'star' | 'hazard', x: number, y: number, radius: number, spin: number): void => {
    context.save();
    context.translate(x, y);
    if (kind === 'star') {
      context.rotate(spin);
      context.shadowColor = 'rgba(255, 209, 102, 0.9)';
      context.shadowBlur = 18;
      context.fillStyle = PALETTE.star;
      context.beginPath();
      for (let point = 0; point < 8; point++) {
        const angle = (point / 8) * Math.PI * 2;
        const length = point % 2 === 0 ? radius * 1.35 : radius * 0.55;
        const px = Math.cos(angle) * length;
        const py = Math.sin(angle) * length;
        if (point === 0) context.moveTo(px, py);
        else context.lineTo(px, py);
      }
      context.closePath();
      context.fill();
      context.shadowBlur = 0;
      context.fillStyle = PALETTE.starCore;
      context.beginPath();
      context.arc(0, 0, radius * 0.34, 0, Math.PI * 2);
      context.fill();
    } else {
      context.rotate(spin * 0.35);
      context.fillStyle = PALETTE.hazard;
      context.strokeStyle = PALETTE.hazardEdge;
      context.lineWidth = 2;
      context.beginPath();
      const sides = 7;
      for (let point = 0; point < sides; point++) {
        const angle = (point / sides) * Math.PI * 2;
        const wobble = 0.78 + ((point * 37) % 10) / 40;
        const px = Math.cos(angle) * radius * wobble;
        const py = Math.sin(angle) * radius * wobble;
        if (point === 0) context.moveTo(px, py);
        else context.lineTo(px, py);
      }
      context.closePath();
      context.fill();
      context.stroke();
      context.fillStyle = 'rgba(255, 255, 255, 0.12)';
      context.beginPath();
      context.arc(-radius * 0.25, -radius * 0.3, radius * 0.28, 0, Math.PI * 2);
      context.fill();
    }
    context.restore();
  };

  const drawPlayer = (snapshot: Snapshot): void => {
    const { player } = snapshot;
    const pulse = player.invuln ? 0.45 + Math.sin(snapshot.timeMs * 0.02) * 0.35 : 1;
    context.save();
    context.translate(player.x, player.y);
    context.globalAlpha = pulse;
    context.shadowColor = 'rgba(139, 233, 253, 0.85)';
    context.shadowBlur = 20;
    context.fillStyle = PALETTE.player;
    context.beginPath();
    context.moveTo(0, -player.r * 1.5);
    context.lineTo(player.r, player.r);
    context.lineTo(0, player.r * 0.55);
    context.lineTo(-player.r, player.r);
    context.closePath();
    context.fill();
    context.shadowBlur = 0;
    context.fillStyle = PALETTE.playerCore;
    context.beginPath();
    context.moveTo(0, -player.r * 0.85);
    context.lineTo(player.r * 0.42, player.r * 0.45);
    context.lineTo(-player.r * 0.42, player.r * 0.45);
    context.closePath();
    context.fill();

    const flame = 8 + Math.sin(snapshot.timeMs * 0.08) * 4;
    context.fillStyle = 'rgba(255, 190, 120, 0.9)';
    context.beginPath();
    context.moveTo(-player.r * 0.4, player.r * 0.8);
    context.lineTo(0, player.r + flame);
    context.lineTo(player.r * 0.4, player.r * 0.8);
    context.closePath();
    context.fill();
    context.restore();
  };

  const draw = (snapshot: Snapshot): void => {
    if (snapshot.seed !== seed) {
      seed = snapshot.seed;
      stars = makeStars(seed);
      starsState = seed ^ 0x9e3779b9;
      particles = [];
      lastTick = -1;
    }
    if (snapshot.tick < lastTick) lastTick = -1;
    lastTick = snapshot.tick;

    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    context.clearRect(0, 0, W, H);

    const shake = reduced ? 0 : shakeMs > 0 ? Math.sin(shakeMs * 0.9) * (shakeMs / 26) : 0;
    context.save();
    context.translate(shake, Math.cos(shakeMs * 0.7) * (shakeMs / 40));

    drawBackground(snapshot);
    for (const orb of snapshot.orbs) drawOrb(orb.kind, orb.x, orb.y, orb.r, orb.spin);
    if (snapshot.phase !== 'menu') drawPlayer(snapshot);

    for (const particle of particles) {
      const alpha = Math.max(0, particle.life / particle.maxLife);
      context.globalAlpha = alpha;
      context.fillStyle = particle.color;
      context.beginPath();
      context.arc(particle.x, particle.y, particle.size * alpha, 0, Math.PI * 2);
      context.fill();
    }
    context.globalAlpha = 1;
    context.restore();

    const vignette = context.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, W * 0.72);
    vignette.addColorStop(0, 'rgba(0, 0, 0, 0)');
    vignette.addColorStop(1, 'rgba(0, 0, 0, 0.62)');
    context.fillStyle = vignette;
    context.fillRect(0, 0, W, H);

    if (flashMs > 0 && !reduced) {
      context.fillStyle = `rgba(255, 80, 110, ${Math.min(0.35, flashMs / 600)})`;
      context.fillRect(0, 0, W, H);
    }

    if (snapshot.combo >= 3) {
      context.fillStyle = PALETTE.combo;
      context.globalAlpha = 0.9;
      context.font = '700 20px ui-monospace, SFMono-Regular, Menlo, monospace';
      context.textAlign = 'center';
      context.fillText(`×${snapshot.combo} CHAIN`, W / 2, H - 34);
      context.globalAlpha = 1;
      context.textAlign = 'start';
    }
  };

  return {
    resize,
    update(dtMs: number): void {
      const seconds = dtMs / 1000;
      shakeMs = Math.max(0, shakeMs - dtMs * 1.6);
      flashMs = Math.max(0, flashMs - dtMs * 1.4);
      const alive: Particle[] = [];
      for (const particle of particles) {
        particle.life -= seconds;
        if (particle.life <= 0) continue;
        particle.x += particle.vx * seconds;
        particle.y += particle.vy * seconds;
        particle.vx *= 0.985;
        particle.vy = particle.vy * 0.985 + 60 * seconds;
        alive.push(particle);
      }
      particles = alive;
    },
    handle(events: readonly GameEvent[]): void {
      for (const event of events) {
        if (event.type === 'star' && event.x !== null && event.y !== null) {
          spawnBurst(event.x, event.y, PALETTE.star, 14, 190);
        } else if (event.type === 'hit' && event.x !== null && event.y !== null) {
          spawnBurst(event.x, event.y, PALETTE.danger, 26, 260);
          shakeMs = 26;
          flashMs = 320;
        } else if (event.type === 'level-up') {
          shakeMs = 8;
        }
      }
    },
    draw,
    setReducedMotion(value: boolean): void {
      reduced = value;
    },
    dispose(): void {
      particles = [];
    },
  };
}
