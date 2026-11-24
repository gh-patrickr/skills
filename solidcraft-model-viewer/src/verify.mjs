// End-to-end check of the built viewer in a real browser (Chrome / Chromium via playwright-core).
//
//   node verify.mjs [model.glb] [--shots DIR]
//
// Covers: embedded model from file://, linked model over http, a strict Antigravity-like CSP
// (no network, inline only), framed (iframe) sizing, the empty template, mouse orbit / zoom,
// standard views, toggles, section plane, picking, keyboard shortcuts and console errors.
import { chromium } from 'playwright-core';
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import { tmpdir } from 'node:os';
import { basename, dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const skill = resolve(here, '..');
const args = process.argv.slice(2);
const shotsIdx = args.indexOf('--shots');
const shots = shotsIdx >= 0 ? resolve(args.splice(shotsIdx, 2)[1]) : null;
const model = resolve(args[0] || join(skill, 'examples/demo-bracket.glb'));
const template = join(skill, 'assets/solidcraft-viewer.html');
const python = process.env.PYTHON || 'python3';
if (shots) mkdirSync(shots, { recursive: true });

// ---------------------------------------------------------------- fixtures
const work = mkdtempSync(join(tmpdir(), 'sc-viewer-verify-'));
const pack = (...a) => execFileSync(python, [join(skill, 'scripts/sc_view.py'), ...a], { encoding: 'utf8' });
pack(model, '-o', join(work, 'embedded.html'), '--title', 'Verify model');
mkdirSync(join(work, 'models'));
copyFileSync(model, join(work, 'models', basename(model)));
pack(join(work, 'models', basename(model)), '-o', join(work, 'linked.html'), '--link');
const csp = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; connect-src 'none'">`;
writeFileSync(join(work, 'csp.html'), readFileSync(join(work, 'embedded.html'), 'utf8').replace('<meta charset="utf-8">', `<meta charset="utf-8">\n${csp}`));
writeFileSync(join(work, 'host.html'), `<!DOCTYPE html><html><body style="background:#1e1f22;margin:0;padding:16px;width:760px">
<iframe id="f" src="csp.html" style="width:100%;border:0" onload="
  const d = this.contentDocument.documentElement;
  d.style.setProperty('--foreground', '#e6e8eb'); d.style.setProperty('--card-border', '#3a3d42');
  this.style.height = d.scrollHeight + 'px';"></iframe></body></html>`);
copyFileSync(template, join(work, 'empty.html'));

const server = http.createServer((req, res) => {
  const p = join(work, decodeURIComponent(new URL(req.url, 'http://x').pathname));
  if (req.url === '/favicon.ico') { res.writeHead(204).end(); return; } // host page noise, not the viewer's
  if (!p.startsWith(work) || !existsSync(p)) { res.writeHead(404).end(); return; }
  const types = { '.html': 'text/html', '.glb': 'model/gltf-binary', '.stl': 'model/stl' };
  res.writeHead(200, { 'content-type': types[extname(p)] || 'application/octet-stream' }).end(readFileSync(p));
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;

// ---------------------------------------------------------------- browser
function chromePath() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  const mac = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  if (existsSync(mac)) return mac;
  return undefined; // playwright-core's own download (npx playwright-core install chromium)
}
const browser = await chromium.launch({
  executablePath: chromePath(),
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--allow-file-access-from-files'],
});
const ctx = await browser.newContext({ viewport: { width: 1100, height: 720 }, deviceScaleFactor: 1 });

let failures = 0;
function check(name, ok, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
  if (!ok) failures += 1;
}

async function open(url) {
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(url);
  return { page, errors };
}

const ready = (frame) => frame.evaluate(() => Promise.race([
  window.scViewer.ready,
  new Promise((_, rej) => setTimeout(() => rej(new Error('viewer not ready after 15 s')), 15000)),
]));
const info = (frame) => frame.evaluate(() => window.scViewer.info());
const camState = (frame) => frame.evaluate(() => {
  const { camera, controls } = window.scViewer;
  const off = camera.position.clone().sub(controls.target);
  return { x: off.x, y: off.y, z: off.z, d: off.length(), zoom: camera.zoom };
});
const coverage = (frame) => frame.evaluate(async () => {
  const v = window.scViewer;
  v.renderer.render(v.scene, v.camera);
  const img = new Image();
  img.src = v.renderer.domElement.toDataURL('image/png');
  await img.decode();
  const c = document.createElement('canvas');
  c.width = img.width; c.height = img.height;
  const g = c.getContext('2d');
  g.drawImage(img, 0, 0);
  const d = g.getImageData(0, 0, c.width, c.height).data;
  let n = 0;
  for (let i = 3; i < d.length; i += 4) if (d[i] > 8) n += 1;
  return n / (d.length / 4);
});
const settle = (page) => page.waitForTimeout(700);

// ---------------------------------------------------------------- 1. embedded, file://
{
  const { page, errors } = await open(pathToFileURL(join(work, 'embedded.html')).href);
  const loaded = await ready(page);
  check('embedded model loads from file://', loaded.loaded && loaded.meshes > 0, `${loaded.meshes} meshes, ${loaded.triangles} tris`);
  check('standalone page fills the window', await page.evaluate(() => document.getElementById('sc-root').clientHeight) === 720);
  check('title from --title', (await page.textContent('#sc-title')) === 'Verify model');
  console.log(`      parts=${JSON.stringify(loaded.parts)} sizeMm=${JSON.stringify(loaded.sizeMm)}`);
  if (shots) await page.screenshot({ path: join(shots, 'standalone-iso.png') });

  await page.evaluate(() => window.scViewer.toggle('ground', false));
  const cov = await coverage(page);
  check('model covers a sensible part of the canvas', cov > 0.05 && cov < 0.9, `${(cov * 100).toFixed(1)} %`);
  await page.evaluate(() => window.scViewer.toggle('ground', true));

  const box = await page.locator('canvas').boundingBox();
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  const before = await camState(page);
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx + 160, cy + 40, { steps: 10 });
  await page.mouse.up();
  await settle(page);
  const afterDrag = await camState(page);
  const ang = Math.acos(Math.min(1, (before.x * afterDrag.x + before.y * afterDrag.y + before.z * afterDrag.z) / (before.d * afterDrag.d)));
  check('left-drag orbits the camera', ang > 0.2 && Math.abs(afterDrag.d - before.d) / before.d < 0.05, `${(ang * 57.3).toFixed(0)} deg`);

  await page.mouse.move(cx, cy);
  for (let i = 0; i < 5; i += 1) await page.mouse.wheel(0, -200);
  await settle(page);
  const afterZoomIn = await camState(page);
  check('wheel zooms in', afterZoomIn.d < afterDrag.d * 0.9, `${afterDrag.d.toFixed(4)} -> ${afterZoomIn.d.toFixed(4)} m`);
  for (let i = 0; i < 10; i += 1) await page.mouse.wheel(0, 200);
  await settle(page);
  check('wheel zooms out', (await camState(page)).d > afterZoomIn.d * 1.1);

  for (const [view, axis] of [['top', 'y'], ['front', 'z'], ['right', 'x']]) {
    await page.click(`[data-view="${view}"]`);
    await settle(page);
    const s = await camState(page);
    check(`${view} view button aligns camera`, Math.abs(s[axis]) / s.d > 0.999, `${axis}=${(s[axis] / s.d).toFixed(4)}`);
  }
  await page.click('[data-view="iso"]');
  await settle(page);

  await page.click('[data-toggle="ortho"]');
  await settle(page);
  check('ortho toggle switches camera', (await info(page)).camera === 'orthographic');
  if (shots) await page.screenshot({ path: join(shots, 'standalone-ortho.png') });
  await page.click('[data-toggle="ortho"]');
  check('ortho toggle switches back', (await info(page)).camera === 'perspective');

  await page.keyboard.press('e');
  check('keyboard E toggles edges', (await info(page)).state.edges === false);
  await page.keyboard.press('e');
  await page.click('[data-toggle="wireframe"]');
  check('wireframe toggle', (await info(page)).state.wireframe === true);
  await page.click('[data-toggle="wireframe"]');

  await page.click('[data-act="section"]');
  await page.click('[data-axis="y"]');
  await page.locator('#sc-section-pos').fill('500');
  await settle(page);
  const sec = (await info(page)).state.section;
  check('section plane on CAD Y', sec && sec.axis === 'y', JSON.stringify(sec));
  if (shots) await page.screenshot({ path: join(shots, 'standalone-section.png') });
  await page.keyboard.press('Escape');
  check('Escape clears the section', (await info(page)).state.section === null);

  await page.evaluate(() => window.scViewer.setView('iso', false));
  await settle(page);
  // Click the centroid of the largest camera-facing triangle, so the test works for any model.
  const pt = await page.evaluate(() => {
    const { camera, scene, renderer } = window.scViewer;
    const V = () => camera.position.clone();
    let best = null;
    scene.getObjectByName('sc-model-root').traverse((o) => {
      if (!o.isMesh) return;
      const pos = o.geometry.attributes.position;
      const idx = o.geometry.index;
      const n = (idx ? idx.count : pos.count) / 3;
      for (let t = 0; t < n; t += 1) {
        const [a, b, c] = [0, 1, 2].map((k) => V().fromBufferAttribute(pos, idx ? idx.getX(3 * t + k) : 3 * t + k).applyMatrix4(o.matrixWorld));
        const cen = V().copy(a).add(b).add(c).multiplyScalar(1 / 3);
        const nrm = V().subVectors(b, a).cross(V().subVectors(c, a));
        const area = nrm.length();
        if (nrm.dot(V().sub(cen)) <= 0 || (best && area <= best.area)) continue;
        const ndc = cen.clone().project(camera);
        if (Math.abs(ndc.x) < 0.8 && Math.abs(ndc.y) < 0.8) best = { area, x: ndc.x, y: ndc.y };
      }
    });
    const r = renderer.domElement.getBoundingClientRect();
    return best && { x: r.left + ((best.x + 1) / 2) * r.width, y: r.top + ((1 - best.y) / 2) * r.height };
  });
  await page.mouse.click(pt.x, pt.y);
  await settle(page);
  const picked = (await info(page)).selection;
  check('click picks a part', !!picked, String(picked));
  if (loaded.parts.length > 1) {
    await page.click('[data-act="parts"]');
    check('parts panel lists parts', (await page.locator('#sc-parts-list label').count()) === loaded.parts.length);
    if (shots) await page.screenshot({ path: join(shots, 'standalone-parts.png') });
  }
  check('no console errors (embedded)', errors.length === 0, errors.join(' | '));
  await page.close();
}

// ---------------------------------------------------------------- 2. linked model over http
{
  const { page, errors } = await open(`${base}/linked.html`);
  const loaded = await ready(page);
  check('linked model loads over http', loaded.loaded);
  check('no console errors (linked)', errors.length === 0, errors.join(' | '));
  await page.close();
}
{
  const { page } = await open(`${base}/empty.html?model=models/${basename(model)}&view=front&edges=0`);
  const loaded = await ready(page);
  check('?model= URL parameter loads, overrides apply', loaded.loaded && loaded.state.edges === false);
  await page.close();
}

// ---------------------------------------------------------------- 3. strict CSP inside an iframe (Antigravity-like)
{
  const { page, errors } = await open(`${base}/host.html`);
  await page.waitForFunction(() => document.getElementById('f').contentWindow?.scViewer);
  const frame = page.frames().find((f) => f.url().endsWith('csp.html'));
  const loaded = await ready(frame);
  check('embedded model loads under strict CSP in an iframe', loaded.loaded);
  const h = await frame.evaluate(() => document.getElementById('sc-root').clientHeight);
  check('framed viewer uses the fixed embed height', h === 440, `${h}px`);
  await page.waitForTimeout(400);
  check('host theme variables switch the viewer to dark', await frame.evaluate(() => document.documentElement.classList.contains('sc-dark')));
  if (shots) await page.screenshot({ path: join(shots, 'iframe-embed.png'), fullPage: true });
  check('no console errors (CSP iframe)', errors.length === 0, errors.join(' | '));
  await page.close();
}

// ---------------------------------------------------------------- 4. empty template
{
  const { page, errors } = await open(pathToFileURL(join(work, 'empty.html')).href);
  await page.waitForTimeout(500);
  const text = await page.textContent('#sc-msg');
  check('empty template explains how to load a model', /No model loaded/.test(text));
  check('no console errors (empty)', errors.length === 0, errors.join(' | '));
  await page.close();
}

await browser.close();
server.close();
console.log(failures ? `\n${failures} check(s) FAILED` : '\nall viewer checks passed');
process.exit(failures ? 1 : 0);
