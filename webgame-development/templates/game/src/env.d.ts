/// <reference types="vite/client" />

/** True only for `vite build --mode e2e` / the e2e dev build. */
declare const __WG_E2E__: boolean;

interface ImportMetaEnv {
  readonly MODE: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
