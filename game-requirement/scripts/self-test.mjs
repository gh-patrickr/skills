#!/usr/bin/env node
// self-test.mjs — prove that check-spec.mjs accepts a good spec and rejects bad ones.
//
//   node scripts/self-test.mjs
//
// Copies templates/ into a temp dir, mutates one thing per case, runs the checker and
// compares the verdict. Exit 0 = every case behaved as designed.

import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SKILL = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const TPL = join(SKILL, 'templates');
const CHECKER = join(SKILL, 'scripts', 'check-spec.mjs');
const FILES = ['intake.de.md', 'spec.md', 'spec.de.md', 'open-questions.de.md'];
const root = mkdtempSync(join(tmpdir(), 'game-req-selftest-'));

let seq = 0;
function scaffold() {
  const dir = join(root, `case-${++seq}`);
  mkdirSync(dir, { recursive: true });
  for (const name of FILES) {
    const text = readFileSync(join(TPL, name), 'utf8')
      .replaceAll('{{GAME}}', 'Test-Rennen')
      .replaceAll('{{DATE}}', '2026-11-01');
    writeFileSync(join(dir, name), text);
  }
  return dir;
}

function edit(dir, name, from, to) {
  const p = join(dir, name);
  const text = readFileSync(p, 'utf8');
  if (!text.includes(from)) throw new Error(`${name}: "${from}" not found`);
  writeFileSync(p, text.replace(from, to));
}

function removeBlock(dir, name, heading) {
  const p = join(dir, name);
  const text = readFileSync(p, 'utf8');
  const start = text.indexOf(heading);
  if (start < 0) throw new Error(`${name}: "${heading}" not found`);
  const next = text.indexOf('\n## ', start + heading.length);
  const end = next < 0 ? text.length : next;
  writeFileSync(p, text.slice(0, start) + text.slice(end).replace(/^\n+/, '\n'));
}

const results = [];
function check(name, expect, contains) {
  const dir = scaffold();
  mutate(dir);
  const run = spawnSync(process.execPath, [CHECKER, dir], { encoding: 'utf8' });
  const verdict = run.status === 0 ? 'pass' : run.status === 1 ? 'fail' : `exit-${run.status}`;
  const out = `${run.stdout}${run.stderr}`;
  const okVerdict = verdict === expect;
  const okText = !contains || out.includes(contains);
  results.push({ name, expect, verdict, ok: okVerdict && okText, detail: okText ? '' : `missing "${contains}"` });
  rmSync(dir, { recursive: true, force: true });
}

let mutate = () => {};

// --- a good spec passes
mutate = () => {};
check('baseline draft', 'pass');

// --- a ready spec with a blocker is rejected
mutate = (dir) => {
  edit(dir, 'spec.md', 'status: draft', 'status: ready');
};
check('ready with open blocker', 'fail', 'BLOCKER');

// --- a ready spec with a clean frontmatter still needs a changelog + coverage
mutate = (dir) => {
  edit(dir, 'spec.md', 'status: draft', 'status: ready');
  edit(dir, 'spec.md', '- OQ-02 (BLOCKER) — Race against two computer animals, or only against the clock? The kids said "wer am weitesten ist" (Z.8) but the animals could be skins.\n', '');
  removeBlock(dir, 'open-questions.de.md', '## OQ-02');
};
check('ready, blocker answered', 'pass');

// --- duplicate IDs
mutate = (dir) => {
  edit(dir, 'spec.md', '| F-002 |', '| F-001 |');
};
check('duplicate requirement ID', 'fail', 'duplicate requirement ID');

// --- EXPLICIT without a trace
mutate = (dir) => {
  edit(dir, 'spec.md', '| Z.5 |', '| AD-01 |');
};
check('explicit without trace', 'fail', 'EXPLICIT needs a Z.n trace');

// --- trace to a line that does not exist
mutate = (dir) => {
  edit(dir, 'spec.md', '| Z.5 |', '| Z.99 |');
};
check('trace outside intake', 'fail', 'outside the intake');

