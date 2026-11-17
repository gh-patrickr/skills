#!/usr/bin/env node
/**
 * Real-browser performance measurement.
 *
 * Boots the built game in Chrome, samples 240 requestAnimationFrame deltas,
 * and fails on the configured FPS floor or long-frame ratio. Run by
 * `node tools/wg.mjs perf`.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { startPreview } from '../lib/preview.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

function flag(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  if (index === -1) return fallback;
  const value = Number(process.argv[index + 1]);
  return Number.isFinite(value) ? value : fallback;
}

const outFile = path.resolve(ROOT, process.argv[process.argv.indexOf('--out') + 1] ?? 'artifacts/perf/perf.json');
const port = flag('port', 4174);
const fpsMin = flag('fps-min', 50);
const longFrameMax = flag('long-frame-max', 0.05);
const SAMPLES = 240;

const preview = await startPreview(ROOT, { port, mode: 'e2e' });
let browser;

try {
  browser = await chromium.launch({ channel: process.env.WG_CHANNEL ?? 'chrome', headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1 });

  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });

  await page.goto(`${preview.url}/?seed=42&live=1`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.__WG__?.ready === true);
  await page.getByRole('button', { name: 'Start run' }).click();
  await page.waitForTimeout(400);

  const rawDeltas = await page.evaluate(async (samples) => {
    return await new Promise((resolve) => {
      const values = [];
      let last = performance.now();
      const frame = (now) => {
        values.push(now - last);
        last = now;
        if (values.length >= samples) resolve(values);
        else requestAnimationFrame(frame);
      };
      requestAnimationFrame(frame);
    });
  }, SAMPLES);

  // Drop the first frames (compositor warm-up, first paint) — they measure
  // startup, not steady-state gameplay. Sustained FPS comes from the median so
  // a single GC pause cannot fail an otherwise smooth run; stalls are reported
  // and budgeted separately.
  const deltas = rawDeltas.slice(10);
  const sorted = [...deltas].sort((a, b) => a - b);
  const mean = deltas.reduce((sum, delta) => sum + delta, 0) / deltas.length;
  const median = sorted[Math.floor(sorted.length / 2)];
  const p95 = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))];
  const longFrames = deltas.filter((delta) => delta > 25).length;
  const longRatio = longFrames / deltas.length;
  const stalls = deltas.filter((delta) => delta > 50).length;
  const fps = 1000 / median;
  const meanFps = 1000 / mean;

  const heap = await page.evaluate(() => {
    const memory = performance.memory;
    return memory ? Math.round(memory.usedJSHeapSize / 1024 / 1024) : null;
  });

  await mkdir(path.dirname(outFile), { recursive: true });
  await page.screenshot({ path: path.join(path.dirname(outFile), 'perf-frame.png') }).catch(() => {});

  const failures = [];
  if (fps < fpsMin) failures.push(`FPS ${fps.toFixed(1)} < floor ${fpsMin}`);
  if (longRatio > longFrameMax) failures.push(`long-frame ratio ${(longRatio * 100).toFixed(1)}% > ${(longFrameMax * 100).toFixed(0)}%`);
  if (errors.length > 0) failures.push(`runtime errors: ${errors.join(' | ')}`);

  const report = {
    schema: 'webgame/perf/v1',
    ok: failures.length === 0,
    url: `${preview.url}/?seed=42&live=1`,
    samples: deltas.length,
    fps: Number(fps.toFixed(1)),
    meanFps: Number(meanFps.toFixed(1)),
    avgFrameMs: Number(mean.toFixed(2)),
    medianFrameMs: Number(median.toFixed(2)),
    p95FrameMs: Number(p95.toFixed(2)),
    maxFrameMs: Number(sorted[sorted.length - 1].toFixed(2)),
    longFrameRatio: Number(longRatio.toFixed(4)),
    stalls,
    heapMb: heap,
    budgets: { fpsMin, longFrameMax },
    failures,
    errors,
  };

  await writeFile(outFile, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

  console.log(
    `fps ${report.fps} (median, min ${fpsMin}; mean ${report.meanFps}) · p95 ${report.p95FrameMs} ms · long frames ${(longRatio * 100).toFixed(1)}% · stalls ${stalls}` +
      (heap === null ? '' : ` · heap ${heap} MB`),
  );
  if (failures.length > 0) {
    console.error(failures.join('\n'));
    process.exitCode = 1;
  } else {
    console.log(`PASS — ${outFile}`);
  }
} finally {
  await browser?.close().catch(() => {});
  preview.stop();
}
