# Assets

Drop final, compressed assets here. `node tools/wg.mjs assets` validates:

- extension allow-list and file magic
- ≤ 4 MB per file, dimensions warning above 4096 px
- duplicate content (identical sha256)
- hashes for cache-busting (`artifacts/assets/report.json`)

The Vite plugin also emits `assets/manifest.json` into the build with hashes.

Prefer:
- PNG/WebP for sprites with alpha, AVIF/WebP for large backgrounds
- sprite atlases over many small files (fewer requests, fewer draw calls)
- OGG/Opus for music, short WAV/OGG one-shots for SFX
- power-of-two textures when targeting WebGL

The starter ships with **zero** binary assets: all visuals are drawn and all
audio is synthesised. Delete this file once you add real assets.
