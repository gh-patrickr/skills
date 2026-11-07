import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { gzipSync } from 'node:zlib';

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
    else files.push(target);
  }
  return files;
}

/**
 * Gzip every shipped asset and aggregate JS/CSS/total transfer size.
 * Gzip is a decent proxy for brotli CDN bytes and needs no extra tooling.
 */
export async function measureBundle(dir) {
  const files = (await walk(dir)).filter((file) => /\.(js|css|html|svg|json|woff2?)$/.test(file));
  const rows = [];
  let js = 0;
  let css = 0;
  let total = 0;

  for (const file of files) {
    const source = await readFile(file);
    const gzipped = gzipSync(source, { level: 9 }).length;
    const relative = path.relative(dir, file).split(path.sep).join('/');
    rows.push({
      path: relative,
      bytes: (await stat(file)).size,
      gzipBytes: gzipped,
    });
    total += gzipped;
    if (file.endsWith('.js')) js += gzipped;
    if (file.endsWith('.css')) css += gzipped;
  }

  return {
    dir,
    files: rows.sort((a, b) => b.gzipBytes - a.gzipBytes),
    jsKb: js / 1024,
    cssKb: css / 1024,
    totalKb: total / 1024,
  };
}

export function checkBudgets(bundle, budgets) {
  const failures = [];
  if (bundle.jsKb > budgets.jsGzipKb) {
    failures.push(`JS ${bundle.jsKb.toFixed(1)} KB gz > budget ${budgets.jsGzipKb} KB`);
  }
  if (bundle.cssKb > budgets.cssGzipKb) {
    failures.push(`CSS ${bundle.cssKb.toFixed(1)} KB gz > budget ${budgets.cssGzipKb} KB`);
  }
  if (bundle.totalKb > budgets.totalGzipKb) {
    failures.push(`Total ${bundle.totalKb.toFixed(1)} KB gz > budget ${budgets.totalGzipKb} KB`);
  }
  return failures;
}
