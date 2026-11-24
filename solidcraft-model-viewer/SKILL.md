---
name: solidcraft-model-viewer
description: Use whenever a SolidCraft (or any GLB/STL) 3D model should be shown to the user as an interactive, rotatable and zoomable 3D view in the browser or inline in Antigravity chat — packs the model into one self-contained offline HTML file (three.js inlined, no CDN) with orbit/zoom/pan, standard CAD views, edges, section plane, parts list and mm dimensions, via one command.
---

# SolidCraft model viewer

One prepared, reusable HTML file — [`assets/solidcraft-viewer.html`](assets/solidcraft-viewer.html) — that shows
a 3D model the user can turn, zoom and pan. three.js r187 is **inlined** (≈660 KiB), so it needs no CDN, no
server and no build step, and it renders inside Antigravity HTML artifacts, whose CSP blocks external scripts
and `fetch()`.

The only per-model change is the model itself, and [`scripts/sc_view.py`](scripts/sc_view.py) makes it:

```bash
V=~/.gemini/config/skills/solidcraft-model-viewer
python3 $V/scripts/sc_view.py part.sc  -o part.html --title "Bracket v2"   # .sc/.step -> GLB via solidcraft-cli, embedded
python3 $V/scripts/sc_view.py part.glb -o part.html                        # GLB/STL (glTF with embedded buffers) embedded
python3 $V/scripts/sc_view.py part.glb -o site/part.html --link            # reference the GLB instead (needs http)
```

## Why embedding is the default

| Way to give the viewer a model | file:// double-click | Antigravity artifact | Web server |
| --- | --- | --- | --- |
| **Embedded** base64 GLB (`sc_view.py`, default) | yes | **yes** | yes |
| `"model": "part.glb"` in the `sc-config` block, or `--link` | no — browsers block `fetch()` from `file://` | no — CSP | yes |
| `?model=part.glb` URL parameter | no | no | yes |
| Drag & drop / **Open** button | yes | yes | yes |

A reference-only template (edit one line) is exactly what `--link` / the `sc-config` block gives you, but only a
served page can load it. Embedding costs ~1.33 × the GLB size and works everywhere, so use it unless the
page lives on a web server next to many large models.

## Workflow after building or changing a SolidCraft model

1. Save the design and export a GLB (or let `sc_view.py` export it from the `.sc` with `solidcraft-cli`):
   - MCP: `save {"path": ".../part.sc"}` and `export {"path": ".../part.glb"}` (the folder must exist).
   - GLB from SolidCraft is metres, Y-up, one named node per body/occurrence, with colours, metallic and
     roughness — the viewer shows those and lists every body/occurrence under **Parts**.
   - Transparent bodies are refused by SolidCraft's GLB export; give them an opaque look or export STL.
2. Pack: `python3 $V/scripts/sc_view.py part.glb -o part.html --title "..."`. Keep the HTML next to the
   model in the project (`models/<name>/<name>.html`) and regenerate it whenever the model changes —
   a stale viewer is a stale deliverable.
3. Show it to the user:
   - **Antigravity, inline in chat:** copy the packed page into the conversation's artifact directory
     (`cp part.html <artifact-dir>/part-viewer.html`; at ~800 KiB it is too large to write with `write_file`)
     and put `<agent-embed src="file:///<artifact-dir>/part-viewer.html"></agent-embed>` in the reply.
     Inside an iframe the viewer is a fixed 440 px tall (`--height` changes it; keep ≤ 450 for inline
     chat) and follows the host's light/dark theme variables.
   - **Antigravity side pane / browser:** link the file with a `file://` URL or run `open part.html`.
     Standalone it fills the window.
4. Verify before claiming it works (see below).

## What the user can do

- Left-drag rotate · wheel / pinch zoom (towards the cursor) · right-drag or Shift-drag pan · double-click fit.
- Views **Iso / Front / Top / Right** (keys `1`-`7` incl. back, left, bottom) use SolidCraft's CAD axes:
  front looks from −Y, top from +Z, right from +X.
