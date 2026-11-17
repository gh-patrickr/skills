#!/usr/bin/env node
// check-spec.mjs — validate a game-requirement spec set.
//
//   node scripts/check-spec.mjs [docs/requirements] [--json] [--quiet]
//
// Exit codes: 0 = PASS, 1 = FAIL (spec errors), 2 = usage / missing files.
// No dependencies. Node >= 18.

import { existsSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const FILE = {
  intake: 'intake.de.md',
  spec: 'spec.md',
  de: 'spec.de.md',
  questions: 'open-questions.de.md',
};

const STATUSES = ['draft', 'ready', 'confirmed'];
const VIEWPOINTS = ['side-scroll-2d', 'top-down-2d', 'isometric-2d', 'fixed-camera-2d', '3d'];
const INPUTS = ['keyboard', 'pointer', 'touch', 'gamepad'];
const SAVES = ['none', 'localStorage', 'localStorage+export'];
const AUDIO = ['none', 'sfx', 'sfx+music'];
const TESTS = ['unit', 'e2e', 'visual', 'a11y', 'bot', 'perf'];
const LANGS = ['de', 'en', 'de+en'];
const PRIO_DE = { P0: 'Muss', P1: 'Sollte', P2: 'Kann später' };
const EN_SECTIONS = [
  [1, 'summary'],
  [2, 'handoff'],
  [3, 'players'],
  [4, 'core loop'],
  [5, 'requirements'],
  [6, 'acceptance'],
  [7, 'out of scope'],
  [8, 'assumptions'],
  [9, 'traceability'],
  [10, 'risks'],
  [11, 'open questions'],
  [12, 'changelog'],
];
const DE_SECTIONS = [
  ['worum geht', 'summary'],
  ['so spielst du', 'core loop'],
  ['was im spiel drin ist', 'requirements'],
  ['klappt', 'acceptance checks'],
  ['nicht drin', 'out of scope'],
  ['angenommen', 'assumptions'],
  ['bitte bestätigen', 'confirmation'],
];
const JARGON = [
  'requirement', 'requirements', 'feature', 'mvp', 'scope', 'acceptance',
  'handoff', 'blocker', 'spec', 'backend', 'framework', 'deployment', 'api', 'ticket',
];

// ---------------------------------------------------------------- plumbing

const argv = process.argv.slice(2);
if (argv.includes('--help') || argv.includes('-h')) {
  console.log(`check-spec.mjs — validate docs/requirements for the game-requirement skill

usage: node scripts/check-spec.mjs [dir] [--json] [--quiet]

  dir       folder with ${FILE.intake}, ${FILE.spec}, ${FILE.de}, ${FILE.questions}
            (default: docs/requirements)
  --json    one JSON object on stdout
  --quiet   only errors and the final verdict

exit 0 = PASS, 1 = FAIL, 2 = usage or missing files`);
  process.exit(0);
}

const asJson = argv.includes('--json');
const quiet = argv.includes('--quiet');
const dirArg = argv.find((a) => !a.startsWith('-'));
const dir = resolve(dirArg ?? 'docs/requirements');

const errors = [];
const warnings = [];
const fail = (file, msg) => errors.push({ file, msg });
const warn = (file, msg) => warnings.push({ file, msg });

function readIfPresent(name) {
  const p = join(dir, name);
  if (!existsSync(p) || !statSync(p).isFile()) return null;
  return readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
}

function parseFrontmatter(text, file) {
  const m = /^---\n([\s\S]*?)\n---\n?/.exec(text);
  if (!m) {
    fail(file, 'missing YAML frontmatter (--- … ---) at the top');
    return { data: {}, body: text };
  }
  const data = {};
  for (const line of m[1].split('\n')) {
    const kv = /^([A-Za-z0-9_]+):\s*(.*)$/.exec(line.trim());
    if (kv) data[kv[1]] = kv[2].trim();
  }
  return { data, body: text.slice(m[0].length) };
}

function splitSections(body) {
  const lines = body.split('\n');
  const heads = [];
  lines.forEach((line, i) => {
    const m = /^##\s+(?:(\d+)\.\s*)?(.+?)\s*$/.exec(line);
    if (m) heads.push({ num: m[1] ? Number(m[1]) : null, title: m[2], i });
  });
  const map = new Map();
  heads.forEach((h, k) => {
    const end = k + 1 < heads.length ? heads[k + 1].i : lines.length;
    map.set(h.num ?? h.title, { title: h.title, text: lines.slice(h.i + 1, end).join('\n') });
  });
  return map;
}

function cells(line) {
  const parts = line.trim().split('|');
  if (parts[0] === '') parts.shift();
  if (parts[parts.length - 1] === '') parts.pop();
  return parts.map((s) => s.trim());
}

const isSeparator = (cs) => cs.length > 0 && cs.every((c) => /^:?-{2,}:?$/.test(c));

// All data rows of all tables in a section, header and separators removed.
function rows(sectionText) {
  const out = [];
  for (const line of sectionText.split('\n')) {
    if (!line.trim().startsWith('|')) continue;
    const cs = cells(line);
    if (cs.length === 0 || isSeparator(cs)) continue;
    out.push(cs);
  }
  return out;
}

function idRows(sectionText, re) {
  return rows(sectionText).filter((cs) => re.test(cs[0]));
}

function blocks(text, kind) {
  const re = new RegExp(`^##\\s+(${kind}-\\d{2})\\b.*$`, 'gm');
  const marks = [];
  let m;
  while ((m = re.exec(text))) marks.push({ id: m[1], start: m.index, headEnd: m.index + m[0].length });
  return marks.map((mk, i) => ({
    id: mk.id,
    text: text.slice(mk.headEnd, i + 1 < marks.length ? marks[i + 1].start : text.length),
  }));
}

const has = (text, needle) => text.toLowerCase().includes(needle.toLowerCase());
const num = (v) => (v === undefined || v === '' ? NaN : Number(v));

// ---------------------------------------------------------------- load

if (!existsSync(dir) || !statSync(dir).isDirectory()) {
  console.error(`check-spec: no such directory: ${dir}`);
  process.exit(2);
}

const raw = {};
for (const [key, name] of Object.entries(FILE)) {
  raw[key] = readIfPresent(name);
  if (raw[key] === null) fail(name, 'file is missing');
}

if (raw.intake === null || raw.spec === null) {
  for (const e of errors) console.error(`FAIL ${e.file}: ${e.msg}`);
  console.error('check-spec: cannot continue without intake.de.md and spec.md');
  process.exit(2);
}

// ---------------------------------------------------------------- intake

const intakeLines = raw.intake.split('\n');
if (intakeLines[intakeLines.length - 1] === '') intakeLines.pop();
intakeLines.forEach((line, i) => {
  if (!line.trim()) fail(FILE.intake, `line ${i + 1} is blank — one statement per line, no blank lines`);
  if (/^\s*[#>\-*]\s/.test(line)) fail(FILE.intake, `line ${i + 1} looks like markdown, not a kid statement`);
});
if (intakeLines.length < 3) fail(FILE.intake, `only ${intakeLines.length} statement(s); expected at least 3`);

const intakeAt = (n) => (n >= 1 && n <= intakeLines.length ? intakeLines[n - 1] : null);

// ---------------------------------------------------------------- spec.md

const { data: fm, body } = parseFrontmatter(raw.spec, FILE.spec);
const status = (fm.status || '').toLowerCase();
const strict = status !== 'draft';

for (const key of ['spec', 'spec_version', 'status', 'game', 'ui_language', 'target_skill', 'intake']) {
  if (!fm[key]) fail(FILE.spec, `frontmatter is missing "${key}"`);
}
if (fm.spec && fm.spec !== 'game-requirement') fail(FILE.spec, `frontmatter spec must be "game-requirement", got "${fm.spec}"`);
if (fm.target_skill && fm.target_skill !== 'webgame-development') {
  fail(FILE.spec, `target_skill must be "webgame-development", got "${fm.target_skill}"`);
}
if (status && !STATUSES.includes(status)) fail(FILE.spec, `status must be one of ${STATUSES.join(', ')}`);
if (fm.spec_version && !/^\d+\.\d+\.\d+$/.test(fm.spec_version)) fail(FILE.spec, 'spec_version must look like 0.1.0');
if (fm.intake && fm.intake !== FILE.intake) warn(FILE.spec, `intake points at "${fm.intake}", expected "${FILE.intake}"`);

const sections = splitSections(body);
for (const [n, keyword] of EN_SECTIONS) {
  const s = sections.get(n);
  if (!s) fail(FILE.spec, `missing section "## ${n}. …"`);
  else if (!has(s.title, keyword)) fail(FILE.spec, `section ${n} should mention "${keyword}", got "${s.title}"`);
}

// --- handoff JSON
const handoffText = sections.get(2)?.text ?? '';
const jsonBlock = /```json\n([\s\S]*?)```/.exec(handoffText);
let handoff = null;
if (!jsonBlock) {
  fail(FILE.spec, 'section 2 has no ```json handoff block');
} else {
  try {
    handoff = JSON.parse(jsonBlock[1]);
  } catch (e) {
    fail(FILE.spec, `handoff JSON does not parse: ${e.message}`);
  }
}

if (handoff) {
  const req = (cond, msg) => { if (!cond) fail(FILE.spec, `handoff: ${msg}`); };
  req(typeof handoff.name === 'string' && handoff.name.trim(), 'name must be a non-empty string');
  req(typeof handoff.genre === 'string' && handoff.genre.trim(), 'genre must be a non-empty string');
  req(VIEWPOINTS.includes(handoff.viewpoint), `viewpoint must be one of ${VIEWPOINTS.join(', ')}`);
  req(typeof handoff.world === 'string' && handoff.world.trim(), 'world must be a non-empty string');
  req(/^\d{3,4}x\d{3,4}$/.test(handoff.resolution || ''), 'resolution must look like 960x600');
  req([30, 60].includes(handoff.framerate), 'framerate must be 30 or 60');
  req(Array.isArray(handoff.input) && handoff.input.length > 0 && handoff.input.every((i) => INPUTS.includes(i)),
    `input must be a non-empty array of ${INPUTS.join(', ')}`);
  req(Number.isInteger(handoff.session_minutes) && handoff.session_minutes >= 1 && handoff.session_minutes <= 30,
    'session_minutes must be an integer 1–30');
  req(Number.isInteger(handoff.players) && handoff.players >= 1 && handoff.players <= 4, 'players must be 1–4');
  req(LANGS.includes(handoff.ui_language), `ui_language must be one of ${LANGS.join(', ')}`);
  req(SAVES.includes(handoff.save), `save must be one of ${SAVES.join(', ')}`);
  req(AUDIO.includes(handoff.audio), `audio must be one of ${AUDIO.join(', ')}`);
  req(Number.isInteger(handoff.levels) && handoff.levels >= 1, 'levels must be an integer >= 1');
  req(Number.isInteger(handoff.seed), 'seed must be an integer');
  req(Array.isArray(handoff.out_of_scope) && handoff.out_of_scope.length > 0,
    'out_of_scope must be a non-empty array');
  if (handoff.resolution && handoff.resolution !== '960x600' && !handoff.resolution_reason) {
    fail(FILE.spec, 'handoff: non-default resolution needs "resolution_reason"');
  }
  if (handoff.ui_language && handoff.ui_language !== 'de' && !handoff.ui_language_reason) {
    fail(FILE.spec, 'handoff: ui_language other than "de" needs "ui_language_reason"');
  }
}

// --- requirements
const reqRows = idRows(sections.get(5)?.text ?? '', /^[FCNS]-\d{3}$/);
const requirements = new Map();
if (reqRows.length === 0) fail(FILE.spec, 'section 5 has no requirement rows (F-001, C-001, N-001, S-001)');
for (const cs of reqRows) {
  const [id, text, prio, conf, trace] = cs;
  if (cs.length !== 5) {
    fail(FILE.spec, `${id}: requirement row must have 5 cells (ID | Requirement | Prio | Conf | Trace)`);
    continue;
  }
  if (requirements.has(id)) fail(FILE.spec, `${id}: duplicate requirement ID`);
  if (!['P0', 'P1', 'P2'].includes(prio)) fail(FILE.spec, `${id}: Prio must be P0, P1 or P2`);
  if (!['EXPLICIT', 'DEFAULT', 'DERIVED'].includes(conf)) fail(FILE.spec, `${id}: Conf must be EXPLICIT, DEFAULT or DERIVED`);
  if (!text) fail(FILE.spec, `${id}: empty requirement text`);
  const zRefs = [...(trace || '').matchAll(/Z\.(\d+)/g)].map((m) => Number(m[1]));
  const adRefs = [...(trace || '').matchAll(/AD-(\d{2})/g)].map((m) => `AD-${m[1]}`);
  const idRefs = [...(trace || '').matchAll(/[FCNS]-\d{3}/g)].map((m) => m[0]);
  if (conf === 'EXPLICIT') {
    if (zRefs.length === 0) fail(FILE.spec, `${id}: EXPLICIT needs a Z.n trace`);
    for (const n of zRefs) {
      if (!intakeAt(n)) fail(FILE.spec, `${id}: trace Z.${n} is outside the intake (${intakeLines.length} lines)`);
    }
  } else if (conf === 'DEFAULT') {
    if (adRefs.length === 0) fail(FILE.spec, `${id}: DEFAULT needs an AD-xx trace`);
  } else if (conf === 'DERIVED') {
    if (zRefs.length === 0 && idRefs.length === 0) fail(FILE.spec, `${id}: DERIVED needs a Z.n or another requirement ID`);
  }
  requirements.set(id, { text, prio, conf, trace, zRefs, adRefs });
}

// --- acceptance criteria
const acRows = idRows(sections.get(6)?.text ?? '', /^AC-\d{3}$/);
const acs = new Map();
if (acRows.length === 0) fail(FILE.spec, 'section 6 has no acceptance criteria');
for (const cs of acRows) {
  const [id, covers, given, when, then, test] = cs;
  if (cs.length !== 6) {
    fail(FILE.spec, `${id}: AC row must have 6 cells (AC | Covers | Given | When | Then | Test)`);
    continue;
  }
  if (acs.has(id)) fail(FILE.spec, `${id}: duplicate AC ID`);
  const coverIds = (covers || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (coverIds.length === 0) fail(FILE.spec, `${id}: Covers is empty`);
  for (const c of coverIds) {
    if (!requirements.has(c)) fail(FILE.spec, `${id}: covers ${c}, which does not exist in section 5`);
  }
  if (!TESTS.includes(test)) fail(FILE.spec, `${id}: Test must be one of ${TESTS.join(', ')}`);
  if (['unit', 'e2e', 'bot'].includes(test)) {
    const setup = `${given || ''} ${when || ''}`;
    const bridge = /step\(|\?seed=|autoplay\(|setInput\(|restart\(|start\(/.test(setup);
    const uiAction = /click|tap|press|type|goto|reload|focus|keyboard|mouse/i.test(when || '');
    if (!bridge && !(test === 'e2e' && uiAction)) {
      fail(FILE.spec, `${id}: "${test}" ACs need a bridge call in Given/When (step(), ?seed=, autoplay(), setInput(), start())`);
    }
  }
  if (!given || !when || !then) fail(FILE.spec, `${id}: Given, When and Then must all be filled`);
  acs.set(id, { covers: coverIds, test });
}

// --- assumptions
const adRows = idRows(sections.get(8)?.text ?? '', /^AD-\d{2}$/);
const defaults = new Set();
for (const cs of adRows) {
  const [id, what, why, ifWrong] = cs;
  if (cs.length !== 4) fail(FILE.spec, `${id}: assumption row must have 4 cells`);
  if (defaults.has(id)) fail(FILE.spec, `${id}: duplicate assumption ID`);
  if (!what || !why || !ifWrong) fail(FILE.spec, `${id}: fill Assumption, Why we assumed it and If wrong`);
  defaults.add(id);
}
for (const [id, r] of requirements) {
  for (const ad of r.adRefs) {
    if (!defaults.has(ad)) fail(FILE.spec, `${id}: trace ${ad} does not exist in section 8`);
  }
}

// --- risks
const riskRows = idRows(sections.get(10)?.text ?? '', /^RISK-\d{2}$/);
const risks = new Set();
for (const cs of riskRows) {
  if (risks.has(cs[0])) fail(FILE.spec, `${cs[0]}: duplicate risk ID`);
  risks.add(cs[0]);
}

// --- traceability
const traceRows = idRows(sections.get(9)?.text ?? '', /^Z\.\d+$/);
const traced = new Map();
for (const cs of traceRows) {
  const n = Number(cs[0].slice(2));
  const target = (cs[1] || '').trim();
  if (!intakeAt(n)) {
    fail(FILE.spec, `Z.${n}: outside the intake (${intakeLines.length} lines)`);
    continue;
  }
  const ok = target === '—' || target === '-' || /^(?:[FCNS]-\d{3}|AD-\d{2}|RISK-\d{2})$/.test(target);
  if (!ok) fail(FILE.spec, `Z.${n}: "Becomes" must be a requirement ID, AD-xx, RISK-xx or —, got "${target}"`);
  else if (/^[FCNS]-\d{3}$/.test(target) && !requirements.has(target)) fail(FILE.spec, `Z.${n}: refers to ${target}, which does not exist`);
  else if (/^AD-\d{2}$/.test(target) && !defaults.has(target)) fail(FILE.spec, `Z.${n}: refers to ${target}, which does not exist`);
  else if (/^RISK-\d{2}$/.test(target) && !risks.has(target)) fail(FILE.spec, `Z.${n}: refers to ${target}, which does not exist`);
  if (!(cs[2] || '').trim()) fail(FILE.spec, `Z.${n}: add a short note in the third column`);
  traced.set(n, target);
}
if (traceRows.length === 0) fail(FILE.spec, 'section 9 has no traceability rows');
for (const [id, r] of requirements) {
  for (const n of r.zRefs) {
    if (!traced.has(n)) fail(FILE.spec, `${id}: traces Z.${n}, which has no row in section 9`);
  }
}

// --- open questions in spec.md
const oqText = sections.get(11)?.text ?? '';
const specOq = new Map();
for (const m of oqText.matchAll(/^-\s+(OQ-\d{2})\s+\((BLOCKER|NOT-BLOCKER)\)\s+[—–-]\s+(.+)$/gm)) {
  if (specOq.has(m[1])) fail(FILE.spec, `${m[1]}: duplicate open question`);
  specOq.set(m[1], { blocker: m[2] === 'BLOCKER', text: m[3] });
}
if (specOq.size > 5) fail(FILE.spec, `${specOq.size} open questions; keep it to 5 or fewer`);

// --- changelog
const logRows = rows(sections.get(12)?.text ?? '').filter((cs) => /^\d+\.\d+\.\d+$/.test(cs[0]));
if (logRows.length === 0) fail(FILE.spec, 'section 12 has no changelog row (| Version | Date | Change |)');

// ---------------------------------------------------------------- gates

if (strict) {
  const todo = /TBD|TODO|FIXME|\?\?\?/.exec(raw.spec);
  if (todo) fail(FILE.spec, `"${todo[0]}" left in the spec — status ${status} does not allow placeholders`);

  for (const [id, r] of requirements) {
    const covered = [...acs.values()].some((a) => a.covers.includes(id));
    if (!covered && r.prio === 'P0') fail(FILE.spec, `${id}: P0 requirement without an acceptance criterion`);
    if (!covered && r.prio === 'P1') warn(FILE.spec, `${id}: P1 requirement without an AC — demote to P2 or test it`);
  }

  for (const [id, oq] of specOq) {
    if (oq.blocker) fail(FILE.spec, `${id} is still a BLOCKER; answer it and turn it into a requirement or a default`);
  }

  if (!logRows.some((cs) => cs[0] === fm.spec_version)) {
    fail(FILE.spec, `changelog does not mention spec_version ${fm.spec_version}`);
  }
}

if (status === 'confirmed') {
  if (!fm.confirmed_by) fail(FILE.spec, 'status confirmed needs confirmed_by');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fm.confirmed_on || '')) fail(FILE.spec, 'status confirmed needs confirmed_on as YYYY-MM-DD');
}

// ---------------------------------------------------------------- spec.de.md

let deSpec = raw.de;
if (deSpec === null) {
  // already reported missing
} else {
  const de = parseFrontmatter(deSpec, FILE.de);
  if (de.data.spec_version && fm.spec_version && de.data.spec_version !== fm.spec_version) {
    fail(FILE.de, `spec_version "${de.data.spec_version}" differs from spec.md "${fm.spec_version}"`);
  }
  const deBody = de.body;
  const deTitles = deBody.split('\n').filter((l) => /^##\s+/.test(l)).join('\n');
  for (const [keyword, what] of DE_SECTIONS) {
    if (!has(deTitles, keyword)) fail(FILE.de, `missing section for ${what} (expected a heading containing "${keyword}")`);
  }
  if (!/^\s*-\s*\[[ xX]\]/m.test(deBody)) fail(FILE.de, 'no checkbox under "Bitte bestätigen"');

  const deReqRows = new Map();
  for (const cs of rows(deBody).filter((c) => /^[FCNS]-\d{3}$/.test(c[0]))) {
    if (deReqRows.has(cs[0])) fail(FILE.de, `${cs[0]}: duplicate row`);
    deReqRows.set(cs[0], cs);
  }
  for (const [id, r] of requirements) {
    const cs = deReqRows.get(id);
    if (!cs) {
      fail(FILE.de, `${id} is missing from the German requirements table`);
      continue;
    }
    const deWord = (cs[2] || '').trim();
    const expected = PRIO_DE[r.prio];
    if (!deWord.startsWith(expected)) {
      fail(FILE.de, `${id}: "Wichtig?" must start with "${expected}" (English ${r.prio}), got "${deWord}"`);
    }
  }
  for (const id of deReqRows.keys()) {
    if (!requirements.has(id)) fail(FILE.de, `${id} exists only in the German spec — the kids would confirm something the dev never gets`);
  }
  for (const [id] of acs) if (!new RegExp(`\\b${id}\\b`).test(deBody)) fail(FILE.de, `${id} is not mentioned`);
  for (const id of defaults) if (!new RegExp(`\\b${id}\\b`).test(deBody)) fail(FILE.de, `${id} is not mentioned`);

  if (status === 'confirmed' && !/^\s*-\s*\[[xX]\]/m.test(deBody)) {
    fail(FILE.de, 'status confirmed needs at least one ticked checkbox');
  }

  for (const line of deBody.split('\n')) {
    if (line.length > 140) warn(FILE.de, `line longer than 140 characters: "${line.slice(0, 60)}…"`);
    if (/\bP[012]\b/.test(line)) warn(FILE.de, 'priority code leaked into the German text; write Muss / Sollte / Kann später');
  }
  checkJargon(FILE.de, deBody);
}

// ---------------------------------------------------------------- open-questions.de.md

let questions = raw.questions;
if (questions === null) {
  // already reported missing
} else {
  const oqBlocks = blocks(questions, 'OQ');
  const gapBlocks = blocks(questions, 'GAP');
  const ideaBlocks = blocks(questions, 'IDEA');

  if (oqBlocks.length + gapBlocks.length + ideaBlocks.length === 0) {
    fail(FILE.questions, 'no OQ-xx, GAP-xx or IDEA-xx block at all');
  }
  if (oqBlocks.length + gapBlocks.length + ideaBlocks.length > 20) {
    warn(FILE.questions, 'more than 20 blocks; kids will not read this');
  }
  if (gapBlocks.length === 0) warn(FILE.questions, 'no GAP-xx block — nothing the kids forgot?');

  const seen = new Set();
  const germanOq = new Map();

  for (const b of oqBlocks) {
    if (seen.has(b.id)) fail(FILE.questions, `${b.id}: duplicate ID`);
    seen.add(b.id);
    const wichtig = /\*\*Wichtig:\*\*\s*(ja|nein)\b/i.exec(b.text);
    if (!wichtig) fail(FILE.questions, `${b.id}: needs "**Wichtig:** ja" or "**Wichtig:** nein"`);
    if (!/^-\s+[A-Z]\)/m.test(b.text)) fail(FILE.questions, `${b.id}: add lettered options (- A) …)`);
    if ((b.text.match(/^-\s+[A-Z]\)/gm) || []).length < 2) fail(FILE.questions, `${b.id}: give at least two options`);
    if (!has(b.text, '**Unsere Empfehlung:**')) fail(FILE.questions, `${b.id}: add "**Unsere Empfehlung:**"`);
    const answer = /\*\*Eure Antwort:\*\*\s*(.*)$/m.exec(b.text);
    if (!answer) fail(FILE.questions, `${b.id}: add "**Eure Antwort:** ____"`);
    const blank = !answer || /^[_\s.…?]*$/.test(answer[1]);
    if (!has(b.text, '**Warum wir fragen:**')) fail(FILE.questions, `${b.id}: add "**Warum wir fragen:**"`);
    germanOq.set(b.id, { wichtig: wichtig ? wichtig[1].toLowerCase() : 'nein', blank });
  }

  for (const b of gapBlocks) {
    if (seen.has(b.id)) fail(FILE.questions, `${b.id}: duplicate ID`);
    seen.add(b.id);
    if (!has(b.text, '**Warum wichtig:**')) fail(FILE.questions, `${b.id}: add "**Warum wichtig:**"`);
    if (!has(b.text, '**Was wir vorschlagen:**')) fail(FILE.questions, `${b.id}: add "**Was wir vorschlagen:**"`);
    if (!has(b.text, '**Eure Antwort:**')) fail(FILE.questions, `${b.id}: add "**Eure Antwort:**"`);
  }

  for (const b of ideaBlocks) {
    if (seen.has(b.id)) fail(FILE.questions, `${b.id}: duplicate ID`);
    seen.add(b.id);
    if (!has(b.text, '**Idee:**')) fail(FILE.questions, `${b.id}: add "**Idee:**"`);
    if (!/\*\*Aufwand:\*\*\s*(klein|mittel|groß)/i.test(b.text)) {
      fail(FILE.questions, `${b.id}: add "**Aufwand:** klein|mittel|groß"`);
    }
    if (!has(b.text, '**Warum es Spaß macht:**')) fail(FILE.questions, `${b.id}: add "**Warum es Spaß macht:**"`);
    if (!has(b.text, '**Eure Antwort:**')) fail(FILE.questions, `${b.id}: add "**Eure Antwort:**"`);
  }

  // cross-file: same OQ set, same blocker flag
  for (const id of germanOq.keys()) {
    if (!specOq.has(id)) fail(FILE.questions, `${id} is asked in German but missing from spec.md section 11`);
  }
  for (const [id, oq] of specOq) {
    if (!germanOq.has(id)) {
      fail(FILE.spec, `${id} is listed in section 11 but has no German question block`);
      continue;
    }
    const german = germanOq.get(id);
    const germanBlocks = german.wichtig === 'ja';
    if (germanBlocks !== oq.blocker) {
      fail(FILE.questions, `${id}: "Wichtig" says ${german.wichtig} but spec.md says ${oq.blocker ? 'BLOCKER' : 'NOT-BLOCKER'}`);
    }
  }

  checkJargon(FILE.questions, questions);
}

function checkJargon(file, text) {
  const lower = text.toLowerCase();
  const found = JARGON.filter((w) => new RegExp(`\\b${w}\\b`).test(lower));
  if (found.length) warn(file, `engineering words in a kids' text: ${found.join(', ')}`);
}

// ---------------------------------------------------------------- report

function blockerCount() {
  const specOq = (raw.spec || '').match(/^-\s+OQ-\d{2}\s+\(BLOCKER\)/gm) || [];
  return specOq.length;
}

function counts() {
  const byPrio = { P0: 0, P1: 0, P2: 0 };
  const byConf = { EXPLICIT: 0, DEFAULT: 0, DERIVED: 0 };
  for (const r of requirements.values()) {
    byPrio[r.prio] = (byPrio[r.prio] || 0) + 1;
    byConf[r.conf] = (byConf[r.conf] || 0) + 1;
  }
  const germanText = raw.questions || '';
  return {
    requirements: requirements.size,
    priority: byPrio,
    confidence: byConf,
    acceptance_criteria: acs.size,
    assumptions: defaults.size,
    risks: risks.size,
    trace_links: traced.size,
    intake_lines: intakeLines.length,
    open_questions: (raw.spec || '').match(/^-\s+OQ-\d{2}/gm)?.length ?? 0,
    blockers: blockerCount(),
    gaps: (germanText.match(/^##\s+GAP-\d{2}/gm) || []).length,
    ideas: (germanText.match(/^##\s+IDEA-\d{2}/gm) || []).length,
  };
}

function report() {
  const c = counts();
  const ok = errors.length === 0;
  if (asJson) {
    console.log(JSON.stringify({
      ok,
      dir,
      status: (fm?.status || '').toLowerCase() || null,
      spec_version: fm?.spec_version || null,
      counts: c,
      errors,
      warnings,
    }, null, 2));
    return;
  }
  if (!quiet) {
    console.log(`game-requirement check — ${dir}`);
    if (fm?.status) console.log(`status: ${status} · spec_version ${fm.spec_version || '?'} · game: ${fm.game || '?'}`);
    console.log(`intake ${c.intake_lines} lines · requirements ${c.requirements} `
      + `(${Object.entries(c.priority).filter(([, v]) => v).map(([k, v]) => `${k} ${v}`).join(', ') || 'none'})`);
    console.log(`ACs ${c.acceptance_criteria} · defaults ${c.assumptions} · risks ${c.risks} · traces ${c.trace_links}`);
    console.log(`open questions ${c.open_questions} (blockers ${c.blockers}) · gaps ${c.gaps} · ideas ${c.ideas}`);
  }
  for (const e of errors) console.log(`FAIL ${e.file}: ${e.msg}`);
  if (!quiet && warnings.length) {
    for (const w of warnings) console.log(`warn ${w.file}: ${w.msg}`);
  }
  console.log(ok ? 'PASS' : `FAIL — ${errors.length} error(s), ${warnings.length} warning(s)`);
}

report();
process.exit(errors.length === 0 ? 0 : 1);
