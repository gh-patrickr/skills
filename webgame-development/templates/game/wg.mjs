#!/usr/bin/env node
/**
 * wg — one command surface for every webgame automation.
 *
 *   node tools/wg.mjs verify        full evidence run (lint → unit → build → e2e → bots → perf)
 *   node tools/wg.mjs dev           dev server with a discoverable URL
 *   node tools/wg.mjs playtest      headless bot simulation over the pure core
 *   node tools/wg.mjs perf          FPS / long-frame budget in real Chrome
 *   node tools/wg.mjs assets        validate + hash public/assets
 *   node tools/wg.mjs watch         fast re-check loop while editing
 *
 * Nothing here needs a human decision: every failure prints the fix command,
 * and every run leaves artifacts/<run>/summary.md.
 */
import { spawn } from 'node:child_process';
import { closeSync, existsSync, openSync } from 'node:fs';
import { chmod, cp, mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { bin, exists, run, tail } from './lib/proc.mjs';
import { finishRun, record, startRun } from './lib/report.mjs';
import { checkBudgets, measureBundle } from './lib/budget.mjs';
import { formatIssues, lintRules } from './lib/rules.mjs';
import { startPreview, waitForHttp } from './lib/preview.mjs';
import {
  isPortFree,
  listServerStates,
  pickPort,
  pickPorts,
  probeServer,
  readJson,
  removeFile,
  threadId,
  threadLabel,
  withLock,
  writeJson,
} from './lib/ports.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CONFIG = JSON.parse(await readFile(path.join(ROOT, '.wg.json'), 'utf8'));
const DEV_HOST = typeof CONFIG.devHost === 'string' && CONFIG.devHost !== '' ? CONFIG.devHost : '127.0.0.1';
const DEV_PORT = num(CONFIG.devPort, 5173);
const PREVIEW_PORT = num(CONFIG.previewPort, 4173);
/** Label of this thread; empty means "the one shared main server". */
const THREAD = threadLabel();
/** Per-thread build dirs keep concurrent runs from overwriting each other. */
const BUILD_SUFFIX = THREAD === '' ? '' : `-${THREAD}`;
const ARGV = process.argv.slice(2);
const COMMAND = ARGV[0] ?? 'help';
const FLAGS = parseFlags(ARGV.slice(1));

function parseFlags(argv) {
  const flags = { _: [] };
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (!arg.startsWith('--')) {
      flags._.push(arg);
      continue;
    }
    const [key, inline] = arg.slice(2).split('=');
    const next = argv[index + 1];
    if (inline !== undefined) {
      flags[key] = inline;
    } else if (next !== undefined && !next.startsWith('-')) {
      flags[key] = next;
      index += 1;
    } else {
      flags[key] = true;
    }
  }
  return flags;
}

