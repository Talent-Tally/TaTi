/// <reference types="vite/client" />

interface ImportMetaEnv {
  // URL de base du backend assistant docs (ex: https://mon-proxy.vercel.app/api)
  readonly VITE_DOCS_CHAT_WORKER_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
