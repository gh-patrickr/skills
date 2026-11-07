#!/usr/bin/env node
/**
 * Screenshot evidence for any scene. Used by `node tools/wg.mjs shot` and by
 * the skill's evidence step: every claim about the UI can point at a PNG.
 */
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { startPreview } from './lib/preview.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function arg(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  if (index === -1) return fallback;
  return process.argv[index + 1] ?? fallback;
}

const scene = arg('scene', 'gameplay');
const seed = Number(arg('seed', '7'));
const steps = Number(arg('steps', '180'));
const outDir = path.resolve(ROOT, arg('out', 'artifacts/shots'));
const port = Number(arg('port', '4175'));

await mkdir(outDir, { recursive: true });
const preview = await startPreview(ROOT, { port, mode: 'e2e' });
let browser;

try {
  browser = await chromium.launch({ channel: process.env.WG_CHANNEL ?? 'chrome', headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1 });
  await page.goto(`${preview.url}/?seed=${seed}`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__WG__?.ready === true);

  if (scene !== 'menu') {
    await page.getByRole('button', { name: 'Start run' }).click();
    await page.evaluate((count) => window.__WG__!.step(count), steps);
  }
  if (scene === 'gameover') {
    await page.evaluate(() => window.__WG__!.endRun());
  }

  const suffix = `${scene}-seed${seed}`;
  const fullPath = path.join(outDir, `${suffix}.png`);
  const canvasPath = path.join(outDir, `${suffix}-canvas.png`);
  await page.screenshot({ path: fullPath, fullPage: false });
  await page.locator('#game').screenshot({ path: canvasPath });

  const state = await page.evaluate(() => window.__WG__!.snapshot());
  console.log(JSON.stringify({ scene, seed, phase: state.phase, tick: state.tick, fullPath, canvasPath }, null, 2));
} finally {
  await browser?.close().catch(() => {});
  preview.stop();
}
