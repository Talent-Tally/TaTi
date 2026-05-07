# Docs assistant API (Vercel)

Cette API permet d'utiliser l'assistant IA de la documentation sans exposer de cle API dans le frontend.

## Endpoint

- `POST /api/chat`

Le composant docs envoie les messages vers `VITE_DOCS_CHAT_WORKER_URL + "/chat"`.
Pour Vercel, configure donc:

- `VITE_DOCS_CHAT_WORKER_URL=https://<ton-projet>.vercel.app/api`

## Secrets et variables serveur (Vercel)

- `ANTHROPIC_API_KEY` (obligatoire)
- `ANTHROPIC_MODEL` (optionnel, defaut: `claude-sonnet-4-20250514`)
- `ALLOWED_ORIGINS` (optionnel, liste separee par virgules)

Exemple:

`ALLOWED_ORIGINS=https://www.tati.blog,https://talent-tally.github.io,http://localhost:5174`

## CORS

Des origines par defaut sont autorisees dans `api/chat.ts`:

- `https://www.tati.blog`
- `https://talent-tally.github.io`
- `http://localhost:5174`
- `http://localhost:5173`

Ajoute/override via `ALLOWED_ORIGINS` si besoin.
