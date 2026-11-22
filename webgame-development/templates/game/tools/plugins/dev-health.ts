import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import type { AddressInfo } from 'node:net';
import { dirname, join } from 'node:path';
import type { Plugin, ViteDevServer } from 'vite';

const STATE_DIR = '.wg';

/**
 * Where this server records itself.
 *
 * `WG_STATE_FILE` (set by `wg dev --thread`) keeps per-thread servers out of the
 * shared `.wg/dev.json`, so threads can never overwrite or delete each other's
 * state. Without it the historical main-server file is used.
 */
function stateFile(root: string, kind: 'dev' | 'preview'): string {
  const configured = process.env.WG_STATE_FILE;
  if (configured !== undefined && configured !== '') return join(root, configured);
  return join(root, STATE_DIR, kind === 'dev' ? 'dev.json' : 'preview.json');
}

async function writeState(root: string, server: ViteDevServer, kind: 'dev' | 'preview'): Promise<void> {
  const address = server.httpServer?.address();
  if (address === null || typeof address === 'string') return;
  const info = address as AddressInfo;
  const port = info.port;
  const host = info.address === '::' ? '0.0.0.0' : info.address;
  const state = {
    kind,
    thread: process.env.WG_THREAD || undefined,
    host,
    port,
    url: `http://127.0.0.1:${port}/`,
    endpoint: `http://127.0.0.1:${port}/__wg/health`,
    pid: process.pid,
    startedAt: new Date().toISOString(),
  };
  const body = `${JSON.stringify(state, null, 2)}\n`;
  const file = stateFile(root, kind);
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, body, 'utf8');
  // Mirror into the discovery directory so `wg dev:status --all` can find a
  // server even when its own state file was removed by hand.
  const mirror = join(root, STATE_DIR, 'instances', `${kind}-${port}.json`);
  await mkdir(dirname(mirror), { recursive: true });
  await writeFile(mirror, body, 'utf8');
}

/** Remove only a state file this process wrote — never another server's. */
async function removeOwnState(root: string, kind: 'dev' | 'preview'): Promise<void> {
  const file = stateFile(root, kind);
  try {
    const state = JSON.parse(await readFile(file, 'utf8')) as { pid?: number; port?: number };
    if (state.pid !== process.pid) return;
    await rm(file, { force: true });
    if (state.port !== undefined) {
      await rm(join(root, STATE_DIR, 'instances', `${kind}-${state.port}.json`), { force: true });
    }
  } catch {
    /* missing or partial — nothing to own */
  }
}

/**
 * Machine-readable dev-server state.
 *
 * Agents never guess a port: `wg dev --detach` reads `.wg/dev.json` (main) or
 * `.wg/threads/<id>.json` (per thread), and `/__wg/health` is the readiness
 * probe used by every automation.
 */
export function devHealth(): Plugin {
  return {
    name: 'wg:dev-health',
    configureServer(server) {
      server.middlewares.use('/__wg/health', (_req, res) => {
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Cache-Control', 'no-store');
        res.end(JSON.stringify({ ok: true, kind: 'dev', root: server.config.root }));
      });
      server.middlewares.use((req, res, next) => {
        res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
        if (!req.url?.includes('.')) res.setHeader('Cache-Control', 'no-store');
        next();
      });
      if (server.httpServer && 'keepAliveTimeout' in server.httpServer) {
        server.httpServer.keepAliveTimeout = 65_000;
        server.httpServer.headersTimeout = 66_000;
      }
      server.httpServer?.once('listening', () => {
        void writeState(server.config.root, server, 'dev');
      });
      server.httpServer?.once('close', () => {
        void removeOwnState(server.config.root, 'dev');
      });
    },
    configurePreviewServer(server) {
      if (server.httpServer && 'keepAliveTimeout' in server.httpServer) {
        server.httpServer.keepAliveTimeout = 65_000;
        server.httpServer.headersTimeout = 66_000;
      }
      server.middlewares.use((req, _res, next) => {
        req.headers['accept-encoding'] = 'identity';
        next();
      });
      server.middlewares.use('/__wg/health', (_req, res) => {
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ ok: true, kind: 'preview', root: server.config.root }));
      });
      server.httpServer?.once('listening', () => {
        void writeState(server.config.root, server as unknown as ViteDevServer, 'preview');
      });
      server.httpServer?.once('close', () => {
        void removeOwnState(server.config.root, 'preview');
      });
    },
  };
}