function num(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function slug(text) {
  return text.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase();
}

/** Build directory for this thread: `dist-e2e-<thread>` or `dist-e2e` for main. */
function buildDir(mode) {
  const base = mode === 'e2e' ? 'dist-e2e' : 'dist';
  return `${base}${BUILD_SUFFIX}`;
}

/** Build dir override, honoured by vite.config.ts and by every preview server. */
function buildEnv(mode) {
  return { WG_OUT_DIR: process.env.WG_OUT_DIR ?? buildDir(mode) };
}

function devStateFile(target) {
  return target === 'main'
    ? path.join(ROOT, '.wg', 'dev.json')
    : path.join(ROOT, '.wg', 'threads', `${target}.json`);
}

/** `--thread` may be bare, named, or absent (the shared main server). */
function devTarget() {
  if (FLAGS.thread === undefined || FLAGS.thread === false) return 'main';
  if (FLAGS.thread === true) return THREAD || `t${process.pid}`;
  return slug(String(FLAGS.thread)) || `t${process.pid}`;
}

/** Drop state files whose server is gone (killed without a clean shutdown). */
async function pruneDeadServers() {
  for (const state of await listServerStates(ROOT)) {
    if ((await probeServer(state.url, 600)) !== null) continue;
    for (const stateFile of state.stateFiles) {
      const insideStateDir = stateFile.split(path.sep).join('/').startsWith('.wg/');
      if (insideStateDir) await removeFile(path.join(ROOT, stateFile));
    }
  }
}

async function aliveState(file) {
  const state = await readJson(file);
  if (state === null || typeof state.url !== 'string') return null;
  const health = await probeServer(state.url);
  return { ...state, alive: health !== null };
}

const C = {
  dim: (text) => `\u001b[2m${text}\u001b[0m`,
  green: (text) => `\u001b[32m${text}\u001b[0m`,
  red: (text) => `\u001b[31m${text}\u001b[0m`,
  cyan: (text) => `\u001b[36m${text}\u001b[0m`,
};

function stepHeader(name) {
  console.log(`\n${C.cyan('▸')} ${name}`);
}

function indent(text, prefix = '    ') {
  return text
    .split('\n')
    .map((line) => `${prefix}${line}`)
    .join('\n');
}

async function ensureDependencies() {
  if (await exists(path.join(ROOT, 'node_modules', 'vite'))) return;
  console.log(`${C.dim('installing dependencies (first run)…')}`);
  const command = (await exists(path.join(ROOT, 'package-lock.json'))) && process.env.CI ? 'ci' : 'install';
  const result = await run('npm', [command, '--no-audit', '--no-fund'], { cwd: ROOT, timeoutMs: 10 * 60 * 1000 });
  if (!result.ok) {
    throw new Error(`npm ${command} failed\n${tail(result, 40)}`);
  }
}

function chromeInstalled() {
  const candidates =
    process.platform === 'darwin'
      ? ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome']
      : process.platform === 'win32'
        ? ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe']
        : ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser'];
  return candidates.some((candidate) => existsSync(candidate));
}

async function doctorChecks() {
  const checks = [];
  const [major, minor] = process.versions.node.split('.').map(Number);
  const nodeOk = major > 20 || (major === 20 && minor >= 19);
  checks.push({
    name: 'node',
    ok: nodeOk,
    detail: process.version,
    fix: 'install Node 20.19+ (https://nodejs.org)',
  });

  const depsOk = await exists(path.join(ROOT, 'node_modules', 'vite'));
  checks.push({
    name: 'dependencies',
    ok: depsOk,
    detail: depsOk ? 'node_modules present' : 'node_modules missing',
    fix: 'npm install',
  });

  const playwrightOk = await exists(path.join(ROOT, 'node_modules', '@playwright', 'test'));
  checks.push({
    name: 'playwright',
    ok: playwrightOk,
    detail: playwrightOk ? '@playwright/test installed' : 'not installed',
    fix: 'npm install',
  });

  const browserOk = chromeInstalled();
  checks.push({
    name: 'browser',
    ok: browserOk,
    detail: browserOk ? 'system Chrome found' : 'system Chrome not found',
    fix: 'npx playwright install chromium  (or install Google Chrome)',
  });

  // Ports are never a hard failure: a busy port belongs to another thread's
  // server, and every run below picks a free one instead of killing it.
  const devPortFree = await isPortFree(DEV_PORT);
  const devPortNext = devPortFree ? DEV_PORT : await pickPort(DEV_PORT).catch(() => null);
  checks.push({
    name: 'dev port',
    ok: devPortNext !== null,
    detail: devPortFree
      ? `${DEV_PORT} free`
      : `${DEV_PORT} in use — another server; dev/verify will use ${devPortNext ?? '???'}`,
    fix: `free ${DEV_PORT}, or run per-thread servers: node tools/wg.mjs dev --detach --thread`,
  });

  const previewPortFree = await isPortFree(PREVIEW_PORT);
  const previewPortNext = previewPortFree ? PREVIEW_PORT : await pickPort(PREVIEW_PORT).catch(() => null);
  checks.push({
    name: 'preview port',
    ok: previewPortNext !== null,
    detail: previewPortFree
      ? `${PREVIEW_PORT} free`
      : `${PREVIEW_PORT} in use — verify will use ${previewPortNext ?? '???'}`,
    fix: `free ${PREVIEW_PORT}, or pass --port N`,
  });

  const configOk = typeof CONFIG.name === 'string' && CONFIG.budgets !== undefined;
  checks.push({
    name: '.wg.json',
    ok: configOk,
    detail: configOk ? CONFIG.name : 'invalid config',
    fix: 'restore .wg.json from the skill template',
  });

  return checks;
}

async function doctor() {
  const checks = await doctorChecks();
  const ok = checks.every((check) => check.ok);
  if (FLAGS.json) {
    console.log(JSON.stringify({ ok, checks }, null, 2));
  } else {
    for (const check of checks) {
      console.log(`${check.ok ? C.green('✔') : C.red('✖')} ${check.name.padEnd(14)} ${C.dim(check.detail)}`);
      if (!check.ok) console.log(`   ${C.dim(`fix: ${check.fix}`)}`);
    }
    console.log(`\n${ok ? C.green('ready') : C.red('not ready')}`);
  }
  return ok;
}

async function installHooks() {
  if (!(await exists(path.join(ROOT, '.git')))) {
    console.error('not a git repository — run `git init` first');
    return 1;
  }
  const source = path.join(ROOT, 'tools', 'hooks', 'pre-commit');
  const target = path.join(ROOT, '.git', 'hooks', 'pre-commit');
  await mkdir(path.dirname(target), { recursive: true });
  await cp(source, target);
  await chmod(target, 0o755);
  console.log(`installed ${path.relative(ROOT, target)} (runs the fast check before each commit)`);
  return 0;
}

async function viteBuild(mode, logFile) {
  const args = ['build'];
  if (mode === 'e2e') args.push('--mode', 'e2e');
  return run(bin(ROOT, 'vite'), args, {
    cwd: ROOT,
    logFile,
    timeoutMs: 5 * 60 * 1000,
    env: buildEnv(mode),
  });
}

async function e2e(logFile, options = {}) {
  const args = ['test', '-c', 'tools/playwright.config.ts'];
  if (FLAGS.fast) args.push('--grep', '\\[smoke\\]');
  if (FLAGS.update === 'all' || FLAGS.update === true) args.push('--update-snapshots=all');
  else if (FLAGS.update === 'missing' || !process.env.CI) args.push('--update-snapshots=missing');
  const port = options.port ?? (await pickPort(PREVIEW_PORT));
  return run(bin(ROOT, 'playwright'), args, {
    cwd: ROOT,
    logFile,
    timeoutMs: 10 * 60 * 1000,
    env: {
      WG_E2E_PORT: String(port),
      // Always start our own preview: never attach to a server another thread
      // may be restarting, and never reuse a stale one.
      WG_REUSE_SERVER: '0',
      ...buildEnv('e2e'),
      ...(options.artifactsDir ? { WG_ARTIFACTS_DIR: options.artifactsDir } : {}),
    },
  });
}

/**
 * Rebuild the e2e bundle and rewrite the visual baselines. Use it only when a
 * visual change is intended, and say so in the summary.
 */
async function visualUpdate(logFile) {
  // Baselines are one shared file set: two threads rewriting them at the same
  // time corrupts snapshots, so this is the one step that must be serialised.
  return withLock(ROOT, 'visual-baselines', async () => {
    const build = await viteBuild('e2e', logFile);
    if (!build.ok) return { ok: false, detail: `build failed\n${tail(build, 40)}` };
    const port = await pickPort(PREVIEW_PORT);
    const result = await run(
      bin(ROOT, 'playwright'),
      ['test', '-c', 'tools/playwright.config.ts', '--project=visual', '--update-snapshots=all'],
      {
        cwd: ROOT,
        logFile,
        timeoutMs: 10 * 60 * 1000,
        env: { WG_E2E_PORT: String(port), WG_REUSE_SERVER: '0', ...buildEnv('e2e') },
      },
    );
    return { ok: result.ok, detail: result.ok ? undefined : tail(result, 40) };
  });
}

async function playtest(logFile, outFile, options = {}) {
  const simDir = path.join(ROOT, '.wg', `sim${BUILD_SUFFIX}`);
  const build = await run(
    bin(ROOT, 'vite'),
    ['build', '--ssr', 'tools/sim/playtest.ts', '--outDir', `.wg/sim${BUILD_SUFFIX}`, '--emptyOutDir'],
    { cwd: ROOT, logFile, timeoutMs: 3 * 60 * 1000 },
  );
  if (!build.ok) return { ok: false, detail: `SSR build failed\n${tail(build, 40)}` };

  const entryCandidates = ['playtest.js', 'playtest.mjs'];
  let entry = null;
  for (const candidate of entryCandidates) {
    if (await exists(path.join(simDir, candidate))) {
      entry = path.join(simDir, candidate);
      break;
    }
  }
  if (entry === null) return { ok: false, detail: `SSR build produced no entry in ${simDir}` };

  const args = [
    entry,
    '--out', outFile,
    '--seconds', String(FLAGS.seconds ?? CONFIG.playtest.seconds),
    '--bots', String(FLAGS.bots ?? CONFIG.playtest.bots),
    '--seed', String(FLAGS.seed ?? CONFIG.playtest.seed),
  ];
  const result = await run(process.execPath, args, { cwd: ROOT, logFile, timeoutMs: 5 * 60 * 1000, quiet: options.quiet ?? true });
  return { ok: result.ok, detail: result.ok ? undefined : tail(result, 60) };
}

async function perf(logFile, outFile, options = {}) {
  const args = [
    path.join(ROOT, 'tools', 'perf', 'measure.mjs'),
    '--out', outFile,
    '--port', String(options.port ?? (await pickPort(PREVIEW_PORT + 1))),
    '--fps-min', String(CONFIG.budgets.fpsMin),
    '--long-frame-max', String(CONFIG.budgets.longFrameRatioMax),
  ];
  const result = await run(process.execPath, args, {
    cwd: ROOT,
    logFile,
    timeoutMs: 5 * 60 * 1000,
    quiet: options.quiet ?? true,
    env: buildEnv('e2e'),
  });
  return { ok: result.ok, detail: result.ok ? undefined : tail(result, 60) };
}

async function assets(logFile) {
  const result = await run(process.execPath, [path.join(ROOT, 'tools', 'assets', 'validate.mjs')], {
    cwd: ROOT,
    logFile,
    timeoutMs: 2 * 60 * 1000,
  });
  return { ok: result.ok, detail: result.ok ? undefined : tail(result, 60) };
}

async function verify() {
  if (!(await exists(path.join(ROOT, 'node_modules', 'vite')))) {
    await ensureDependencies();
  }

  // Every server this run needs gets its own free port. Nothing here reads or
  // restarts the dev server another thread is using.
  const ports = await pickPorts({ preview: PREVIEW_PORT, perf: PREVIEW_PORT + 1, shot: PREVIEW_PORT + 2 }, { span: 80 });
  const e2eDir = buildDir('e2e');
  const prodDir = buildDir('production');

  const runInfo = await startRun(ROOT, FLAGS.fast ? 'verify --fast' : 'verify', 'verify');
  console.log(`${C.dim(`artifacts: ${path.relative(ROOT, runInfo.dir)} · preview port ${ports.preview}`)}`);

  const steps = [];
  const addStep = (name, fn, options = {}) => steps.push({ name, fn, options });

  addStep('doctor', async () => {
    const checks = await doctorChecks();
    const failed = checks.filter((check) => !check.ok);
    return { ok: failed.length === 0, detail: failed.map((check) => `${check.name}: ${check.detail} → ${check.fix}`).join('\n') };
  });

  addStep('lint (types + architecture)', async (logFile) => {
    const tsc = await run(bin(ROOT, 'tsc'), ['-p', 'tsconfig.json', '--noEmit'], { cwd: ROOT, logFile, timeoutMs: 3 * 60 * 1000 });
    const issues = await lintRules(ROOT);
    if (!tsc.ok || issues.length > 0) {
      return { ok: false, detail: [tsc.ok ? '' : tail(tsc, 60), issues.length > 0 ? formatIssues(issues) : ''].filter(Boolean).join('\n') };
    }
    return { ok: true };
  });

  addStep('unit tests + coverage', async (logFile) => {
    const result = await run(bin(ROOT, 'vitest'), ['run', '--coverage'], { cwd: ROOT, logFile, timeoutMs: 5 * 60 * 1000 });
    return { ok: result.ok, detail: result.ok ? undefined : tail(result, 80) };
  });

  addStep('build (e2e)', async (logFile) => {
    const result = await viteBuild('e2e', logFile);
    return { ok: result.ok, detail: result.ok ? undefined : tail(result, 60) };
  });

  addStep('build (production)', async (logFile) => {
    const result = await viteBuild('production', logFile);
    return { ok: result.ok, detail: result.ok ? undefined : tail(result, 60) };
  });

  addStep('bundle budget', async (logFile) => {
    const bundle = await measureBundle(path.join(ROOT, prodDir));
    await writeFile(logFile, `${JSON.stringify(bundle, null, 2)}\n`, 'utf8');
    const failures = checkBudgets(bundle, CONFIG.budgets);
    const summary = `js ${bundle.jsKb.toFixed(1)} KB · css ${bundle.cssKb.toFixed(1)} KB · total ${bundle.totalKb.toFixed(1)} KB (gz)`;
    return { ok: failures.length === 0, detail: failures.length === 0 ? summary : `${failureBlocks(failures)}\n` };
  });

  addStep('e2e (ui, visual, a11y)', async (logFile) => {
    const result = await e2e(logFile, {
      port: ports.preview,
      artifactsDir: path.join(runInfo.dir, 'playwright'),
    });
    return { ok: result.ok, detail: result.ok ? undefined : tail(result, 80) };
  });

  addStep(
    'playtest (bots)',
    async (logFile) => playtest(logFile, path.join(runInfo.dir, 'playtest.json')),
    { skip: FLAGS.fast === true },
  );

  addStep(
    'perf budget',
    async (logFile) => perf(logFile, path.join(runInfo.dir, 'perf.json'), { port: ports.perf }),
    { skip: FLAGS.fast === true },
  );

  let ok = true;
  for (const { name, fn, options } of steps) {
    if (options.skip) {
      record(runInfo, { name, status: 'skip', ms: 0 });
      console.log(`\n${C.dim(`▸ ${name} — skipped (fast mode)`)}`);
      continue;
    }
    stepHeader(name);
    const logFile = path.join(runInfo.dir, `${String(runInfo.steps.length + 1).padStart(2, '0')}-${slug(name)}.log`);
    const started = Date.now();
    let outcome;
    try {
      outcome = await fn(logFile);
    } catch (error) {
      outcome = { ok: false, detail: String(error?.stack ?? error) };
    }
    const ms = Date.now() - started;
    if (outcome.ok) {
      record(runInfo, { name, status: 'pass', ms, logFile });
      console.log(`  ${C.green('✔')} ${C.dim(`${(ms / 1000).toFixed(1)}s`)}`);
      if (typeof outcome.detail === 'string' && outcome.detail.length > 0) console.log(indent(outcome.detail));
    } else {
      record(runInfo, { name, status: 'fail', ms, logFile, detail: outcome.detail ?? '' });
      ok = false;
      console.error(`  ${C.red('✖')} ${C.dim(`${(ms / 1000).toFixed(1)}s — log: ${path.relative(ROOT, logFile)}`)}`);
      console.error(indent(outcome.detail ?? 'no output'));
      if (!FLAGS['keep-going']) break;
    }
  }

  for (const step of steps.slice(runInfo.steps.length)) {
    record(runInfo, { name: step.name, status: 'skip', ms: 0 });
  }

  const { summaryPath } = await finishRun(runInfo, {
    ok,
    extra: [path.join(runInfo.dir, 'playtest.json'), path.join(runInfo.dir, 'perf.json')].filter((file) => file.length > 0),
    notes: [
      FLAGS.fast ? 'Fast mode skipped bots and perf.' : 'Full evidence run.',
      `Dedicated servers: preview :${ports.preview}, perf :${ports.perf}, shot :${ports.shot}. ` +
        `Build dirs: ${e2eDir}/, ${prodDir}/. No shared dev server was read or restarted.`,
    ],
  });

  console.log(`\n${ok ? C.green('PASS') : C.red('FAIL')} — ${path.relative(ROOT, summaryPath)}`);
  return ok ? 0 : 1;
}

function failureBlocks(failures) {
  return failures.map((failure) => `- ${failure}`).join('\n');
}

function devLogFile(target) {
  return target === 'main' ? path.join(ROOT, '.wg', 'dev.log') : path.join(ROOT, '.wg', 'logs', `dev-${target}.log`);
}

async function waitForState(file, timeoutMs = 5_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const state = await readJson(file);
    if (state !== null && typeof state.url === 'string') return state;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return null;
}

/**
 * Start a dev server.
 *
 * `--thread` gives this run its own server, its own state file
 * (`.wg/threads/<id>.json`) and its own free port. The shared main server
 * (`.wg/dev.json`) is reused when it is up and never restarted implicitly.
 */
async function dev() {
  const target = devTarget();
  const stateFile = devStateFile(target);
  const detach = FLAGS.detach === true;

  await pruneDeadServers();
  const known = await aliveState(stateFile);
  if (known?.alive && FLAGS.restart !== true) {
    console.log(
      JSON.stringify(
        { ok: true, reused: true, thread: target, url: known.url, pid: known.pid, stateFile: path.relative(ROOT, stateFile) },
        null,
        2,
      ),
    );
    return 0;
  }

  const explicitPort = num(FLAGS.port, 0);
  // A thread server never lands on the main port: it scans above it.
  const firstPort = target === 'main' ? DEV_PORT : DEV_PORT + 1;
  let port = explicitPort > 0 ? explicitPort : await pickPort(firstPort, { host: DEV_HOST });

  if (!(await isPortFree(port, DEV_HOST))) {
    // A live server on our own port is reused, never killed.
    const health = await probeServer(`http://127.0.0.1:${port}/`);
    if (health !== null && health.root === ROOT && explicitPort === 0) {
      console.log(
        JSON.stringify(
          { ok: true, reused: true, thread: target, url: `http://${DEV_HOST}:${port}/`, note: 'server already running' },
          null,
          2,
        ),
      );
      return 0;
    }
    if (explicitPort > 0) {
      console.error(`port ${port} is already in use — pass --port N or start an isolated server with --thread`);
      return 1;
    }
    port = await pickPort(port + 1, { host: DEV_HOST });
    console.log(C.dim(`port ${port - 1} is busy — taking ${port} instead`));
  }

  const env = { ...process.env, ...(target === 'main' ? {} : { WG_STATE_FILE: path.relative(ROOT, stateFile) }) };
  const args = ['--port', String(port), '--strictPort', '--host', DEV_HOST];
  const url = `http://${DEV_HOST}:${port}/`;

  if (detach) {
    const logFile = devLogFile(target);
    await mkdir(path.dirname(logFile), { recursive: true });
    // Write straight to a file descriptor: piping into the parent keeps its
    // event loop alive and makes `--detach` never return.
    const fd = openSync(logFile, 'a');
    const child = spawn(bin(ROOT, 'vite'), args, {
      cwd: ROOT,
      detached: true,
      stdio: ['ignore', fd, fd],
      env,
    });
    closeSync(fd);
    child.unref();
    await waitForHttp(`http://127.0.0.1:${port}/__wg/health`, 45_000);
    const state =
      (await waitForState(stateFile)) ??
      { kind: 'dev', thread: target, port, url: `http://127.0.0.1:${port}/`, pid: child.pid, startedAt: new Date().toISOString() };
    if (state.thread === undefined) state.thread = target;
    if (state.port === undefined) state.port = port;
    await writeJson(stateFile, state);
    console.log(
      JSON.stringify(
        {
          ok: true,
          reused: false,
          thread: target,
          url: state.url,
          port,
          pid: state.pid,
          stateFile: path.relative(ROOT, stateFile),
          log: path.relative(ROOT, logFile),
        },
        null,
        2,
      ),
    );
    return 0;
  }

  console.log(`${C.dim(`starting dev server on http://${DEV_HOST}:${port}/`)}`);
  const child = spawn(bin(ROOT, 'vite'), args, {
    cwd: ROOT,
    stdio: 'inherit',
    env,
  });
  if (FLAGS.open) {
    await waitForHttp(`http://127.0.0.1:${port}/__wg/health`, 45_000).then(() => {
      const opener = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open';
      spawn(opener, [url], { stdio: 'ignore', detached: true }).unref();
    });
  }
  return new Promise((resolve) => {
    child.on('close', (code) => resolve(code ?? 0));
  });
}

async function devStatus() {
  if (FLAGS.all === true) {
    await pruneDeadServers();
    const servers = [];
    for (const state of await listServerStates(ROOT)) {
      const health = await probeServer(state.url);
      servers.push({
        thread: state.thread ?? null,
        kind: state.kind ?? 'dev',
        url: state.url,
        port: state.port ?? new URL(state.url).port,
        pid: state.pid,
        alive: health !== null,
        stateFile: state.stateFile,
      });
    }
    const ok = servers.some((server) => server.alive);
    console.log(JSON.stringify({ ok, servers }, null, 2));
    return ok ? 0 : 1;
  }

  const target = devTarget();
  const state = await aliveState(devStateFile(target));
  if (state === null) {
    console.log(
      JSON.stringify(
        { ok: false, running: false, thread: target, hint: `node tools/wg.mjs dev --detach${target === 'main' ? '' : ` --thread ${target}`}` },
        null,
        2,
      ),
    );
    return 1;
  }
  console.log(
    JSON.stringify(
      { ok: state.alive, running: state.alive, thread: target, url: state.url, pid: state.pid, port: state.port ?? new URL(state.url).port },
      null,
      2,
    ),
  );
  return state.alive ? 0 : 1;
}

async function stopServer(file, label) {
  const state = await aliveState(file);
  if (state === null) return null;
  try {
    process.kill(state.pid, 'SIGTERM');
  } catch {
    /* already gone */
  }
  await removeFile(file);
  if (state.port !== undefined) {
    await removeFile(path.join(ROOT, '.wg', 'instances', `${state.kind ?? 'dev'}-${state.port}.json`));
  }
  return { thread: label, url: state.url, pid: state.pid, wasAlive: state.alive };
}

async function devStop() {
  if (FLAGS.all === true) {
    const stopped = [];
    await pruneDeadServers();
    for (const state of await listServerStates(ROOT)) {
      const file = path.join(ROOT, state.stateFile);
      const isMain = state.stateFile.split(path.sep).join('/') === '.wg/dev.json';
      if (isMain && FLAGS.main !== true) continue;
      const result = await stopServer(file, state.thread ?? (isMain ? 'main' : 'server'));
      if (result !== null) stopped.push(result);
    }
    console.log(JSON.stringify({ ok: true, stopped, mainUntouched: FLAGS.main !== true }, null, 2));
    return 0;
  }

  const target = devTarget();
  const stopped = await stopServer(devStateFile(target), target);
  if (stopped === null) {
    console.log(`no ${target === 'main' ? 'main ' : ''}dev server recorded`);
    return 0;
  }
  console.log(`stopped ${stopped.url} (pid ${stopped.pid})`);
  return 0;
}

/** Explicit restart of one server — used once at the end, never mid-run. */
async function devRestart() {
  const target = devTarget();
  await stopServer(devStateFile(target), target);
  FLAGS.detach = true;
  FLAGS.restart = true;
  return dev();
}

async function preview() {
  const explicitPort = num(FLAGS.port, 0);
  const port = explicitPort > 0 ? explicitPort : await pickPort(PREVIEW_PORT);
  const outDir = process.env.WG_OUT_DIR ?? buildDir(await previewMode());
  const mode = await previewMode();
  if (!(await exists(path.join(ROOT, outDir, 'index.html')))) {
    const result = await viteBuild(mode);
    if (!result.ok) {
      console.error(tail(result, 40));
      return 1;
    }
  }
  const child = spawn(bin(ROOT, 'vite'), ['preview', '--mode', mode, '--port', String(port), '--strictPort'], {
    cwd: ROOT,
    stdio: 'inherit',
    env: { ...process.env, ...buildEnv(mode) },
  });
  return new Promise((resolve) => child.on('close', (code) => resolve(code ?? 0)));
}

async function previewMode() {
  if (FLAGS.mode === 'e2e' || FLAGS.mode === 'production') return FLAGS.mode;
  const e2e = await exists(path.join(ROOT, process.env.WG_OUT_DIR ?? buildDir('e2e')));
  return e2e ? 'e2e' : 'production';
}

async function shot() {
  const args = [
    path.join(ROOT, 'tools', 'shots.mjs'),
    '--scene', String(FLAGS.scene ?? 'gameplay'),
    '--seed', String(FLAGS.seed ?? 7),
    '--steps', String(FLAGS.steps ?? 180),
    '--out', String(FLAGS.out ?? path.join(ROOT, 'artifacts', 'shots')),
    '--port', String(num(FLAGS.port, 0) || (await pickPort(PREVIEW_PORT + 2))),
  ];
  const result = await run(process.execPath, args, {
    cwd: ROOT,
    timeoutMs: 3 * 60 * 1000,
    quiet: false,
    env: buildEnv('e2e'),
  });
  return result.ok ? 0 : 1;
}

async function watchLoop() {
  await ensureDependencies();
  let running = false;
  let pending = false;
  let timer = null;

  const quickCheck = async () => {
    const started = Date.now();
    const logFile = path.join(ROOT, '.wg', 'watch.log');
    await mkdir(path.dirname(logFile), { recursive: true });
    const tsc = await run(bin(ROOT, 'tsc'), ['-p', 'tsconfig.json', '--noEmit'], { cwd: ROOT, logFile });
    const issues = await lintRules(ROOT);
    const unit = await run(bin(ROOT, 'vitest'), ['run', '--reporter=dot'], { cwd: ROOT, logFile });
    const ok = tsc.ok && issues.length === 0 && unit.ok;
    const seconds = ((Date.now() - started) / 1000).toFixed(1);
    if (ok) {
      console.log(`${new Date().toLocaleTimeString()} ${C.green('PASS')} ${C.dim(`lint+unit in ${seconds}s`)}`);
    } else {
      console.log(`${new Date().toLocaleTimeString()} ${C.red('FAIL')} ${C.dim(`in ${seconds}s — .wg/watch.log`)}`);
      if (issues.length > 0) console.log(indent(formatIssues(issues)));
      if (!tsc.ok) console.log(indent(tail(tsc, 25)));
      if (!unit.ok) console.log(indent(tail(unit, 40)));
    }
  };

  const schedule = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      if (running) {
        pending = true;
        return;
      }
      running = true;
      void quickCheck().finally(() => {
        running = false;
        if (pending) {
          pending = false;
          schedule();
        }
      });
    }, 250);
  };

  const { watch } = await import('node:fs');
  watch(path.join(ROOT, 'src'), { recursive: true }, schedule);
  watch(path.join(ROOT, 'tests'), { recursive: true }, schedule);
  watch(path.join(ROOT, 'tools'), { recursive: true }, (event, file) => {
    if (file && /\.(mjs|ts)$/.test(file)) schedule();
  });

  console.log(`${C.dim('watching src/, tests/, tools/ — Ctrl-C to stop')}`);
  await quickCheck();
  await new Promise(() => {});
}

