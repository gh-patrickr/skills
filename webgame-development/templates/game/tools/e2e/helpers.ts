import type { Page } from '@playwright/test';
import type { Bridge } from '../../src/bridge';

declare global {
  interface Window {
    __WG__?: Bridge;
  }
}

export async function boot(page: Page, options: { seed?: number; live?: boolean } = {}): Promise<void> {
  const params = new URLSearchParams();
  params.set('seed', String(options.seed ?? 7));
  if (options.live) params.set('live', '1');
  await page.goto(`/?${params.toString()}`);
  await page.waitForFunction(() => window.__WG__?.ready === true);
}

export async function start(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Start run' }).click();
  await page.waitForFunction(() => window.__WG__?.snapshot().phase === 'playing');
}

export function snapshot(page: Page) {
  return page.evaluate(() => window.__WG__!.snapshot());
}

export function step(page: Page, frames: number) {
  return page.evaluate((count) => window.__WG__!.step(count), frames);
}

export function autoplay(page: Page, frames: number) {
  return page.evaluate((count) => window.__WG__!.autoplay(count), frames);
}
