# TaTi

TaTi est une plateforme proprietaire de copilote IA orientee delivery/ops, connectee a des services externes via MCP (Model Context Protocol).

## Lancer rapidement (self-hosted)

Prerequis:

- Docker + Docker Compose v2

Installation minimale:

```bash
mkdir tati && cd tati
curl -fsSL -o docker-compose.yml https://raw.githubusercontent.com/Talent-Tally/TaTi/main/docker-compose.dist.yml
curl -fsSL -o .env.example https://raw.githubusercontent.com/Talent-Tally/TaTi/main/.env.example
cp .env.example .env
# editer .env
docker compose pull
docker compose up -d
```

Application:

- http://localhost:3000

## Licence

Ce projet est proprietaire ("All rights reserved").
Voir `LICENSE` et `EULA.md`.
