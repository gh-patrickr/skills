// SolidCraft model viewer: single-file, offline Three.js viewer for SolidCraft GLB / STL exports.
// Bundled by build.mjs into ../assets/solidcraft-viewer.html. Public API: window.scViewer.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

/* global __VIEWER_VERSION__ */
const VERSION = __VIEWER_VERSION__;
const $ = (id) => document.getElementById(id);
const root = $('sc-root');
const overlay = $('sc-overlay');
const msg = $('sc-msg');

// ---------------------------------------------------------------- config
const DEFAULTS = {
  model: '', title: '', view: 'iso', up: 'auto', edges: true, ground: true,
  autoRotate: false, background: 'auto', height: 440,
};

function readConfig() {
  let cfg = {};
  const el = $('sc-config');
  if (el) {
    try { cfg = JSON.parse(el.textContent || '{}'); } catch (err) { console.warn('[sc-viewer] bad sc-config JSON', err); }
  }
  cfg = { ...DEFAULTS, ...cfg };
  const p = new URLSearchParams(location.search);
  const asBool = (v) => !/^(0|false|no|off)$/i.test(v);
  for (const k of ['model', 'title', 'view', 'up', 'background']) if (p.has(k)) cfg[k] = p.get(k);
  for (const k of ['edges', 'ground', 'autoRotate']) {
    const v = p.get(k) ?? p.get(k.toLowerCase());
    if (v !== null) cfg[k] = asBool(v);
  }
  if (p.has('height')) cfg.height = Number(p.get('height')) || cfg.height;
  return cfg;
}

const cfg = readConfig();
let framed = true;
try { framed = window.self !== window.top; } catch { framed = true; }
if (!framed) document.documentElement.classList.add('sc-standalone');
root.style.setProperty('--sc-height', `${Number(cfg.height) || 440}px`);
if (cfg.background && !['auto', 'transparent'].includes(cfg.background)) {
  root.classList.add('sc-bg-solid');
  root.style.setProperty('--sc-bg', cfg.background);
}

function showMessage(html) { msg.innerHTML = html; overlay.hidden = false; }
function hideMessage() { overlay.hidden = true; }
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ---------------------------------------------------------------- theme
function cssLuminance(color) {
  const ctx = document.createElement('canvas').getContext('2d');
  ctx.fillStyle = '#010203';
  ctx.fillStyle = color;
  const v = ctx.fillStyle;
  if (v === '#010203' && color.trim().toLowerCase() !== '#010203') return null;
  let r; let g; let b;
  if (v.startsWith('#')) {
    r = parseInt(v.slice(1, 3), 16); g = parseInt(v.slice(3, 5), 16); b = parseInt(v.slice(5, 7), 16);
  } else {
    const m = v.match(/[\d.]+/g);
    if (!m || m.length < 3) return null;
    [r, g, b] = m.map(Number);
  }
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

function isDark() {
  const de = document.documentElement;
  if (de.classList.contains('light')) return false;
  if (de.classList.contains('dark')) return true;
  const fg = getComputedStyle(de).getPropertyValue('--foreground').trim();
  if (fg) {
    const l = cssLuminance(fg);
    if (l !== null) return l > 0.5;
  }
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
}

// ---------------------------------------------------------------- renderer / scene
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
} catch (err) {
  showMessage(`<b>WebGL is not available.</b><br>This viewer needs a browser with WebGL enabled.<br><small>${esc(err.message || err)}</small>`);
  throw err;
}
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setClearColor(0x000000, 0);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.localClippingEnabled = true;
root.prepend(renderer.domElement);

const scene = new THREE.Scene();
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.85;
const hemi = new THREE.HemisphereLight(0xffffff, 0x7d828a, 0.55);
const key = new THREE.DirectionalLight(0xffffff, 1.5);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
key.shadow.bias = -0.0004;
key.shadow.normalBias = 0.01;
scene.add(hemi, key, key.target);

const modelRoot = new THREE.Group();
modelRoot.name = 'sc-model-root';
scene.add(modelRoot);
const helpers = new THREE.Group();
helpers.name = 'sc-helpers';
scene.add(helpers);

