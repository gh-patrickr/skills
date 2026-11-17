import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { createServer, type Server } from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';

/**
 * Guards the parallel-thread contract of the automation layer:
 *
 * - a busy port is not a failure — every run takes a free one instead,
 * - a thread server gets its own port and state file,
 * - the main dev server is never touched by a thread.
 */
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const CONFIG = JSON.parse(await readFile(path.join(ROOT, '.wg.json'), 'utf8')) as {
  devPort?: number;
  previewPort?: number;
};
const MAIN_STATE = path.join(ROOT, '.wg', 'dev.json');
const openServers: Server[] = [];

interface RunResult {
  code: number | null;
  stdout: string;
  stderr: string;
}

function runWg(args: string[]): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(ROOT, 'tools', 'wg.mjs'), ...args], {
      cwd: ROOT,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (data: Buffer) => (stdout += data.toString()));
    child.stderr.on('data', (data: Buffer) => (stderr += data.toString()));
    child.on('error', reject);
    child.on('close', (code) => resolve({ code, stdout, stderr }));
  });
}

function parseJson(stdout: string): Record<string, unknown> {
  const start = stdout.indexOf('{');
  return JSON.parse(stdout.slice(start)) as Record<string, unknown>;
}

async function occupy(port: number): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const server = createServer();
    server.once('error', (error) => reject(error));
    server.listen(port, '127.0.0.1', () => {
      openServers.push(server);
      resolve();
    });
  });
}

afterAll(async () => {
  for (const server of openServers) await new Promise((resolve) => server.close(resolve));
});

describe('wg parallel-thread contract', () => {
  it('treats a busy port as informational, not as a doctor failure', async () => {
    const port = CONFIG.devPort ?? 5173;
    // If something already listens there the port is busy anyway; either way
    // doctor must stay green and point at the next free port.
    await occupy(port).catch(() => undefined);

    const doctor = await runWg(['doctor', '--json']);
    const report = parseJson(doctor.stdout) as {
      ok: boolean;
      checks: { name: string; ok: boolean; detail: string }[];
    };
    const devPort = report.checks.find((check) => check.name === 'dev port');

    // Doctor may still fail on an unrelated check (e.g. no Chrome); the port
    // check itself must never be the blocker.
    expect(devPort, doctor.stderr).toBeDefined();
    expect(devPort?.ok).toBe(true);
    expect(devPort?.detail).toContain('in use');
  }, 30_000);

  it('gives a thread its own port and state file, leaving the main server alone', async () => {
    const thread = `unit-${process.pid}`;
    const mainBefore = await readFile(MAIN_STATE, 'utf8').catch(() => null);

    const start = await runWg(['dev', '--detach', '--thread', thread]);
    expect(start.code, start.stderr).toBe(0);
    const state = parseJson(start.stdout);

    expect(state.thread).toBe(thread);
    expect(state.port as number).toBeGreaterThan(CONFIG.devPort ?? 5173);
    expect(state.stateFile).toBe(path.join('.wg', 'threads', `${thread}.json`));

    // The main server's state file is not read, written or removed.
    expect(await readFile(MAIN_STATE, 'utf8').catch(() => null)).toBe(mainBefore);

    const health = await fetch(`${String(state.url)}__wg/health`).catch(() => null);
    expect(health?.ok).toBe(true);

    const stop = await runWg(['dev:stop', '--thread', thread]);
    expect(stop.code, stop.stderr).toBe(0);
    expect(await readFile(path.join(ROOT, '.wg', 'threads', `${thread}.json`), 'utf8').catch(() => null)).toBeNull();
    expect(await readFile(MAIN_STATE, 'utf8').catch(() => null)).toBe(mainBefore);
  }, 30_000);

  it('never puts two threads on the same port', async () => {
    const first = `unit-a-${process.pid}`;
    const second = `unit-b-${process.pid}`;
    const a = await runWg(['dev', '--detach', '--thread', first]);
    const b = await runWg(['dev', '--detach', '--thread', second]);
    expect(a.code, a.stderr).toBe(0);
    expect(b.code, b.stderr).toBe(0);

    const portA = parseJson(a.stdout).port as number;
    const portB = parseJson(b.stdout).port as number;
    expect(portA).not.toBe(portB);

    await runWg(['dev:stop', '--thread', first]);
    await runWg(['dev:stop', '--thread', second]);
  }, 30_000);
});
