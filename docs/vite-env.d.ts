/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** URL du Worker Cloudflare (sans slash final) — ex. https://tati-docs-chat.xxx.workers.dev */
  readonly VITE_DOCS_CHAT_WORKER_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