const persp = new THREE.PerspectiveCamera(35, 1, 0.001, 1000);
const ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.001, 1000);
let camera = persp;
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.12;
controls.screenSpacePanning = true;
controls.zoomToCursor = true;
controls.autoRotateSpeed = 1.6;

const edgeMat = new THREE.LineBasicMaterial({ color: 0x14171b, transparent: true, opacity: 0.55 });
const clipPlane = new THREE.Plane(new THREE.Vector3(-1, 0, 0), 0);

// ---------------------------------------------------------------- state
const state = {
  edges: !!cfg.edges, wireframe: false, ground: !!cfg.ground, ortho: false, autoRotate: !!cfg.autoRotate,
  section: null, // { axis: 'x'|'y'|'z', t: 0..1, flip: bool }
};
const model = {
  loaded: false, name: '', format: '', object: null, meshes: [], parts: [], triangles: 0,
  box: new THREE.Box3(), center: new THREE.Vector3(), radius: 1, halfH0: 1,
};
let selection = null;
let dirty = true;
let anim = null;
let resolveReady;
let rejectReady;
const ready = new Promise((res, rej) => { resolveReady = res; rejectReady = rej; });
ready.catch(() => {});

// SolidCraft CAD axes expressed in the viewer's Y-up world (CAD X->x, CAD Y-> -z, CAD Z->y).
const CAD_AXES = { x: new THREE.Vector3(1, 0, 0), y: new THREE.Vector3(0, 0, -1), z: new THREE.Vector3(0, 1, 0) };
const VIEWS = {
  iso: [1, 1, 1], front: [0, 0, 1], back: [0, 0, -1], right: [1, 0, 0], left: [-1, 0, 0],
  top: [0, 1, 1e-4], bottom: [0, -1, 1e-4],
};

// ---------------------------------------------------------------- ground (grid + contact shadow)
let grid = null;
const shadowPlane = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.ShadowMaterial({ opacity: 0.16 }));
shadowPlane.rotation.x = -Math.PI / 2;
shadowPlane.receiveShadow = true;
shadowPlane.name = 'sc-shadow';
helpers.add(shadowPlane);

function niceStep(x) {
  const p = 10 ** Math.floor(Math.log10(x));
  const n = x / p;
  return (n < 1.5 ? 1 : n < 3.5 ? 2 : n < 7.5 ? 5 : 10) * p;
}

function buildGround() {
  if (grid) { helpers.remove(grid); grid.geometry.dispose(); grid.material.dispose(); grid = null; }
  if (!model.loaded) return;
  const size = model.box.getSize(new THREE.Vector3());
  const span = Math.max(size.x, size.z, model.radius) * 3;
  const step = niceStep(Math.max(size.x, size.y, size.z) / 6);
  const divisions = Math.max(2, Math.min(200, Math.round(span / step)));
  const dark = isDark();
  // Mid greys that read on light, dark and transparent (host-themed) backgrounds alike.
  grid = new THREE.GridHelper(divisions * step, divisions, dark ? 0x80878f : 0x7d848e, dark ? 0x565c64 : 0xa9afb7);
  grid.material.transparent = true;
  grid.material.opacity = dark ? 0.5 : 0.55;
  grid.material.toneMapped = false;
  grid.material.depthWrite = false;
  grid.position.set(model.center.x, model.box.min.y - model.radius * 0.002, model.center.z);
  grid.name = 'sc-grid';
  helpers.add(grid);
  shadowPlane.scale.setScalar(divisions * step);
  shadowPlane.position.set(model.center.x, model.box.min.y - model.radius * 0.001, model.center.z);
  applyGround();
}

function applyGround() {
  if (grid) grid.visible = state.ground;
  // The contact shadow would still show the clipped-away material, so drop it while sectioning.
  shadowPlane.visible = state.ground && model.loaded && !state.section;
  key.castShadow = shadowPlane.visible;
  dirty = true;
}

