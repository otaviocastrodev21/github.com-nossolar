/// <reference types="vite/client" />

/** commit e dia da montagem, ex.: "4016db4 · 06/11/2026" (vite.config.ts) */
declare const __APP_VERSION__: string;

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
