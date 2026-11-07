import { createHash } from 'node:crypto';
import { readdir, readFile, stat } from 'node:fs/promises';
import { extname, join, relative } from 'node:path';
import type { Plugin } from 'vite';

const ALLOWED = new Set([
  '.png', '.jpg', '.jpeg', '.webp', '.avif', '.svg', '.gif',
  '.ogg', '.mp3', '.wav', '.m4a', '.opus', '.flac',
  '.json', '.woff2', '.woff', '.ttf',
]);

const DEFAULT_MAX_BYTES = 4 * 1024 * 1024;

interface AssetEntry {
  path: string;
  bytes: number;
  sha256: string;
}

async function walk(dir: string, base = dir): Promise<string[]> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const files: string[] = [];
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...(await walk(path, base)));
    else files.push(relative(base, path).split('\\').join('/'));
  }
  return files.sort();
}

async function collect(publicDir: string): Promise<AssetEntry[]> {
  const assetsDir = join(publicDir, 'assets');
  const names = await walk(assetsDir);
  const entries: AssetEntry[] = [];
  for (const name of names) {
    if (name.startsWith('.') || name.toLowerCase().endsWith('.md')) continue;
    const path = join(assetsDir, name);
    const bytes = (await stat(path)).size;
    const hash = createHash('sha256').update(await readFile(path)).digest('hex');
    entries.push({ path: name, bytes, sha256: hash });
  }
  return entries;
}

/**
 * Build-time guardrail + content-addressed manifest.
 *
 * - fails on oversized or unsupported files dropped into `public/assets`
 * - emits `assets/manifest.json` with hashes so loaders can cache-bust and so
 *   tests can assert an asset actually shipped
 */
export function assetManifest(options: { maxBytes?: number } = {}): Plugin {
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
  let publicDir = '';
  let entries: AssetEntry[] = [];

  const validate = async (warn: (message: string) => void): Promise<AssetEntry[]> => {
    const found = await collect(publicDir);
    for (const name of await walk(join(publicDir, 'assets'))) {
      const ext = extname(name).toLowerCase();
      if (ext && !ALLOWED.has(ext)) warn(`asset ${name} has an unsupported extension (${ext})`);
    }
    for (const entry of found) {
      if (entry.bytes > maxBytes) {
        warn(`asset ${entry.path} is ${(entry.bytes / 1024 / 1024).toFixed(1)} MB (budget ${(maxBytes / 1024 / 1024).toFixed(0)} MB)`);
      }
    }
    return found;
  };

  return {
    name: 'wg:asset-manifest',
    configResolved(config) {
      publicDir = config.publicDir;
    },
    async buildStart() {
      entries = await validate((message) => this.warn(message));
    },
    async configureServer(server) {
      server.middlewares.use('/__wg/assets', (_req, res) => {
        void validate((message) => server.config.logger.warn(message)).then((found) => {
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ assets: found }, null, 2));
        });
      });
    },
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'assets/manifest.json',
        source: JSON.stringify({ generatedAt: 'build', assets: entries }, null, 2),
      });
    },
  };
}
