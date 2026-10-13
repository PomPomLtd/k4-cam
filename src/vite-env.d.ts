/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Comma-separated origins a camera link may name as its API (live-boards spec §7.2). */
  readonly VITE_K4_API_ORIGINS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
