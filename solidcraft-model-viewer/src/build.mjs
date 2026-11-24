// Build ../assets/solidcraft-viewer.html: bundle viewer.js + three.js (esbuild, minified IIFE)
// and inline it into template.html so the result is one offline, CDN-free HTML file.
import { build } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(resolve(here, 'package.json'), 'utf8'));
const threeVersion = JSON.parse(readFileSync(resolve(here, 'node_modules/three/package.json'), 'utf8')).version;
const threeRev = threeVersion.split('.')[1];

const result = await build({
  entryPoints: [resolve(here, 'viewer.js')],
  bundle: true,
  minify: true,
  format: 'iife',
  target: ['es2020', 'chrome100', 'safari15', 'firefox100'],
  write: false,
  legalComments: 'none',
  define: { __VIEWER_VERSION__: JSON.stringify(pkg.version) },
  banner: {
    js: `/* solidcraft-model-viewer ${pkg.version} | three.js r${threeRev} (MIT, Copyright 2010-2025 three.js authors, https://threejs.org/) */`,
  },
});

// Keep the bundle from terminating the inline <script> element early.
let js = result.outputFiles[0].text.replace(/<\/script/gi, '<\\/script').replace(/<!--/g, '<\\!--');

// The skills repo's privacy scanner (scripts/check_privacy.py, COORDS_RE) reads three.js' colour matrices,
// i.e. pairs of 7-15 digit decimals in GLSL vec3(...) rows or JS Matrix3.set(...) calls, as GPS
// coordinates. Tag exactly those spots with the scanner's documented `privacy-allow:` pragma:
//  - plain shader lines (no quotes/backticks, no `\` continuation) get a trailing line comment, inert in
//    GLSL and JS;
//  - inside a long minified JS line the constant pair is moved onto its own short line (line breaks after
//    `(` or `,` inside an argument list cannot change semantics) with a block-comment pragma, so the pragma
//    never silences the rest of the bundle.
// Anything else stops the build for a human to inspect.
const COORDS_RE = /(?<!\d)-?\d{1,2}\.\d{4,}\s*°?\s*[NSns]?\s*[,;/]\s*-?\d{1,3}\.\d{4,}\s*°?\s*[EWew]?/g;
const PRAGMA = 'privacy-allow: three.js colour constant, not a location';
let tagged = 0;
js = js.split('\n').map((line) => {
  COORDS_RE.lastIndex = 0;
  if (!COORDS_RE.test(line)) return line;
  if (line.length <= 400 && !/["'`]/.test(line) && !/\\\s*$/.test(line)) {
    tagged += 1;
    return `${line} // ${PRAGMA}`;
  }
  return line.replace(COORDS_RE, (m, offset) => {
    const before = line[offset - 1];
    const after = line[offset + m.length];
    if (!['(', ','].includes(before) || ![',', ')'].includes(after)) {
      throw new Error(`coordinate-like constant in an unexpected place, inspect manually:\n${line.slice(Math.max(0, offset - 120), offset + 80)}`);
    }
    tagged += 1;
    return `\n${m}/* ${PRAGMA} */\n`;
  });
}).join('\n');

const template = readFileSync(resolve(here, 'template.html'), 'utf8');
if (!template.includes('/*__VIEWER_BUNDLE__*/')) throw new Error('template.html lost its /*__VIEWER_BUNDLE__*/ marker');
const html = template
  .replace('/*__VIEWER_BUNDLE__*/', () => js)
  .replaceAll('__VIEWER_VERSION__', pkg.version)
  .replaceAll('__THREE_VERSION__', threeRev);

const out = resolve(here, '../assets/solidcraft-viewer.html');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, html);
console.log(`wrote ${out} (${(html.length / 1024).toFixed(0)} KiB, three r${threeRev}, viewer ${pkg.version}, ${tagged} shader lines privacy-tagged)`);
