# Worker « assistant documentation » TaTi

La documentation VitePress est **statique** : on ne peut pas y mettre une clé API en sécurité (elle finirait dans le JavaScript téléchargé par le navigateur).

Ce **Cloudflare Worker** garde `ANTHROPIC_API_KEY` comme **secret** côté Cloudflare et relaie les questions vers l’API Anthropic en **streaming** (SSE).

## Déploiement rapide

1. Installer les deps du worker :

   ```bash
   cd workers/tati-docs-chat && npm install
   ```

2. Définir la clé (une fois) :

   ```bash
   npx wrangler secret put ANTHROPIC_API_KEY
   ```

3. (Optionnel) Restreindre l’origine dans `wrangler.toml` : décommenter `ALLOWED_ORIGIN` et mettre l’URL exacte du site de doc (ex. `https://mon-org.github.io`).

4. Déployer :

   ```bash
   npm run deploy
   ```

5. Noter l’URL du worker (ex. `https://tati-docs-chat.<subdomain>.workers.dev`).

6. **Build des docs** avec uniquement l’URL publique du worker (pas la clé) :

   ```bash
   export VITE_DOCS_CHAT_WORKER_URL=https://tati-docs-chat.xxx.workers.dev
   npm run docs:build
   ```

## GitHub Actions (sans exposer la clé dans le dépôt)

- **Secrets Cloudflare** : la clé Anthropic reste dans le dashboard Cloudflare / `wrangler secret` (pas dans GitHub).
- **Variables GitHub** (non secrètes) : par ex. `VITE_DOCS_CHAT_WORKER_URL` = URL du worker après déploiement.
- Le workflow qui build les docs fait :

  ```yaml
  env:
    VITE_DOCS_CHAT_WORKER_URL: ${{ vars.VITE_DOCS_CHAT_WORKER_URL }}
  ```

  Puis `npm run docs:build`. Aucun `ANTHROPIC_*` dans les variables du build statique.

## Développement local

Créer `workers/tati-docs-chat/.dev.vars` :

```
ANTHROPIC_API_KEY=sk-ant-api03-...
```

Puis `npm run dev` dans ce dossier. Côté VitePress : `VITE_DOCS_CHAT_WORKER_URL=http://localhost:8787` (port affiché par Wrangler).