function placeLights() {
  const r = model.radius;
  const c = model.center;
  key.position.set(c.x + r * 1.2, c.y + r * 2.6, c.z + r * 1.6);
  key.target.position.copy(c);
  const sc = key.shadow.camera;
  sc.left = -r * 1.8; sc.right = r * 1.8; sc.top = r * 1.8; sc.bottom = -r * 1.8;
  sc.near = r * 0.1; sc.far = r * 8;
  sc.updateProjectionMatrix();
}

// ---------------------------------------------------------------- materials, edges, wireframe, section
function eachMaterial(fn) {
  for (const m of model.meshes) (Array.isArray(m.material) ? m.material : [m.material]).forEach(fn);
}

function applyEdges() {
  for (const mesh of model.meshes) {
    if (state.edges && !mesh.userData.scEdges) {
      const lines = new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry, 28), edgeMat);
      lines.name = 'sc-edges';
      lines.raycast = () => {};
      mesh.add(lines);
      mesh.userData.scEdges = lines;
    }
    if (mesh.userData.scEdges) mesh.userData.scEdges.visible = state.edges && !state.wireframe;
  }
  dirty = true;
}

function applyWireframe() {
  eachMaterial((m) => { m.wireframe = state.wireframe; });
  applyEdges();
}

function sectionRange(axis) {
  const e = CAD_AXES[axis];
  let lo = Infinity;
  let hi = -Infinity;
  const b = model.box;
  for (const x of [b.min.x, b.max.x]) for (const y of [b.min.y, b.max.y]) for (const z of [b.min.z, b.max.z]) {
    const d = e.x * x + e.y * y + e.z * z;
    lo = Math.min(lo, d); hi = Math.max(hi, d);
  }
  return [lo, hi];
}

function applySection() {
  const s = state.section;
  const planes = s ? [clipPlane] : null;
  if (s) {
    const [lo, hi] = sectionRange(s.axis);
    const pos = lo + (hi - lo) * s.t;
    const e = CAD_AXES[s.axis];
    if (s.flip) clipPlane.set(e.clone(), -pos); else clipPlane.set(e.clone().negate(), pos);
    $('sc-section-label').textContent = `CAD ${s.axis.toUpperCase()} ${s.flip ? '≥' : '≤'} ${(pos * 1000).toFixed(2)} mm`;
  }
  eachMaterial((m) => {
    m.clippingPlanes = planes;
    m.side = s ? THREE.DoubleSide : (m.userData.scSide ?? THREE.FrontSide);
    m.needsUpdate = true;
  });
  edgeMat.clippingPlanes = planes;
  edgeMat.needsUpdate = true;
  document.querySelectorAll('[data-axis]').forEach((b) => b.setAttribute('aria-pressed', String(!!s && b.dataset.axis === s.axis)));
  document.querySelector('[data-act="flip"]').setAttribute('aria-pressed', String(!!s?.flip));
  applyGround();
  dirty = true;
}

// ---------------------------------------------------------------- cameras & views
function aspect() {
  const w = root.clientWidth || 1;
  const h = root.clientHeight || 1;
  return w / h;
}

function updateOrthoFrustum() {
  const a = aspect();
  ortho.left = -model.halfH0 * a; ortho.right = model.halfH0 * a;
  ortho.top = model.halfH0; ortho.bottom = -model.halfH0;
  ortho.updateProjectionMatrix();
}

function fitDistance() {
  const vfov = THREE.MathUtils.degToRad(persp.fov);
  const hfov = 2 * Math.atan(Math.tan(vfov / 2) * aspect());
  return (model.radius / Math.sin(Math.min(vfov, hfov) / 2)) * 1.08;
}

function fitHalfHeight() {
  const a = aspect();
  return model.radius * 1.08 * (a < 1 ? 1 / a : 1);
}

function setClipping() {
  const r = model.radius;
  persp.near = r * 0.004; persp.far = r * 120; persp.updateProjectionMatrix();
  ortho.near = -r * 60; ortho.far = r * 120; updateOrthoFrustum();
  controls.minDistance = r * 0.02; controls.maxDistance = r * 30;
  controls.minZoom = 0.05; controls.maxZoom = 80;
}

const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

