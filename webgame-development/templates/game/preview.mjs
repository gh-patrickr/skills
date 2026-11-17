import { spawn } from 'node:child_process';
import path from 'node:path';
import { bin, exists, run } from './proc.mjs';

export async function waitForHttp(url, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  let lastError = 'not started';
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(2_000) });
      if (response.ok) return true;
      lastError = `HTTP ${response.status}`;
    } catch (error) {
      lastError = String(error);
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`timed out waiting for ${url}: ${lastError}`);
}

/**
 * Build (once) and return the output directory. `WG_OUT_DIR` lets a thread
 * serve its own build instead of a shared `dist-e2e/`.
 */
export async function ensureBuild(root, mode = 'e2e', logFile) {
  const outDir = process.env.WG_OUT_DIR ?? (mode === 'e2e' ? 'dist-e2e' : 'dist');
  if (await exists(path.join(root, outDir, 'index.html'))) return outDir;
  const args = ['build'];
  if (mode === 'e2e') args.push('--mode', 'e2e');
  args.push('--outDir', outDir);
  const result = await run(bin(root, 'vite'), args, { cwd: root, logFile });
  if (!result.ok) throw new Error(`build failed:\n${result.stderr || result.stdout}`);
  return outDir;
}

/**
 * Boot `vite preview` for a built output and wait for the health probe.
 * Callers must always `stop()`; the wrapper is used by perf and shot tools.
 */
export async function startPreview(root, { port = 4173, mode = 'e2e', logFile } = {}) {
  await ensureBuild(root, mode);
  const child = spawn(bin(root, 'vite'), ['preview', '--mode', mode, '--port', String(port), '--strictPort'], {
    cwd: root,
    env: { ...process.env, FORCE_COLOR: '0' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let stderr = '';
  child.stderr.on('data', (data) => {
    stderr += data.toString();
  });

  const url = `http://127.0.0.1:${port}`;
  try {
    await waitForHttp(`${url}/__wg/health`, 60_000);
  } catch (error) {
    child.kill('SIGKILL');
    throw new Error(`${String(error)}\n${stderr}`);
  }

  return {
    url,
    port,
    stop() {
      child.kill('SIGTERM');
      setTimeout(() => child.kill('SIGKILL'), 2_000).unref();
    },
  };
}