async function clean() {
  const days = num(FLAGS.days, 7);
  const artifacts = path.join(ROOT, 'artifacts');
  let removed = 0;
  try {
    const entries = await readdir(artifacts);
    for (const entry of entries) {
      const target = path.join(artifacts, entry);
      const info = await stat(target);
      const ageDays = (Date.now() - info.mtimeMs) / 86_400_000;
      if (FLAGS.all || ageDays > days) {
        await rm(target, { recursive: true, force: true });
        removed += 1;
      }
    }
  } catch {
    /* nothing to clean */
  }
  if (FLAGS.all) {
    for (const entry of await readdir(ROOT).catch(() => [])) {
      if (/^dist(-|$)/.test(entry)) await rm(path.join(ROOT, entry), { recursive: true, force: true });
    }
    for (const dir of ['sim', 'threads', 'locks', 'logs']) {
      for (const entry of await readdir(path.join(ROOT, '.wg')).catch(() => [])) {
        if (entry.startsWith(dir)) await rm(path.join(ROOT, '.wg', entry), { recursive: true, force: true });
      }
    }
  }
  console.log(`removed ${removed} artifact run(s)${FLAGS.all ? ' and build caches' : ` older than ${days} day(s)`}`);
  return 0;
}

function help() {
  console.log(`wg — webgame automation

  node tools/wg.mjs <command> [flags]

  verify                 full evidence run: doctor, lint, unit, build, e2e, bots, perf
  verify --fast          lint + unit + e2e smoke only
  verify --keep-going    run every step even after a failure
  dev [--port N]         dev server (foreground); main server, keep it running
  dev --detach           background main dev server; URL + pid in .wg/dev.json
  dev --detach --thread  per-thread server on its own free port (never 5173)
  dev:status [--all]     JSON status of one server / every known server
  dev:stop [--thread X]  stop that server, or --all thread servers (main stays)
  dev:restart [--thread] explicit restart — do it once, at the end of the work
  preview [--port N]     serve the built game (builds on demand)
  playtest               headless bot simulation of the pure core
  perf                   FPS + long-frame budget in real Chrome
  assets                 validate and hash public/assets
  shot [--scene S]       screenshot menu/gameplay/gameover
  visual:update          rebuild + rewrite the visual baselines (intended changes only)
  watch                  lint + unit loop while you edit
  hooks:install          install the pre-commit fast check
  clean [--all]          remove old artifact runs
  doctor [--json]        environment check with fixes

  Common flags: --seed=N --seconds=N --bots=N --ci`);
}