function setView(name = 'iso', animate = true) {
  const v = VIEWS[name] || VIEWS.iso;
  const dir = new THREE.Vector3(...v).normalize();
  const target = model.center.clone();
  const dist = fitDistance();
  moveCamera(target.clone().addScaledVector(dir, dist), target, 1, animate);
  document.querySelectorAll('[data-view]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.view === name)));
}

function fit(animate = true) {
  const dir = camera.position.clone().sub(controls.target);
  if (dir.lengthSq() < 1e-12) dir.set(1, 1, 1);
  dir.normalize();
  moveCamera(model.center.clone().addScaledVector(dir, fitDistance()), model.center.clone(), 1, animate);
}

function moveCamera(toPos, toTarget, toZoom, animate) {
  model.halfH0 = fitHalfHeight();
  updateOrthoFrustum();
  const fromTarget = controls.target.clone();
  const fromOff = camera.position.clone().sub(fromTarget);
  const toOff = toPos.clone().sub(toTarget);
  const fromZoom = ortho.zoom;
  if (!animate || !model.loaded || fromOff.lengthSq() < 1e-12) {
    persp.position.copy(toPos);
    ortho.position.copy(toPos);
    ortho.zoom = toZoom; ortho.updateProjectionMatrix();
    controls.target.copy(toTarget);
    camera.lookAt(toTarget);
    controls.update();
    dirty = true;
    return;
  }
  const q = new THREE.Quaternion().setFromUnitVectors(fromOff.clone().normalize(), toOff.clone().normalize());
  const q0 = new THREE.Quaternion();
  anim = { t0: performance.now(), dur: 450, fromTarget, toTarget, fromOff, toOff, q, q0, fromZoom, toZoom };
}

function stepAnimation(now) {
  if (!anim) return false;
  const k = Math.min(1, (now - anim.t0) / anim.dur);
  const e = ease(k);
  const qt = anim.q0.clone().slerp(anim.q, e);
  const len = THREE.MathUtils.lerp(anim.fromOff.length(), anim.toOff.length(), e);
  const off = anim.fromOff.clone().normalize().applyQuaternion(qt).multiplyScalar(len);
  controls.target.lerpVectors(anim.fromTarget, anim.toTarget, e);
  camera.position.copy(controls.target).add(off);
  if (camera === ortho) { ortho.zoom = THREE.MathUtils.lerp(anim.fromZoom, anim.toZoom, e); ortho.updateProjectionMatrix(); }
  camera.lookAt(controls.target);
  if (k >= 1) {
    // finish exactly on the requested pose
    persp.position.copy(camera.position); ortho.position.copy(camera.position);
    ortho.zoom = anim.toZoom; ortho.updateProjectionMatrix();
    anim = null;
  }
  return true;
}

function setOrtho(on) {
  if (on === (camera === ortho)) return;
  const tanHalf = Math.tan(THREE.MathUtils.degToRad(persp.fov) / 2);
  const dir = camera.position.clone().sub(controls.target);
  const d = dir.length();
  dir.normalize();
  if (on) {
    ortho.position.copy(camera.position);
    ortho.quaternion.copy(camera.quaternion);
    ortho.zoom = model.halfH0 / Math.max(1e-9, d * tanHalf);
    ortho.updateProjectionMatrix();
    camera = ortho;
  } else {
    const dist = model.halfH0 / ortho.zoom / tanHalf;
    persp.position.copy(controls.target).addScaledVector(dir, dist);
    persp.quaternion.copy(camera.quaternion);
    camera = persp;
  }
  controls.object = camera;
  camera.lookAt(controls.target);
  controls.update();
  dirty = true;
}

function resize() {
  const w = root.clientWidth || 1;
  const h = root.clientHeight || 1;
  renderer.setSize(w, h, false);
  persp.aspect = w / h;
  persp.updateProjectionMatrix();
  updateOrthoFrustum();
  dirty = true;
}
new ResizeObserver(resize).observe(root);

// ---------------------------------------------------------------- loading
function decodeBase64(b64) {
  const clean = b64.replace(/\s+/g, '');
  if (typeof Uint8Array.fromBase64 === 'function') return Uint8Array.fromBase64(clean);
  const bin = atob(clean);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
  return out;
}

function sniffFormat(bytes, name = '') {
  const ext = (name.split('?')[0].split('.').pop() || '').toLowerCase();
  if (bytes.length >= 4 && bytes[0] === 0x67 && bytes[1] === 0x6c && bytes[2] === 0x54 && bytes[3] === 0x46) return 'glb';
  if (['glb', 'gltf', 'stl'].includes(ext)) return ext;
  let i = 0;
  while (i < bytes.length && i < 64 && bytes[i] <= 0x20) i += 1;
  return bytes[i] === 0x7b ? 'gltf' : 'stl';
}

function disposeModel() {
  clearSelection();
  if (!model.object) return;
  model.object.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    if (o.material && o.material !== edgeMat) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m.dispose());
  });
  modelRoot.remove(model.object);
  model.object = null;
  model.loaded = false;
}

