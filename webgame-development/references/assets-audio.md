# Assets and audio

## The pipeline

```
public/assets/            node tools/wg.mjs assets             dist/assets/manifest.json
  *.png *.webp *.ogg  ──▶ magic + size + hash ──▶ artifacts/assets/report.json
                         (Vite plugin emits a build manifest with sha256)
```

`wg assets` fails on a wrong extension, a mismatched magic header, a file over
4 MB, or an unreadable image. It warns on duplicate content and oversized
dimensions. The build manifest gives you cache-busting URLs and lets tests assert
an asset shipped.

The starter ships **zero** binary assets: visuals are drawn, audio is synthesised.
That is a feature (small bundle, no licensing) and a good default until art exists.

## Image formats

| Use | Format | Notes |
| --- | --- | --- |
| Sprites with alpha | PNG or WebP | WebP ~25–35 % smaller; keep PNG fallback only if you must |
| Large backgrounds | AVIF / WebP | AVIF wins on size, slower to decode; test on low-end |
| Logos / UI | SVG | Crisp at any DPR, tiny; rasterise only if you need filters |
| Pixel art | PNG | Disable smoothing in the renderer; scale by integers |

Rules:

- **Power of two** only matters for WebGL mipmaps/repeat wrapping; Canvas 2D does
  not care.
- **Sprite atlases** reduce requests and state changes. Pack with `free-tex-packer`
  or `texturepacker`; keep JSON atlas data in `public/assets/`.
- **Do not ship 4096 px textures** for a 64 px sprite; mobile GPUs pay for memory.
- **DPR**: export at 2× the largest CSS size you use, cap `devicePixelRatio` at 2.

## Loading

- Preload only what the first screen needs. Show a deterministic loading state.
- Decode images off the main thread when possible (`createImageBitmap`) and keep a
  cache keyed by URL; do not create a new `Image` per draw.
- Fail visibly: a missing asset in production is a console error and the e2e
  fixture will fail the run — do not swallow it in an empty `onerror`.

## Audio

The starter generates every sound with WebAudio (`src/audio.ts`), so there are no
files to preload and no licensing questions. For music and voice you need files.

### Unlocking

Browsers suspend `AudioContext` until a user gesture. Create the context lazily,
call `resume()` on the first click/keydown, and keep mute state in the save.

### Files

| Use | Format | Notes |
| --- | --- | --- |
| SFX | OGG/Opus, short WAV fallback | decode fully into an `AudioBuffer` |
| Music | OGG/Opus or AAC (M4A) | stream via `<audio>` if long; decode if you need sync |
| Voice | Opus | normalise loudness |

- Keep SFX < 100 ms and < 50 KB each; a 10 MB music file dominates the budget.
- Do not autoplay music before interaction; it will be blocked and may log an error
  that fails your e2e run.
- Stop and disconnect nodes; a new `AudioContext` per sound leaks and hits limits.
- Provide a mute toggle that persists (`SaveData.muted`) and is keyboard reachable
  (`M` in the starter).

## Budgets

Assets do not count against the JS/CSS gzip budget, but they count against real
load time:

- initial payload ≤ 2 MB for a mobile-friendly first screen
- total first-level assets ≤ 5 MB
- music streams; do not bundle it in the main chunk

Measure with the Network panel on a throttled profile, not on localhost.

## Licensing

Record the source and licence of every asset in `public/assets/CREDITS.md`
(CC0, CC-BY with attribution, purchased packs). "Found on the internet" is not a
licence. Generated audio/art still needs a tool licence review for commercial use.

## Versioning and cache-busting

Vite hashes emitted files. Serve `public/assets/*` with a long cache only if you
either hash the filename or append `?v=<sha256>` from the manifest. `index.html`
must never be cached long-term.
