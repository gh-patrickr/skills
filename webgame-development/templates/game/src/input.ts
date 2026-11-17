import type { Intent } from './game/types';

export type InputAction = 'pause' | 'mute';

const LEFT = new Set(['ArrowLeft', 'KeyA']);
const RIGHT = new Set(['ArrowRight', 'KeyD']);
const UP = new Set(['ArrowUp', 'KeyW']);
const DOWN = new Set(['ArrowDown', 'KeyS']);
const HANDLED = new Set([...LEFT, ...RIGHT, ...UP, ...DOWN, 'Space']);

/**
 * Adapter that turns keyboard + gamepad into the core's abstract `Intent`.
 * It also feeds the test bridge, so a keyboard-driven test and a
 * bridge-driven test travel the same code path.
 */
export interface InputController {
  attach(target: Window): () => void;
  intent(): Intent;
  setVirtual(patch: Partial<Intent>): void;
  clearVirtual(): void;
  onAction(handler: (action: InputAction) => void): () => void;
}

export function createInput(): InputController {
  const pressed = new Set<string>();
  const virtual: Intent = { left: false, right: false, up: false, down: false };
  const listeners = new Set<(action: InputAction) => void>();
  let detach: (() => void) | undefined;

  const axis = (): { x: number; y: number } => {
    const pads = typeof navigator !== 'undefined' && 'getGamepads' in navigator ? navigator.getGamepads() : [];
    const pad = pads?.[0];
    if (!pad) return { x: 0, y: 0 };
    const x = Math.abs(pad.axes[0] ?? 0) > 0.25 ? (pad.axes[0] ?? 0) : 0;
    const y = Math.abs(pad.axes[1] ?? 0) > 0.25 ? (pad.axes[1] ?? 0) : 0;
    return { x, y };
  };

  return {
    attach(target: Window): () => void {
      if (detach) detach();

      const onKeyDown = (event: KeyboardEvent): void => {
        if (event.code === 'KeyP' || event.code === 'Escape') {
          for (const listener of listeners) listener('pause');
          return;
        }
        if (event.code === 'KeyM') {
          for (const listener of listeners) listener('mute');
          return;
        }
        if (HANDLED.has(event.code)) {
          event.preventDefault();
          pressed.add(event.code);
        }
      };

      const onKeyUp = (event: KeyboardEvent): void => {
        pressed.delete(event.code);
      };

      const onBlur = (): void => {
        pressed.clear();
        virtual.left = virtual.right = virtual.up = virtual.down = false;
      };

      target.addEventListener('keydown', onKeyDown);
      target.addEventListener('keyup', onKeyUp);
      target.addEventListener('blur', onBlur);
      detach = () => {
        target.removeEventListener('keydown', onKeyDown);
        target.removeEventListener('keyup', onKeyUp);
        target.removeEventListener('blur', onBlur);
        detach = undefined;
      };
      return detach;
    },

    intent(): Intent {
      const pad = axis();
      return {
        left: virtual.left || [...LEFT].some((code) => pressed.has(code)) || pad.x < -0.25,
        right: virtual.right || [...RIGHT].some((code) => pressed.has(code)) || pad.x > 0.25,
        up: virtual.up || [...UP].some((code) => pressed.has(code)) || pad.y < -0.25,
        down: virtual.down || [...DOWN].some((code) => pressed.has(code)) || pad.y > 0.25,
      };
    },

    setVirtual(patch: Partial<Intent>): void {
      Object.assign(virtual, patch);
    },

    clearVirtual(): void {
      virtual.left = virtual.right = virtual.up = virtual.down = false;
    },

    onAction(handler: (action: InputAction) => void): () => void {
      listeners.add(handler);
      return () => listeners.delete(handler);
    },
  };
}