async function parseModel(buffer, format, baseUrl = '') {
  if (format === 'stl') {
    const geom = new STLLoader().parse(buffer);
    const mat = new THREE.MeshStandardMaterial({
      color: geom.hasColors ? 0xffffff : 0xb9c1cc, vertexColors: !!geom.hasColors, metalness: 0.05, roughness: 0.55,
    });
    const mesh = new THREE.Mesh(geom, mat);
    mesh.name = 'STL body';
    const g = new THREE.Group();
    g.add(mesh);
    return { object: g, up: 'z', unitScale: 0.001 };
  }
  const gltf = await new GLTFLoader().parseAsync(buffer, baseUrl);
  return { object: gltf.scene, up: 'y', unitScale: 1 };
}

function collectParts(object) {
  let node = object;
  while (node.children.length === 1 && !node.isMesh && node.children[0].children.length > 0) [node] = node.children;
  let parts = node.children.filter((c) => { let has = false; c.traverse((o) => { if (o.isMesh) has = true; }); return has; });
  if (parts.length <= 1) {
    const meshes = [];
    object.traverse((o) => { if (o.isMesh) meshes.push(o); });
    if (meshes.length > 1) parts = meshes;
  }
  return parts.map((o, i) => ({ name: o.name || `Part ${i + 1}`, object: o }));
}

async function loadBuffer(buffer, format, name = 'model', baseUrl = '') {
  showMessage(`Loading <b>${esc(name)}</b>…`);
  const bytes = new Uint8Array(buffer);
  const fmt = (format || sniffFormat(bytes, name)).toLowerCase();
  const parsed = await parseModel(buffer, fmt, baseUrl);
  disposeModel();
  const up = cfg.up === 'auto' ? parsed.up : cfg.up;
  const content = parsed.object;
  if (up === 'z') content.rotation.x = -Math.PI / 2;
  content.scale.multiplyScalar(parsed.unitScale);
  modelRoot.add(content);
  modelRoot.updateMatrixWorld(true);

  model.object = content;
  model.format = fmt;
  model.name = name;
  model.meshes = [];
  model.triangles = 0;
  content.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = true;
    o.receiveShadow = false;
    (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => {
      m.userData.scSide = m.side;
      m.polygonOffset = true; m.polygonOffsetFactor = 1; m.polygonOffsetUnits = 1;
    });
    const g = o.geometry;
    model.triangles += Math.round((g.index ? g.index.count : g.attributes.position.count) / 3);
    model.meshes.push(o);
  });
  model.box.setFromObject(content);
  if (model.box.isEmpty() || !model.meshes.length) throw new Error('The file contains no visible geometry.');
  model.box.getCenter(model.center);
  model.radius = Math.max(1e-6, model.box.getSize(new THREE.Vector3()).length() / 2);
  model.parts = collectParts(content);
  model.loaded = true;

  setClipping();
  placeLights();
  buildGround();
  applyWireframe();
  applySection();
  buildPartsPanel();
  updateInfo();
  setView(VIEWS[cfg.view] ? cfg.view : 'iso', false);
  hideMessage();
  dirty = true;
  const detail = info();
  document.dispatchEvent(new CustomEvent('sc-viewer:loaded', { detail }));
  resolveReady(detail);
  return detail;
}

