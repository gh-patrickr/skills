import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { createServer, type Server, type Socket } from 'node:net';
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
const openServers: { server: Server; sockets: Set<Socket> }[] = [];
const startedThreads: string[] = [];

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
    const sockets = new Set<Socket>();
    server.on('connection', (socket) => {
      sockets.add(socket);
      socket.on('close', () => sockets.delete(socket));
    });
    server.once('error', (error) => reject(error));
    server.listen(port, '127.0.0.1', () => {
      openServers.push({ server, sockets });
      resolve();
    });
  });
}

async function startThread(thread: string): Promise<Record<string, unknown>> {
  startedThreads.push(thread);
  const result = await runWg(['dev', '--detach', '--thread', thread]);
  expect(result.code, result.stderr).toBe(0);
  return parseJson(result.stdout);
}

/** Bounded health probe: a dummy listener must never hang the test. */
async function healthy(url: string): Promise<boolean> {
  try {
    const response = await fetch(`${url}__wg/health`, { signal: AbortSignal.timeout(1_500) });
    return response.ok;
  } catch {
    return false;
  }
}

afterAll(async () => {
  // Stop whatever this test started, even when an assertion failed midway.
  for (const thread of startedThreads) await runWg(['dev:stop', '--thread', thread]);
  for (const { server, sockets } of openServers) {
    for (const socket of sockets) socket.destroy();
    await new Promise((resolve) => server.close(resolve));
  }
}, 30_000);

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
    // Only assert "unchanged" when the main server is actually running; a stale
    // state file of a stopped server is legitimately pruned.
    const mainRunning =
      mainBefore !== null &&
      (await healthy((JSON.parse(mainBefore) as { url: string }).url));

    const state = await startThread(thread);

    expect(state.thread).toBe(thread);
    expect(state.port as number).toBeGreaterThan(CONFIG.devPort ?? 5173);
    expect(state.stateFile).toBe(path.join('.wg', 'threads', `${thread}.json`));

    // The main server's state file is not read, written or removed.
    if (mainRunning) expect(await readFile(MAIN_STATE, 'utf8').catch(() => null)).toBe(mainBefore);

    expect(await healthy(String(state.url))).toBe(true);

    const stop = await runWg(['dev:stop', '--thread', thread]);
    expect(stop.code, stop.stderr).toBe(0);
    expect(await readFile(path.join(ROOT, '.wg', 'threads', `${thread}.json`), 'utf8').catch(() => null)).toBeNull();
    if (mainRunning) expect(await readFile(MAIN_STATE, 'utf8').catch(() => null)).toBe(mainBefore);
  }, 30_000);

  it('binds 0.0.0.0 always and restricts to 127.0.0.1 only with --local or --localhost', async () => {
    const openThread = `unit-host-open-${process.pid}`;
    const openState = await startThread(openThread);
    expect(openState.host).toBe('0.0.0.0');

    const stopOpen = await runWg(['dev:stop', '--thread', openThread]);
    expect(stopOpen.code, stopOpen.stderr).toBe(0);

    for (const [suffix, flag] of [
      ['local', '--local'],
      ['localhost', '--localhost'],
      ['emdash', '—local'],
    ] as const) {
      const localThread = `unit-host-${suffix}-${process.pid}`;
      startedThreads.push(localThread);
      const local = await runWg(['dev', '--detach', '--thread', localThread, flag]);
      expect(local.code, local.stderr).toBe(0);

      const localState = parseJson(local.stdout);
      expect(localState.host).toBe('127.0.0.1');
      expect(localState.lanUrl).toBeNull();
      expect(await healthy(String(localState.url))).toBe(true);

      const stopLocal = await runWg(['dev:stop', '--thread', localThread]);
      expect(stopLocal.code, stopLocal.stderr).toBe(0);
    }
  }, 90_000);

  it('binds preview servers to 0.0.0.0 always unless --local or --localhost is passed', async () => {
    const freePort = (): Promise<number> =>
      new Promise((resolve, reject) => {
        const probe = createServer();
        probe.once('error', reject);
        probe.listen(0, '0.0.0.0', () => {
          const addr = probe.address();
          const chosen = typeof addr === 'object' && addr !== null ? addr.port : 0;
          probe.close(() => resolve(chosen));
        });
      });

    const bootPreview = async (port: number, extraArgs: string[]): Promise<() => Promise<void>> => {
      const child = spawn(
        process.execPath,
        [path.join(ROOT, 'tools', 'wg.mjs'), 'preview', '--port', String(port), ...extraArgs],
        { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] },
      );
      const url = `http://127.0.0.1:${port}/`;
      const mirrorPath = path.join(ROOT, '.wg', 'instances', `preview-${port}.json`);
      const deadline = Date.now() + 45_000;
      while (Date.now() < deadline) {
        const hasMirror = (await readFile(mirrorPath, 'utf8').catch(() => null)) !== null;
        if (hasMirror && (await healthy(url))) break;
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      expect(await healthy(url)).toBe(true);
      return () =>
        new Promise<void>((resolve) => {
          child.once('close', () => resolve());
          child.kill('SIGTERM');
          setTimeout(() => child.kill('SIGKILL'), 2_000).unref();
        });
    };

    const openPort = await freePort();
    const stopOpen = await bootPreview(openPort, []);
    try {
      const state = JSON.parse(
        await readFile(path.join(ROOT, '.wg', 'instances', `preview-${openPort}.json`), 'utf8'),
      ) as { host?: string };
      expect(state.host).toBe('0.0.0.0');
    } finally {
      await stopOpen();
    }

    for (const flag of ['--local', '--localhost'] as const) {
      const localPort = await freePort();
      const stopLocal = await bootPreview(localPort, [flag]);
      try {
        const state = JSON.parse(
          await readFile(path.join(ROOT, '.wg', 'instances', `preview-${localPort}.json`), 'utf8'),
        ) as { host?: string };
        expect(state.host).toBe('127.0.0.1');
      } finally {
        await stopLocal();
      }
    }
  }, 90_000);

  it('never puts two threads on the same port', async () => {
    const first = `unit-a-${process.pid}`;
    const second = `unit-b-${process.pid}`;
    const a = await startThread(first);
    const b = await startThread(second);

    expect(a.port as number).not.toBe(b.port as number);
    expect(a.thread).toBe(first);
  }, 30_000);
});
