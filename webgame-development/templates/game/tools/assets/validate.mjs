#!/usr/bin/env node
/**
 * Asset guardrail: format magic, dimensions, size budget, duplicate hashes and
 * a content-addressed manifest. No image libraries — just header parsing.
 */
import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const ASSETS = path.join(ROOT, 'public', 'assets');
const MAX_BYTES = 4 * 1024 * 1024;

const ALLOWED = new Set([
  '.png', '.jpg', '.jpeg', '.webp', '.avif', '.svg', '.gif',
  '.ogg', '.mp3', '.wav', '.m4a', '.opus', '.flac',
  '.json', '.woff2', '.woff', '.ttf',
]);

const MAGIC = {
  '.png': [[0x89, 0x50, 0x4e, 0x47]],
  '.jpg': [[0xff, 0xd8, 0xff]],
  '.jpeg': [[0xff, 0xd8, 0xff]],
  '.gif': [[0x47, 0x49, 0x46, 0x38]],
  '.webp': [[0x52, 0x49, 0x46, 0x46]],
  '.ogg': [[0x4f, 0x67, 0x67, 0x53]],
  '.wav': [[0x52, 0x49, 0x46, 0x46]],
  '.mp3': [[0x49, 0x44, 0x33], [0xff, 0xfb]],
  '.woff2': [[0x77, 0x4f, 0x46, 0x32]],
};

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
  return files.sort();
}

function magicOk(ext, buffer) {
  const patterns = MAGIC[ext];
  if (!patterns) return true;
  return patterns.some((pattern) => pattern.every((byte, index) => buffer[index] === byte));
}

function dimensions(ext, buffer) {
  try {
    if (ext === '.png') return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
    if (ext === '.gif') return { width: buffer.readUInt16LE(6), height: buffer.readUInt16LE(8) };
    if (ext === '.webp') {
      const format = buffer.toString('ascii', 12, 16);
      if (format === 'VP8X') {
        const width = 1 + (buffer[24] | (buffer[25] << 8) | (buffer[26] << 16));
        const height = 1 + (buffer[27] | (buffer[28] << 8) | (buffer[29] << 16));
        return { width, height };
      }
      if (format === 'VP8 ') {
        return { width: buffer.readUInt16LE(26) & 0x3fff, height: buffer.readUInt16LE(28) & 0x3fff };
      }
      return null;
    }
    if (ext === '.jpg' || ext === '.jpeg') {
      let offset = 2;
      while (offset + 9 < buffer.length) {
        if (buffer[offset] !== 0xff) {
          offset += 1;
          continue;
        }
        const marker = buffer[offset + 1];
        const length = buffer.readUInt16BE(offset + 2);
        if (marker >= 0xc0 && marker <= 0xc3) {
          return { height: buffer.readUInt16BE(offset + 5), width: buffer.readUInt16BE(offset + 7) };
        }
        offset += 2 + length;
      }
    }
  } catch {
    return null;
  }
  return null;
}

const files = await walk(ASSETS);
const issues = [];
const warnings = [];
const entries = [];
const hashes = new Map();

for (const file of files) {
  const relative = path.relative(ASSETS, file).split(path.sep).join('/');
  if (relative.startsWith('.') || relative.toLowerCase().endsWith('.md')) continue;

  const ext = path.extname(file).toLowerCase();
  const info = await stat(file);
  const buffer = await readFile(file);
  const sha256 = createHash('sha256').update(buffer).digest('hex');

  if (!ALLOWED.has(ext)) issues.push(`${relative}: unsupported extension ${ext || '(none)'}`);
  if (info.size > MAX_BYTES) issues.push(`${relative}: ${(info.size / 1024 / 1024).toFixed(1)} MB over the 4 MB budget`);
  if (!magicOk(ext, buffer)) issues.push(`${relative}: content does not match ${ext} magic bytes`);

  const size = dimensions(ext, buffer);
  if (size && (size.width <= 0 || size.height <= 0)) issues.push(`${relative}: unreadable dimensions`);
  if (size && size.width > 4096) warnings.push(`${relative}: ${size.width}px wide — downscale for memory`);
  if (hashes.has(sha256)) warnings.push(`${relative}: duplicate of ${hashes.get(sha256)}`);
  else hashes.set(sha256, relative);

  entries.push({
    path: relative,
    bytes: info.size,
    sha256,
    ...(size ? { width: size.width, height: size.height } : {}),
  });
}

const totalBytes = entries.reduce((sum, entry) => sum + entry.bytes, 0);
const report = { ok: issues.length === 0, assets: entries, issues, warnings, totalBytes };

const outDir = path.join(ROOT, 'artifacts', 'assets');
await mkdir(outDir, { recursive: true });
await writeFile(path.join(outDir, 'report.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');

if (entries.length === 0) {
  console.log('no files in public/assets — procedural assets only (nothing to validate)');
} else {
  console.log(`${entries.length} asset(s), ${(totalBytes / 1024).toFixed(0)} KB total`);
  for (const entry of entries) {
    const dimensionsText = entry.width ? ` ${entry.width}×${entry.height}` : '';
    console.log(`  ${entry.path.padEnd(36)} ${(entry.bytes / 1024).toFixed(0).padStart(5)} KB${dimensionsText}`);
  }
}

for (const warning of warnings) console.warn(`⚠ ${warning}`);
for (const issue of issues) console.error(`✖ ${issue}`);

console.log(issues.length === 0 ? `PASS — ${path.relative(ROOT, path.join(outDir, 'report.json'))}` : 'FAIL');
process.exitCode = issues.length === 0 ? 0 : 1;