- Toggles: **Edges** (`E`, feature lines at 28°), **Wire** (`W`), **Ground** grid + contact shadow (`G`),
  **Ortho** camera (`O`), **Spin** auto-rotate (`R`), **Fit** (`F`).
- **Section** (`S`): clip along CAD X/Y/Z with a slider and **Flip**; the label shows the cut position in mm.
- **Parts** (`P`): show/hide bodies, click a name or a body in the view to highlight it and show its name.
- Info line: overall size in mm (CAD X × Y × Z) and triangle count. **PNG** saves a transparent screenshot.
- `Esc` clears selection, section and panels. **Open** or drop any `.glb`/`.gltf`/`.stl` to view another file.

## Options

`sc_view.py` flags write into the page's `sc-config` JSON block; the same keys work as URL parameters
(`?view=front&edges=0`), which override the block:

| Flag / key | Default | Meaning |
| --- | --- | --- |
| `--title` / `title` | file name | Caption, also the browser tab title |
| `--view` / `view` | `iso` | `iso front back top bottom left right` |
| `--height` / `height` | `440` | px height when inside an iframe (chat embed) |
| `--up` / `up` | `auto` | `y` (GLB) or `z` (STL, and other Z-up GLBs); `auto` picks by format |
| `--background` / `background` | `auto` | `auto`/`transparent` (blend into host) or a CSS colour |
| `--no-edges`, `--no-ground`, `--spin` | edges on, ground on, no spin | Start state of the toggles |
| `--link` | off | Write a relative `model` URL instead of embedding |
| `--glb-out PATH` | temp | Keep the GLB exported from a `.sc`/`.step` input |

STL files are read as millimetres, Z-up (SolidCraft's STL export), and shown in the same frame as a GLB.

## Programmatic API (tests, other pages)

`window.scViewer` exposes `ready` (Promise of `info()`), `info()` → `{loaded, name, format, meshes, triangles,
parts, sizeMm, camera, selection, state}`, `setView(name)`, `fit()`, `toggle(name, value?)`,
`section(axis|null, t?, flip?)`, `load(urlOrArrayBuffer, format?, name?)`, plus `renderer`, `scene`, `camera`,
`controls`. A `sc-viewer:loaded` DOM event fires with the same detail.

## Verify

```bash
python3 -m unittest discover -s $V/scripts -p 'test_*.py'      # packer + template contract (also in CI)
cd $V/src && npm ci && node verify.mjs path/to/part.glb --shots /tmp/sc-shots
```

`verify.mjs` drives Chrome (or `CHROME_PATH`) through file://, http, a strict no-network CSP inside an iframe
(Antigravity-like), and the empty template; it checks load, canvas coverage, orbit, zoom, every view button,
ortho, edges, wireframe, section, picking, keyboard, theme and zero console errors, and writes screenshots.
Look at the screenshots (`read_file`) — proportions, colours and edges — before reporting.

## Changing the viewer itself

Edit [`src/viewer.js`](src/viewer.js) (app) or [`src/template.html`](src/template.html) (markup/CSS), then
`cd src && npm ci && npm run build` regenerates `assets/solidcraft-viewer.html`; run both checks above and
commit source and asset together. Keep the `SC-CONFIG` / `SC-MODEL` comment markers exactly once each —
`sc_view.py` replaces what is between them, so re-packing an already packed page is idempotent. Bump
`version` in `src/package.json` for user-visible changes. Pages packed earlier keep their own copy of the
viewer; re-run `sc_view.py` on them to upgrade.

## Alternatives considered

- Google `<model-viewer>`: polished, but product-style (no CAD views, edges, section or ortho) and ~1 MB.
- CDN imports of three.js: smaller file, but break offline use and Antigravity's CSP.
- Separate `viewer.html` + `model.glb`: the `--link` mode; requires a web server.
