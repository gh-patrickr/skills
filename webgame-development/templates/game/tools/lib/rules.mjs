import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const CORE_RULES = [
  { id: 'core/no-random', pattern: /\bMath\.random\s*\(/, message: 'use the seeded RNG (src/game/rng.ts)' },
  { id: 'core/no-clock', pattern: /\b(Date\.now|performance\.now)\s*\(/, message: 'inject dt/tick instead of reading the clock' },
  { id: 'core/no-dom', pattern: /\b(window|document|localStorage|sessionStorage)\b/, message: 'core must stay DOM-free for Node playtests' },
];

const CORE_IMPORT = /from\s+['"]\.\.\/(render|ui|persist|main|input|audio|loop|bridge)/;

async function walk(dir) {
  const files = [];
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return files;
  }
  for (const entry of entries) {
    const target = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...(await walk(target)));
    else if (entry.name.endsWith('.ts')) files.push(target);
  }
  return files;
}

/**
 * Zero-dependency architecture linter.
 *
 * It encodes the rules that actually protect a game codebase over time:
 * determinism, layering, no stray `any`, no console noise in shipped code.
 * Swap in ESLint later without changing the contract (`node tools/wg.mjs lint`).
 */
export async function lintRules(root) {
  const issues = [];
  const files = await walk(path.join(root, 'src'));

  for (const file of files) {
    const relative = path.relative(root, file).split(path.sep).join('/');
    const source = await readFile(file, 'utf8');
    const lines = source.split('\n');
    const isCore = relative.startsWith('src/game/');

    for (const [index, line] of lines.entries()) {
      if (isCore) {
        for (const rule of CORE_RULES) {
          if (rule.pattern.test(line)) {
            issues.push({ file: relative, line: index + 1, rule: rule.id, message: rule.message });
          }
        }
        if (CORE_IMPORT.test(line)) {
          issues.push({
            file: relative,
            line: index + 1,
            rule: 'core/layering',
            message: 'core must not import adapters (render/ui/persist/input/audio/loop)',
          });
        }
      }

      if (/\bconsole\.(log|debug|info)\s*\(/.test(line)) {
        issues.push({ file: relative, line: index + 1, rule: 'no-console', message: 'remove console output from app code' });
      }
      if (/:\s*any\b|\bas\s+any\b/.test(line)) {
        issues.push({ file: relative, line: index + 1, rule: 'no-any', message: 'replace `any` with a precise type' });
      }
    }
  }

  return issues;
}

export function formatIssues(issues) {
  return issues.map((issue) => `${issue.file}:${issue.line}  ${issue.rule}  ${issue.message}`).join('\n');
}