// --- placeholder left in a ready spec
mutate = (dir) => {
  edit(dir, 'spec.md', 'status: draft', 'status: ready');
  edit(dir, 'spec.md', '## 1. Game summary', '## 1. Game summary\n\nTBD');
};
check('TBD in a ready spec', 'fail', 'TBD');

// --- German table out of sync
mutate = (dir) => {
  const p = join(dir, 'spec.de.md');
  writeFileSync(p, readFileSync(p, 'utf8').replace(/^\| F-005 \|.*\n/m, ''));
};
check('German table missing a requirement', 'fail', 'F-005 is missing');

// --- priority mapping
mutate = (dir) => {
  edit(dir, 'spec.de.md', '| F-001 | Dein Tier läuft von allein nach rechts. Mit der Rechtstaste wird es schneller, mit hoch und runter wechselst du die Spur. | Muss |',
    '| F-001 | Mit rechts läuft dein Tier nach rechts, mit hoch und runter wechselst du die Spur. | Sollte |');
};
check('German priority mismatch', 'fail', 'must start with "Muss"');

// --- a German question the spec does not know
mutate = (dir) => {
  const p = join(dir, 'open-questions.de.md');
  writeFileSync(p, readFileSync(p, 'utf8') + `
## OQ-03 — Extra?

**Wichtig:** nein
**Warum wir fragen:** Test.
- A) Ja
- B) Nein
**Unsere Empfehlung:** A
**Eure Antwort:** ____
`);
};
check('German question missing from spec', 'fail', 'missing from spec.md section 11');

// --- handoff JSON broken
mutate = (dir) => {
  edit(dir, 'spec.md', '"seed": 42,', '"seed": 42');
};
check('broken handoff JSON', 'fail', 'does not parse');

// --- a file is missing
mutate = (dir) => {
  rmSync(join(dir, 'spec.de.md'));
};
check('missing German spec', 'fail', 'file is missing');

// --- warnings alone do not fail the run
mutate = (dir) => {
  edit(dir, 'spec.de.md', '## Worum geht es', '## Worum geht es\n\nUnser Feature ist ein MVP, sagt der Spec-Blocker.');
};
check('jargon is only a warning', 'pass');

// --- P0 without an AC (only a gate for status ready)
mutate = (dir) => {
  edit(dir, 'spec.md', 'status: draft', 'status: ready');
  edit(dir, 'spec.md', '- OQ-02 (BLOCKER) — Race against two computer animals, or only against the clock? The kids said "wer am weitesten ist" (Z.8) but the animals could be skins.\n', '');
  removeBlock(dir, 'open-questions.de.md', '## OQ-02');
  edit(dir, 'spec.md', '| AC-003 | F-003 |', '| AC-003 | F-002 |');
};
check('P0 without acceptance criterion', 'fail', 'P0 requirement without an acceptance criterion');

// --- json mode
{
  const dir = scaffold();
  const run = spawnSync(process.execPath, [CHECKER, dir, '--json'], { encoding: 'utf8' });
  let parsed = null;
  try {
    parsed = JSON.parse(run.stdout);
  } catch {
    /* handled below */
  }
  const ok = run.status === 0 && parsed && parsed.ok === true && parsed.counts.requirements === 11;
  results.push({ name: '--json output', expect: 'json', verdict: ok ? 'json' : 'bad', ok, detail: '' });
  rmSync(dir, { recursive: true, force: true });
}

// --- usage error on a missing directory
{
  const run = spawnSync(process.execPath, [CHECKER, join(root, 'nope')], { encoding: 'utf8' });
  const ok = run.status === 2;
  results.push({ name: 'missing directory exits 2', expect: 'exit-2', verdict: `exit-${run.status}`, ok, detail: '' });
}

rmSync(root, { recursive: true, force: true });

let failed = 0;
for (const r of results) {
  const mark = r.ok ? 'ok  ' : 'FAIL';
  if (!r.ok) failed++;
  console.log(`${mark} ${r.name}  (expected ${r.expect}, got ${r.verdict})${r.detail ? ` — ${r.detail}` : ''}`);
}
console.log(`\n${results.length - failed}/${results.length} cases behaved as designed`);
process.exit(failed === 0 ? 0 : 1);