async function main() {
  switch (COMMAND) {
    case 'verify':
      return verify();
    case 'doctor': {
      const ok = await doctor();
      return ok ? 0 : 2;
    }
    case 'dev':
      await ensureDependencies();
      return dev();
    case 'dev:status':
      return devStatus();
    case 'dev:stop':
      return devStop();
    case 'dev:restart':
      await ensureDependencies();
      return devRestart();
    case 'preview':
      await ensureDependencies();
      return preview();
    case 'playtest': {
      await ensureDependencies();
      const outFile = path.join(ROOT, 'artifacts', 'playtest', `playtest-${Date.now()}.json`);
      await mkdir(path.dirname(outFile), { recursive: true });
      const result = await playtest(undefined, outFile, { quiet: false });
      if (!result.ok) console.error(result.detail ?? 'playtest failed');
      return result.ok ? 0 : 1;
    }
    case 'perf': {
      await ensureDependencies();
      const outFile = path.join(ROOT, 'artifacts', 'perf', 'perf.json');
      await mkdir(path.dirname(outFile), { recursive: true });
      const result = await perf(undefined, outFile, { quiet: false });
      if (!result.ok) console.error(result.detail ?? 'perf failed');
      return result.ok ? 0 : 1;
    }
    case 'assets': {
      const result = await assets(undefined);
      if (!result.ok) console.error(result.detail ?? 'asset validation failed');
      return result.ok ? 0 : 1;
    }
    case 'shot':
      await ensureDependencies();
      return shot();
    case 'visual:update': {
      await ensureDependencies();
      const result = await visualUpdate(path.join(ROOT, 'artifacts', 'visual-update.log'));
      if (!result.ok) {
        console.error(result.detail ?? 'visual update failed');
        return 1;
      }
      console.log('visual baselines updated');
      return 0;
    }
    case 'watch':
      return watchLoop();
    case 'hooks:install':
      return installHooks();
    case 'clean':
      return clean();
    case 'help':
    case '--help':
    case '-h':
      help();
      return 0;
    default:
      console.error(`unknown command: ${COMMAND}\n`);
      help();
      return 1;
  }
}

main()
  .then((code) => {
    process.exitCode = code ?? 0;
  })
  .catch((error) => {
    console.error(`${C.red('fatal:')} ${error?.stack ?? error}`);
    process.exitCode = 1;
  });