async function loadUrl(url) {
  const name = decodeURIComponent(url.split(/[?#]/)[0].split('/').pop() || 'model');
  showMessage(`Loading <b>${esc(name)}</b>…`);
  let res;
  try {
    res = await fetch(url);
  } catch (err) {
    const fileHint = location.protocol === 'file:'
      ? '<br><br>Browsers block loading files from a <code>file://</code> page. Either embed the model:<br><code>python3 scripts/sc_view.py model.glb -o model.html</code><br>or serve the folder: <code>python3 -m http.server</code>, or drop the file here.'
      : '';
    throw new Error(`Could not fetch <code>${esc(url)}</code>.${fileHint}`, { cause: err });
  }
  if (!res.ok) throw new Error(`Could not fetch <code>${esc(url)}</code>: HTTP ${res.status}`);
  const base = new URL(url, location.href).href.replace(/[^/]*$/, '');
  return loadBuffer(await res.arrayBuffer(), '', name, base);
}

async function loadFile(file) {
  return loadBuffer(await file.arrayBuffer(), '', file.name);
}

function fail(err) {
  console.error('[sc-viewer]', err);
  const text = err && err.message ? err.message : String(err);
  showMessage(`<b>Could not show the model.</b><br>${text}`);
  rejectReady(err);
}

// ---------------------------------------------------------------- UI
function fmtMm(m) {
  const mm = m * 1000;
  return mm >= 100 ? mm.toFixed(1) : mm >= 10 ? mm.toFixed(2) : mm.toFixed(3);
}

function cadSize() {
  const s = model.box.getSize(new THREE.Vector3());
  return [s.x, s.z, s.y]; // CAD X, Y, Z in metres
}

function updateInfo() {
  const title = cfg.title || model.name.replace(/\.(glb|gltf|stl)$/i, '');
  $('sc-title').textContent = title;
  if (!framed && title) document.title = `${title} · SolidCraft viewer`;
  const [x, y, z] = cadSize();
  const sel = selection ? ` · ${selection.name}` : '';
  $('sc-dims').textContent = `${fmtMm(x)} × ${fmtMm(y)} × ${fmtMm(z)} mm · ${model.triangles.toLocaleString()} tris${sel}`;
}

function syncButtons() {
  document.querySelectorAll('[data-toggle]').forEach((b) => b.setAttribute('aria-pressed', String(!!state[b.dataset.toggle])));
  document.querySelector('[data-act="section"]').setAttribute('aria-pressed', String(!!state.section));
  document.querySelector('[data-act="parts"]').setAttribute('aria-pressed', String(!$('sc-parts').hidden));
  document.querySelector('[data-act="parts"]').classList.toggle('sc-hidden', model.parts.length <= 1);
}

function toggle(name, value) {
  const v = value === undefined ? !state[name] : !!value;
  state[name] = v;
  if (name === 'edges') applyEdges();
  else if (name === 'wireframe') applyWireframe();
  else if (name === 'ground') applyGround();
  else if (name === 'ortho') setOrtho(v);
  else if (name === 'autoRotate') controls.autoRotate = v;
  syncButtons();
  dirty = true;
  return v;
}

function setSection(axis, t, flip) {
  if (axis === null || axis === false) {
    state.section = null;
  } else {
    const prev = state.section || { axis: 'x', t: 0.5, flip: false };
    state.section = { axis: axis || prev.axis, t: t ?? prev.t, flip: flip ?? prev.flip };
    $('sc-section-pos').value = String(Math.round(state.section.t * 1000));
  }
  $('sc-section').hidden = !state.section;
  if (state.section) $('sc-parts').hidden = true;
  applySection();
  syncButtons();
}

function buildPartsPanel() {
  const list = $('sc-parts-list');
  list.textContent = '';
  model.parts.forEach((p, i) => {
    const label = document.createElement('label');
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = p.object.visible;
    cb.addEventListener('change', () => { p.object.visible = cb.checked; dirty = true; });
    const span = document.createElement('span');
    span.textContent = p.name;
    span.title = 'Click to highlight';
    span.addEventListener('click', (ev) => { ev.preventDefault(); select(p.object, p.name); });
    label.append(cb, span);
    label.dataset.index = String(i);
    list.append(label);
  });
  syncButtons();
}

let boxHelper = null;
function clearSelection() {
  if (boxHelper) { helpers.remove(boxHelper); boxHelper.geometry.dispose(); boxHelper = null; }
  selection = null;
  dirty = true;
}

function select(object, name) {
  clearSelection();
  if (!object) { if (model.loaded) updateInfo(); return; }
  boxHelper = new THREE.BoxHelper(object, 0x2f81f7);
  boxHelper.name = 'sc-selection';
  helpers.add(boxHelper);
  selection = { name: name || object.name || 'part', object };
  updateInfo();
  dirty = true;
}

function partOf(mesh) {
  for (const p of model.parts) {
    let found = false;
    p.object.traverse((o) => { if (o === mesh) found = true; });
    if (found) return p;
  }
  return { name: mesh.name || 'body', object: mesh };
}

const raycaster = new THREE.Raycaster();
let downAt = null;
renderer.domElement.addEventListener('pointerdown', (ev) => {
  downAt = { x: ev.clientX, y: ev.clientY };
  anim = null;
});
renderer.domElement.addEventListener('pointerup', (ev) => {
  if (!downAt || !model.loaded || ev.button !== 0) return;
  const moved = Math.hypot(ev.clientX - downAt.x, ev.clientY - downAt.y);
  downAt = null;
  if (moved > 4) return;
  const r = renderer.domElement.getBoundingClientRect();
  const ndc = new THREE.Vector2(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  const hits = raycaster.intersectObjects(model.meshes.filter((m) => m.visible), false)
    .filter((h) => !state.section || clipPlane.distanceToPoint(h.point) >= 0);
  if (!hits.length) { select(null); return; }
  const p = partOf(hits[0].object);
  select(p.object, p.name);
});
renderer.domElement.addEventListener('dblclick', () => { if (model.loaded) fit(); });
controls.addEventListener('change', () => { dirty = true; });

function screenshot() {
  renderer.render(scene, camera);
  const a = document.createElement('a');
  a.href = renderer.domElement.toDataURL('image/png');
  a.download = `${(cfg.title || model.name || 'model').replace(/\.[^.]+$/, '').replace(/[^\w.-]+/g, '_')}.png`;
  a.click();
}

const fsBtn = document.querySelector('[data-act="fullscreen"]');
if (!document.fullscreenEnabled) fsBtn.classList.add('sc-hidden');

function act(name) {
  switch (name) {
    case 'fit': if (model.loaded) fit(); break;
    case 'section': setSection(state.section ? null : undefined); break;
    case 'parts':
      $('sc-parts').hidden = !$('sc-parts').hidden;
      if (!$('sc-parts').hidden) setSection(null);
      syncButtons();
      break;
    case 'open': $('sc-file').click(); break;
    case 'shot': if (model.loaded) screenshot(); break;
    case 'flip': if (state.section) setSection(undefined, undefined, !state.section.flip); break;
    case 'fullscreen':
      if (document.fullscreenElement) document.exitFullscreen(); else root.requestFullscreen?.().catch(() => {});
      break;
    default: break;
  }
}

root.addEventListener('click', (ev) => {
  const b = ev.target.closest('button');
  if (!b) return;
  if (b.dataset.toggle) toggle(b.dataset.toggle);
  else if (b.dataset.view) { if (model.loaded) setView(b.dataset.view); }
  else if (b.dataset.axis) setSection(b.dataset.axis);
  else if (b.dataset.act) act(b.dataset.act);
});
$('sc-section-pos').addEventListener('input', (ev) => setSection(undefined, Number(ev.target.value) / 1000));
$('sc-file').addEventListener('change', (ev) => { const f = ev.target.files?.[0]; if (f) loadFile(f).catch(fail); ev.target.value = ''; });

window.addEventListener('keydown', (ev) => {
  if (ev.metaKey || ev.ctrlKey || ev.altKey) return;
  if (ev.target instanceof HTMLInputElement && ev.key !== 'Escape') return;
  const k = ev.key.toLowerCase();
  const map = { e: 'edges', w: 'wireframe', g: 'ground', o: 'ortho', r: 'autoRotate' };
  const views = { 1: 'iso', 2: 'front', 3: 'top', 4: 'right', 5: 'back', 6: 'left', 7: 'bottom' };
  if (map[k]) toggle(map[k]);
  else if (views[k] && model.loaded) setView(views[k]);
  else if (k === 'f') act('fit');
  else if (k === 's') act('section');
  else if (k === 'p' && model.parts.length > 1) act('parts');
  else if (k === 'escape') { select(null); setSection(null); $('sc-parts').hidden = true; syncButtons(); }
  else return;
  ev.preventDefault();
});

// drag & drop
root.addEventListener('dragover', (ev) => { ev.preventDefault(); root.classList.add('sc-dragover'); });
root.addEventListener('dragleave', (ev) => { if (!root.contains(ev.relatedTarget)) root.classList.remove('sc-dragover'); });
root.addEventListener('drop', (ev) => {
  ev.preventDefault();
  root.classList.remove('sc-dragover');
  const f = ev.dataTransfer?.files?.[0];
  if (f) loadFile(f).catch(fail);
});

// theme
function applyTheme() {
  document.documentElement.classList.toggle('sc-dark', isDark());
  if (model.loaded) buildGround();
  dirty = true;
}
window.addEventListener('themechange', applyTheme);
window.matchMedia?.('(prefers-color-scheme: dark)').addEventListener?.('change', applyTheme);
new MutationObserver(applyTheme).observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'style'] });

// ---------------------------------------------------------------- render loop
function tick(now) {
  requestAnimationFrame(tick);
  const animating = stepAnimation(now);
  const changed = controls.update();
  if (boxHelper && (animating || dirty)) boxHelper.update();
  if (animating || changed || dirty || controls.autoRotate) {
    renderer.render(scene, camera);
    dirty = false;
  }
}

// ---------------------------------------------------------------- public API
function info() {
  const [x, y, z] = model.loaded ? cadSize() : [0, 0, 0];
  return {
    version: VERSION,
    loaded: model.loaded,
    name: model.name,
    format: model.format,
    meshes: model.meshes.length,
    triangles: model.triangles,
    parts: model.parts.map((p) => p.name),
    sizeMm: [x, y, z].map((v) => Math.round(v * 1e6) / 1e3),
    camera: state.ortho ? 'orthographic' : 'perspective',
    selection: selection ? selection.name : null,
    state: { ...state, section: state.section ? { ...state.section } : null },
  };
}

window.scViewer = {
  version: VERSION,
  ready,
  info,
  setView: (name, animate = true) => setView(name, animate),
  fit: (animate = true) => fit(animate),
  toggle,
  section: (axis, t, flip) => setSection(axis, t, flip),
  load: (src, format, name) => (typeof src === 'string' ? loadUrl(src) : loadBuffer(src, format, name)),
  get camera() { return camera; },
  get controls() { return controls; },
  renderer,
  scene,
  config: cfg,
};

// ---------------------------------------------------------------- boot
applyTheme();
syncButtons();
resize();
requestAnimationFrame(tick);
root.addEventListener('pointerdown', () => $('sc-hint').classList.add('sc-hidden'), { once: true });

(async () => {
  const embedded = $('sc-model');
  const b64 = embedded ? embedded.textContent.trim() : '';
  if (b64) {
    const bytes = decodeBase64(b64);
    const name = embedded.dataset.name || 'model';
    return loadBuffer(bytes.buffer, embedded.dataset.format || sniffFormat(bytes, name), name);
  }
  if (cfg.model) return loadUrl(cfg.model);
  showMessage('<b>No model loaded.</b><br>Drop a <code>.glb</code> / <code>.stl</code> here, press <b>Open</b>, '
    + 'add <code>?model=path/to/model.glb</code> to the URL, or embed one with<br><code>python3 scripts/sc_view.py model.sc -o model.html</code>');
  syncButtons();
  return null;
})().catch(fail);
