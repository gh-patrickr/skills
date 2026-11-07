import { spawn } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { access } from 'node:fs/promises';
import path from 'node:path';

/** Tail we keep in memory; full output is still streamed to the log file. */
const MAX_BUFFER = 4 * 1024 * 1024;

export function bin(root, name) {
  const suffix = process.platform === 'win32' ? '.cmd' : '';
  return path.join(root, 'node_modules', '.bin', `${name}${suffix}`);
}

export async function exists(target) {
  try {
    await access(target);
    return true;
  } catch {
    return false;
  }
}

/**
 * Run a child process, capture bounded output, tee it to a log file.
 * Never throws: callers decide what a non-zero code means.
 */
export function run(command, args, options = {}) {
  const {
    cwd,
    env = {},
    timeoutMs = 15 * 60 * 1000,
    logFile,
    quiet = true,
  } = options;

  return new Promise((resolve) => {
    const startedAt = Date.now();
    let stdout = '';
    let stderr = '';
    let timedOut = false;

    let child;
    try {
      child = spawn(command, args, {
        cwd,
        env: { ...process.env, FORCE_COLOR: '0', ...env },
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch (error) {
      resolve({
        ok: false,
        code: 127,
        stdout: '',
        stderr: String(error),
        ms: 0,
        timedOut: false,
      });
      return;
    }

    const log = logFile ? createWriteStream(logFile) : null;
    const append = (chunk) => {
      log?.write(chunk);
      if (!quiet) process.stdout.write(chunk);
    };

    child.stdout.on('data', (data) => {
      const text = data.toString();
      stdout = (stdout + text).slice(-MAX_BUFFER);
      append(text);
    });
    child.stderr.on('data', (data) => {
      const text = data.toString();
      stderr = (stderr + text).slice(-MAX_BUFFER);
      append(text);
    });

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, timeoutMs);

    child.on('error', (error) => {
      clearTimeout(timer);
      log?.end();
      resolve({ ok: false, code: 127, stdout, stderr: `${stderr}${String(error)}`, ms: Date.now() - startedAt, timedOut });
    });

    child.on('close', (code, signal) => {
      clearTimeout(timer);
      log?.end();
      resolve({
        ok: code === 0,
        code: code ?? 1,
        signal: signal ?? null,
        stdout,
        stderr,
        ms: Date.now() - startedAt,
        timedOut,
      });
    });
  });
}

/** Last `lines` lines of combined output, for a failure report. */
export function tail(result, lines = 40) {
  const text = [result.stdout, result.stderr].filter(Boolean).join('\n').trimEnd();
  if (!text) return '(no output)';
  return text.split('\n').slice(-lines).join('\n');
}
