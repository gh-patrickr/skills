import { mkdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

export async function startRun(root, command, label) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const safe = (label ?? command).replace(/[^a-z0-9-]+/gi, '-').toLowerCase();
  const dir = path.join(root, 'artifacts', `${stamp}-${safe}`);
  await mkdir(dir, { recursive: true });
  return {
    id: `${stamp}-${safe}`,
    dir,
    command,
    startedAt: new Date().toISOString(),
    startedMs: Date.now(),
    steps: [],
  };
}

export function record(run, step) {
  run.steps.push(step);
  return step;
}

function statusIcon(status) {
  return status === 'pass' ? '✅ pass' : status === 'skip' ? '⏭️ skip' : '❌ fail';
}

export async function finishRun(run, { ok, extra = [], notes = [] } = {}) {
  const durationMs = Date.now() - run.startedMs;
  const rows = run.steps
    .map((step, index) => `| ${index + 1} | ${step.name} | ${statusIcon(step.status)} | ${(step.ms / 1000).toFixed(1)}s |`)
    .join('\n');

  const failures = run.steps.filter((step) => step.status === 'fail');
  const failureBlocks = failures
    .map((step) => `### ${step.name}\n\n\`\`\`\n${step.detail ?? 'no output captured'}\n\`\`\``)
    .join('\n\n');

  const summaryPath = path.join(run.dir, 'summary.md');
  const summary = [
    `# Webgame verification — ${run.command}`,
    '',
    `- **Run:** \`${run.id}\``,
    `- **Result:** ${ok ? '**PASS**' : '**FAIL**'}`,
    `- **Started:** ${run.startedAt}`,
    `- **Duration:** ${(durationMs / 1000).toFixed(1)}s`,
    `- **Node:** ${process.version} (${process.platform}/${process.arch})`,
    `- **Host:** ${os.hostname()}`,
    '',
    '| # | Step | Result | Time |',
    '| --- | --- | --- | --- |',
    rows,
    '',
    ...(notes.length > 0 ? ['## Notes', '', ...notes.map((note) => `- ${note}`), ''] : []),
    ...(failureBlocks ? ['## Failures', '', failureBlocks, ''] : []),
    '## Artifacts',
    '',
    `- \`${summaryPath}\``,
    `- \`${path.join(run.dir, 'summary.json')}\``,
    ...extra.map((item) => `- \`${item}\``),
    '',
    'Reproduce the failing step from the log above; each step log lives next to this summary.',
  ].join('\n');

  const json = {
    schema: 'webgame/verify/v1',
    id: run.id,
    command: run.command,
    ok,
    startedAt: run.startedAt,
    durationMs,
    node: process.version,
    platform: `${process.platform}/${process.arch}`,
    steps: run.steps.map(({ name, status, ms, logFile }) => ({ name, status, ms, logFile })),
    notes,
  };

  await writeFile(summaryPath, `${summary}\n`, 'utf8');
  await writeFile(path.join(run.dir, 'summary.json'), `${JSON.stringify(json, null, 2)}\n`, 'utf8');
  await mkdir(path.join(run.dir, '..'), { recursive: true });
  await writeFile(
    path.join(run.dir, '..', 'last-run.json'),
    `${JSON.stringify({ id: run.id, dir: run.dir, summary: summaryPath, ok, finishedAt: new Date().toISOString() }, null, 2)}\n`,
    'utf8',
  );

  return { summaryPath, json, durationMs };
}
