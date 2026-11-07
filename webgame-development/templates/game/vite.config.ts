import { defineConfig } from 'vite';
import { gameBridge } from './tools/plugins/game-bridge.ts';
import { assetManifest } from './tools/plugins/asset-manifest.ts';
import { devHealth } from './tools/plugins/dev-health.ts';

/**
 * `--mode e2e` builds the same code as production plus the deterministic test
 * bridge (`__WG_E2E__`), so automated UI tests exercise the real bundle.
 */
export default defineConfig(({ mode }) => {
  const e2e = mode === 'e2e';
  return {
    plugins: [gameBridge({ e2e }), assetManifest(), devHealth()],
    define: {
      __WG_E2E__: JSON.stringify(e2e),
    },
    build: {
      target: 'es2022',
      sourcemap: true,
      reportCompressedSize: false,
      assetsInlineLimit: 4096,
      // Per-thread override: `WG_OUT_DIR` lets parallel runs build and preview
      // their own output instead of overwriting a shared dist directory.
      outDir: process.env.WG_OUT_DIR ?? (e2e ? 'dist-e2e' : 'dist'),
    },
    server: {
      host: '127.0.0.1',
      port: Number(process.env.WG_PORT ?? 5173),
      strictPort: false,
    },
    preview: {
      host: '127.0.0.1',
      port: Number(process.env.WG_PREVIEW_PORT ?? 4173),
      strictPort: false,
    },
  };
});
