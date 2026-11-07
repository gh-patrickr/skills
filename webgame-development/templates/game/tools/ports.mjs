import { mkdir, open, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import net from 'node:net';
import path from 'node:path';

/**
 * Ports, threads and locks.
 *
 * Several agent threads (or several `wg verify` runs) may work on the same
 * checkout at once. Nothing here may depend on a fixed port or a single state
 * file: every run picks its own free ports, records its own server state and
 * takes a lock before touching a shared build directory.
 */

const HOST = '127.0.0.1';

/** Stable, filesystem-safe label for the current thread, or '' when unset. */
export function threadLabel(env = process.env) {
  const raw = env.WG_THREAD ?? env.DSH_THREAD ?? '';
  const clean = String(raw)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_.-]+/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '');
  return clean.slice(0, 32);
}

/** Thread label with a per-process fallback, so two runs never share a name. */
export function threadId(env = process.env) {
  return threadLabel(env) || `pid${process.pid}`;
}

export function stateDir(root) {
  return path.join(root, '.wg');
}

export function instanceFile(root, kind, port) {
  return path.join(stateDir(root), 'instances', `${kind}-${port}.json`);
}

export async function readJson(file) {
  try {
    return JSON.parse(await readFile(file, 'utf8'));
  } catch {
    return null;
  }
}

export async function writeJson(file, value) {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

export async function removeFile(file) {
  await rm(file, { force: true }).catch(() => {});
}

export async function isPortFree(port, host = HOST) {
  if (!Number.isInteger(port) || port < 1 || port > 65_535) return false;
  return new Promise((resolve) => {
    const server = net.createServer();
    server.unref();
    server.once('error', () => resolve(false));
    server.once('listening', () => server.close(() => resolve(true)));
    server.listen(port, host);
  });
}

/**
 * First free port at or after `preferred`. Never waits for or kills a process
 * that already owns a port — it simply moves on, which is what makes parallel
 * threads safe.
 */
export async function pickPort(preferred, { host = HOST, span = 50, exclude = [] } = {}) {
  const base = Number.isFinite(Number(preferred)) ? Math.trunc(Number(preferred)) : 5173;
  for (let port = Math.max(1024, base); port < base + span && port <= 65_535; port++) {
    if (exclude.includes(port)) continue;
    if (await isPortFree(port, host)) return port;
  }
  throw new Error(`no free port in ${base}..${base + span - 1} (host ${host})`);
}

/** Pick one free port per named service, all distinct. */
export async function pickPorts(seeds, options = {}) {
  const ports = {};
  const used = [];
  for (const [name, preferred] of Object.entries(seeds)) {
    const port = await pickPort(preferred, { ...options, exclude: used });
    ports[name] = port;
    used.push(port);
  }
  return ports;
}

/** `GET /__wg/health`; returns the parsed body or null. */
export async function probeServer(url, timeoutMs = 1_500) {
  try {
    const response = await fetch(new URL('/__wg/health', url), { signal: AbortSignal.timeout(timeoutMs) });
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
}

/**
 * Cross-process exclusive lock used around shared build directories and visual
 * baselines. A lock older than `staleMs` is treated as a crashed run.
 */
export async function withLock(root, name, fn, { timeoutMs = 180_000, staleMs = 15 * 60_000 } = {}) {
  const file = path.join(stateDir(root), 'locks', `${name}.lock`);
  await mkdir(path.dirname(file), { recursive: true });
  const deadline = Date.now() + timeoutMs;
  let handle = null;

  while (handle === null) {
    try {
      handle = await open(file, 'wx');
    } catch (error) {
      if (error?.code !== 'EEXIST') throw error;
      const info = await stat(file).catch(() => null);
      if (info !== null && Date.now() - info.mtimeMs > staleMs) {
        await removeFile(file);
        continue;
      }
      if (Date.now() > deadline) {
        throw new Error(
          `timed out waiting for ${path.relative(root, file)} — another run is building; ` +
            `delete the lock only if no run is active`,
        );
      }
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  }

  try {
    await handle.writeFile(
      `${JSON.stringify({ pid: process.pid, thread: threadId(), at: new Date().toISOString() })}\n`,
      'utf8',
    );
    return await fn();
  } finally {
    await handle.close().catch(() => {});
    await removeFile(file);
  }
}

/** State files of every server this checkout knows about (deduplicated by URL). */
export async function listServerStates(root) {
  const files = [path.join(stateDir(root), 'dev.json'), path.join(stateDir(root), 'preview.json')];
  for (const dir of ['threads', 'instances']) {
    const target = path.join(stateDir(root), dir);
    const entries = await readdir(target).catch(() => []);
    for (const entry of entries) {
      if (entry.endsWith('.json')) files.push(path.join(target, entry));
    }
  }

  const seen = new Map();
  for (const file of files) {
    const state = await readJson(file);
    if (state === null || typeof state.url !== 'string') continue;
    const key = String(state.port ?? new URL(state.url).port);
    const relative = path.relative(root, file);
    const existing = seen.get(key);
    if (existing === undefined) {
      seen.set(key, { ...state, stateFile: relative, stateFiles: [relative] });
    } else {
      existing.stateFiles.push(relative);
    }
  }
  return [...seen.values()];
}
