# Worker « assistant documentation » TaTi

La doc VitePress est **statique** (ex. GitHub Pages) : la clé Anthropic ne peut pas être dans le bundle. Ce Worker garde le secret côté Cloudflare et relaie les questions en **streaming** (SSE).

## Déploiement

1. `cd workers/tati-docs-chat && npm install`
2. `npx wrangler login` (une fois)
3. Vérifie dans `wrangler.toml` : `store_id` et `secret_name` correspondent à ton **Secrets Store** (`ANTHROPIC_API_KEY`). Sinon utilise `npx wrangler secret put ANTHROPIC_API_KEY` et commente le bloc `[[secrets_store_secrets]]`.
4. (Recommandé prod) Définis `ALLOWED_ORIGIN` dans `wrangler.toml` avec l’URL **exacte** de ton site doc (origine seule, sans chemin), ex. `https://talent-tally.github.io`.
5. `npm run deploy` — note l’URL du worker (`https://tati-docs-chat.….workers.dev`).

## Build des docs (GitHub Actions / local)

Expose uniquement l’URL du worker (sans `/chat`) :

```bash
export VITE_DOCS_CHAT_WORKER_URL=https://tati-docs-chat.xxx.workers.dev
npm run docs:build
```

Pour GitHub Actions, ajoute une variable dépôt `VITE_DOCS_CHAT_WORKER_URL` (non secrète).

## Développement local

Crée `.dev.vars` avec `ANTHROPIC_API_KEY`, puis `npm run dev`.  
Côté doc : `VITE_DOCS_CHAT_WORKER_URL=http://localhost:8787` puis `npm run docs:dev` à la racine du repo.
