# Release

## Build

```bash
npm run build          # dist/ — static, no server required
node tools/wg.mjs verify
```

`dist/` contains hashed JS/CSS, `index.html` and `assets/manifest.json`. The
production build strips the test bridge (`__WG_E2E__ = false`).

If the game is served from a subpath (GitHub Pages project site, S3 prefix), set
`base` in `vite.config.ts`:

```ts
export default defineConfig({ base: '/my-game/' })
```

Test the subpath build locally with `npx vite preview` (which honours `base`).

## Hosting and caching

Any static host works: Netlify, Cloudflare Pages, Vercel, S3+CloudFront, GitHub
Pages, nginx.

| Path | Cache-Control |
| --- | --- |
| `/assets/*-<hash>.js|css|woff2` | `public, max-age=31536000, immutable` |
| `/index.html` | `no-cache` (revalidate) |
| `/assets/manifest.json` | short (60 s) or no-cache |

Do not cache `index.html` long-term; that is how users get stuck on an old build.

### Compression and headers

- Enable brotli/gzip at the CDN. Our budget is gzip; brotli is usually smaller.
- Set `Content-Type` correctly for `.webp`, `.avif`, `.ogg`, `.mjs`.
- Optional hardening: `Cross-Origin-Opener-Policy: same-origin`. Only add
  `Cross-Origin-Embedder-Policy: require-corp` if you actually need
  `SharedArrayBuffer`; it breaks cross-origin assets unless they send CORP headers.

### Least-privilege Firebase Hosting REST deploys

When deploying a standalone/static bundle directly via the Firebase Hosting REST API
(`firebasehosting.googleapis.com/v1beta1`, OAuth scope
`https://www.googleapis.com/auth/firebase.hosting`) under a minimal custom IAM role
granting only `firebasehosting.sites.get` and `firebasehosting.sites.update`:

- `POST /v1beta1/sites/{site}/versions` **commits the new `CREATED` version on the
  backend and then returns HTTP `403`** on its post-create metadata lookup.
- Do **not** escalate IAM permissions to work around that `403`. Instead, on `403`,
  query `GET /v1beta1/projects/{project}/sites/{site}/versions`, select the matching
  `status === "CREATED"` version (`name.replace(/^projects\/[^/]+\//, '')`), and
  proceed normally through `:populateFiles`, gzipped upload, `PATCH ?updateMask=status`
  (`FINALIZED`), and `/releases`.

## PWA and offline (optional)

Only add a service worker if offline play is a real requirement. Pitfalls:

- A stale SW can serve an old bundle forever. Version the cache and skip waiting.
- Scope the SW to the app path, not the whole origin.
- Test the "update available" flow, not just first install.

A simpler alternative: `Cache-Control` + a small "new version available, reload"
prompt based on a build id.

## Observability

- **Errors**: a small `window.onerror`/`unhandledrejection` handler posting to your
  endpoint, with the seed and snapshot hash attached. Never send PII.
- **Gameplay metrics**: run started/finished, score distribution, level reached.
  Aggregate, sample, and respect Do Not Track/consent where required.
- **Performance**: collect `perf.json`-style medians from real sessions (a few
  percent sample) and alert on regressions, not raw averages.
- Keep analytics out of the critical path; load after first interaction.

## Launch checklist

- [ ] `node tools/wg.mjs verify` PASS on the release commit; run id recorded
- [ ] bundle and FPS budgets pass on a throttled mid-tier device
- [ ] playable on a phone: touch targets, no hover-only affordances, safe areas
- [ ] keyboard-only run: start, steer, pause, mute, restart
- [ ] screen reader: menu button names, live score announcements, one `h1`
- [ ] save persists across reload and survives corrupt storage
- [ ] reduced motion honoured; audio never autoplays
- [ ] 404s: favicon, manifest, source maps (decide whether to ship maps)
- [ ] `index.html` not cached; hashed assets immutable
- [ ] error reporting tested by forcing one error
- [ ] rollback path: previous build retained and switchable

## Versioning

Put the game version in `package.json` and surface it in the UI footer or a
`?version` debug overlay. It makes bug reports actionable. Tag releases; keep
`artifacts/` from the release run with the tag.

## Source maps

`vite.config.ts` emits source maps. For a public game you may prefer
`sourcemap: 'hidden'` and upload maps to your error tracker, so players do not
download them. Decide explicitly; do not leave the default by accident.
