# MCP connectors (reference) {#mcp-top}

TaTi does not embed all integration logic in the web binary: each domain (Slack, cloud, database…) is served by an **MCP bridge** — a small HTTP service compatible with the **Model Context Protocol**. Run them with Docker Compose (or manually), then register their **URL** in the UI: **Settings → MCP servers** (repo presets follow service names and `/mcp` paths). The UI **preset grid** is shown in [Introduction — New MCP server](./introduction.md#interface-presets-mcp).

::: tip Reminder
The **ports** below are **default host ports** from `.env.example`. You can change them: keep `.env`, `docker compose`, and the URL saved in TaTi consistent (e.g. if you change `MCP_SLACK_PORT`, `http://localhost:…/mcp` changes too).
:::


## MCP architecture (overview)

<div style="margin:1rem 0;">
  <img src="/diagrams/mcp_architecture_v2.svg" alt="MCP architecture v2" style="width:100%;height:auto;border:1px solid var(--vp-c-divider);border-radius:10px;background:var(--vp-c-bg-soft);padding:0.5rem;" />
</div>

<p><strong>This diagram highlights the separation of responsibilities:</strong></p>
<ul>
  <li><strong>TaTi UI / API</strong>: orchestrates the conversation, decides which tools to call, and consolidates outputs.</li>
  <li><strong>MCP servers</strong>: expose specialized capabilities (Slack, GitHub, DB, cloud, observability) through a uniform MCP interface.</li>
  <li><strong>Target systems</strong>: remain behind MCP connectors, with their own permissions, tokens, and guardrails.</li>
  <li><strong>Main benefit</strong>: add a new business domain by plugging a new MCP server, without changing TaTi core.</li>
</ul>

## MCP call flow (step by step)

<div style="display:grid;grid-template-columns:minmax(320px,1.2fr) minmax(260px,1fr);gap:1rem;align-items:start;margin:1rem 0 1.5rem;">
  <img src="/diagrams/mcp_call_flow_v2.svg" alt="MCP call flow v2" style="width:100%;height:auto;border:1px solid var(--vp-c-divider);border-radius:10px;background:var(--vp-c-bg-soft);padding:0.5rem;" />
  <div>
    <p><strong>Typical MCP call execution cycle:</strong></p>
    <ol>
      <li>The user sends a request in TaTi.</li>
      <li>The model decides an MCP tool is needed (for example dashboard, SQL, ticket, observability).</li>
      <li>TaTi calls the relevant MCP server with the useful context.</li>
      <li>The MCP server executes the action on the external system and returns a structured result.</li>
      <li>TaTi reformulates the final answer for the user using retrieved data.</li>
    </ol>
    <p><strong>Security note:</strong> effective permissions are those of the server token/account, not model permissions.</p>
  </div>
</div>

## Summary table

| Connector               | Host port (default)  | Typical URL (Compose network)       | Key variables                                                            |
| ----------------------- | -------------------- | ----------------------------------- | ------------------------------------------------------------------------ |
| OpenMetadata            | 8001                 | `http://mcp-openmetadata:8001/mcp`  | `OPENMETADATA_URL`, `OPENMETADATA_JWT`                                   |
| PostgreSQL              | 8002                 | `http://mcp-postgres:8002/mcp`      | `MCP_POSTGRES_DATABASE_URL`, `MCP_POSTGRES_READ_ONLY`                    |
| PDF                     | 8003                 | `http://mcp-pdf:8003/mcp`           | `MCP_PDF_PUBLIC_BASE_URL`                                                |
| Notion                  | 8004                 | `http://mcp-notion:8004/mcp`        | `MCP_NOTION_TOKEN`                                                       |
| GitHub                  | 8007                 | `http://mcp-github:8007/mcp`        | `MCP_GITHUB_TOKEN`                                                       |
| GitLab                  | 8008                 | `http://mcp-gitlab:8008/mcp`        | `MCP_GITLAB_TOKEN`, `MCP_GITLAB_URL`                                     |
| Elasticsearch           | 8009 → 8080 internal | `http://mcp-elasticsearch:8080/mcp` | `MCP_ELASTICSEARCH_*`                                                    |
| Discord                 | 8010                 | `http://mcp-discord:8010/mcp`       | `MCP_DISCORD_*`                                                          |
| Filesystem              | 8011                 | `http://mcp-filesystem:8011/mcp`    | `MCP_FILESYSTEM_ROOT`                                                    |
| AWS                     | 8012                 | `http://mcp-aws:8012/mcp`           | `AWS_*`                                                                  |
| Azure                   | 8013                 | `http://mcp-azure:8013/mcp`         | `AZURE_*`                                                                |
| GCP                     | 8014                 | `http://mcp-gcp:8014/mcp`           | `GCP_*`                                                                  |
| Email SMTP              | 8015                 | `http://mcp-email:8015/mcp`         | `SMTP_*`                                                                 |
| Dagster                 | 8016                 | `http://mcp-dagster:8016/mcp`       | `DAGSTER_GRAPHQL_URL`, `DAGSTER_API_TOKEN`                               |
| Apache Airflow          | 8017                 | `http://mcp-airflow:8017/mcp`       | `AIRFLOW_BASE_URL`, `AIRFLOW_USERNAME` / `AIRFLOW_PASSWORD`              |
| dbt Cloud               | 8018                 | `http://mcp-dbt:8018/mcp`           | `DBT_CLOUD_DISCOVERY_URL`, `DBT_CLOUD_TOKEN`, `DBT_CLOUD_ENVIRONMENT_ID` |
| dbt Core                | 8019                 | `http://mcp-dbt-core:8019/mcp`      | `DBT_CORE_HOST_PROJECT`, `DBT_PROFILES_DIR`, `DBT_ALLOW_MUTATIONS`       |
| Slack                   | 8006                 | `http://mcp-slack:8006/mcp`         | `MCP_SLACK_*`                                                            |
| Grafana                 | 8020                 | `http://mcp-grafana:8020/mcp`       | `MCP_GRAFANA_*`                                                          |
| Prometheus              | 8021                 | `http://mcp-prometheus:8021/mcp`    | `MCP_PROMETHEUS_*`                                                       |
| n8n Builder MCP         | 8022                 | `http://mcp-n8n:3000/mcp`           | `MCP_N8N_API_URL`, `MCP_N8N_API_KEY`, `MCP_N8N_AUTH_TOKEN`              |
| Datadog                 | — (HTTPS)            | See Datadog section                 | `MCP_DATADOG_*` + headers                                                |
| Google Gmail / Calendar | — (HTTPS)            | Google MCP endpoints                | `GOOGLE_*`, OAuth                                                        |
| Moodle                  | — (HTTPS)            | Moodle plugin URL                   | `MCP_MOODLE_*`                                                           |

The sections below cover **role**, **typical use**, **what the bridge usually exposes**, **configuration**, and **pitfalls**.

---

## MCP OpenMetadata {#mcp-openmetadata}

**Role**: MCP tools to query (and optionally change) metadata in **OpenMetadata** — tables, columns, glossaries, tags, lineage, business properties.

**Typical use**: “Which table feeds this report?”, “Who owns this dataset?”, “Show lineage around _customers_.”

**Setup**: Compose service `mcp-openmetadata`, port **8001**. URL in TaTi: `http://mcp-openmetadata:8001/mcp`. Vars: `OPENMETADATA_URL`, `OPENMETADATA_JWT`, optional `OPENMETADATA_ALLOW_MUTATIONS`, `OPENMETADATA_WRITE_CONFIRM_TOKEN`.

::: warning
Catalog mutations are sensitive: keep `OPENMETADATA_ALLOW_MUTATIONS=false` until flows are validated.
:::

---

## MCP PostgreSQL {#mcp-postgresql}

**Role**: Run **SQL** against Postgres (often a business DB — may be the same instance as TaTi; scope carefully).

**Typical use**: schema exploration, read-only analytics (`SELECT`), avoid dumping copies manually.

**Setup**: Port **8002**, URL `http://mcp-postgres:8002/mcp`. Vars: `MCP_POSTGRES_DATABASE_URL`, `MCP_POSTGRES_READ_ONLY` (`true` recommended for discovery).

::: tip
Even read-only `SELECT` can load the DB — isolate networks and define SQL policy.
:::

---

## MCP PDF {#mcp-pdf}

**Role**: **Generate PDFs** and return **download URLs**.

**Setup**: Port **8003**, `MCP_PDF_PUBLIC_BASE_URL` must be reachable by browsers following links.

---

## MCP Notion {#mcp-notion}

**Role**: Access **Notion** databases and pages via integration token permissions.

**Setup**: Port **8004**, `MCP_NOTION_TOKEN`.

---

## MCP Slack {#mcp-slack}

**Role**: Read history (per scopes) and **post** via a bot; optionally restrict channels.

**Setup**: Port **8006**. Vars: `MCP_SLACK_BOT_TOKEN`, `MCP_SLACK_TEAM_ID`, `MCP_SLACK_CHANNEL_IDS` (recommended to limit channels).

---

## MCP Discord {#mcp-discord}

**Role**: Discord equivalent of the Slack bridge — guild channels and bot permissions.

**Setup**: Port **8010**, `MCP_DISCORD_BOT_TOKEN`, `MCP_DISCORD_GUILD_ID`, `MCP_DISCORD_CHANNEL_IDS`.

---

## MCP Filesystem {#mcp-filesystem}

**Role**: List/read (and sometimes write) files under a **single root** (`FILESYSTEM_ROOT`).

**Setup**: Port **8011**, `MCP_FILESYSTEM_ROOT`. In production use a dedicated volume and strict permissions.

---

## MCP GitHub {#mcp-github}

**Role**: Automate GitHub workflows — issues, PRs, CI context.

**Setup**: Port **8007**, `MCP_GITHUB_TOKEN`, `MCP_WRITE_CONFIRM_TOKEN` for guarded writes.

---

## MCP GitLab {#mcp-gitlab}

**Role**: Projects, issues, merge requests — SaaS or self-hosted GitLab.

**Setup**: Port **8008**, `MCP_GITLAB_TOKEN`, `MCP_GITLAB_URL`.

---

## MCP Elasticsearch {#mcp-elasticsearch}

**Role**: Full-text search and index operations — depends on MCP image and stack version.

**Setup**: Host **8009** mapped to **8080** in container — URL `http://mcp-elasticsearch:8080/mcp`. Vars: `MCP_ELASTICSEARCH_URL`, credentials, optional `MCP_ELASTICSEARCH_SSL_SKIP_VERIFY`.

---

## MCP AWS {#mcp-aws}

**Role**: AWS APIs — often **read-only** inventory; mutations are high-risk.

**Setup**: Port **8012**, `AWS_REGION`, `AWS_PROFILE` or static keys / session token.

---

## MCP Azure {#mcp-azure}

**Role**: Azure resources via ARM or APIs exposed by the bridge.

**Setup**: Port **8013**, Service Principal or `AZURE_ACCESS_TOKEN`. Prefer **Reader** for exploration.

---

## MCP GCP {#mcp-gcp}

**Role**: GCP project resources — Compute, GKE, storage, IAM reads per service account.

**Setup**: Port **8014**, `GCP_PROJECT_ID`, `GCP_REGION`, `GCP_SERVICE_ACCOUNT_JSON` (never commit).

---

## MCP Email (SMTP) {#mcp-email}

**Role**: Send mail via SMTP — no IMAP inbox in scope.

**Setup**: Port **8015**, `SMTP_*`, **`SMTP_ALLOWED_RECIPIENTS`** to prevent misuse.

---

## MCP Dagster {#mcp-dagster}

**Role**: Dagster via **GraphQL** — assets, jobs, runs, partitions.

**Setup**: Port **8016**, `DAGSTER_GRAPHQL_URL`, `DAGSTER_API_TOKEN`, `DAGSTER_ALLOW_MUTATIONS`.

---

## MCP Apache Airflow {#mcp-airflow}

**Role**: Query and control **Apache Airflow** via the stable **REST API** (`/api/v1`): DAGs, dag runs, tasks; trigger or pause when mutations are enabled.

**Typical use**

- “List active DAGs”, “last run status for `daily_etl`”, “trigger a run with this `conf`” (if mutations are on).

**Bridge capabilities**

- Read: list DAGs, DAG detail, list/detail dag runs, list tasks for a DAG.
- Write (optional): trigger a dag run, pause/unpause DAG — only if `AIRFLOW_ALLOW_MUTATIONS=true` and the Airflow account allows it.

**Configuration**

- **Port**: **8017** (`MCP_AIRFLOW_PORT`).
- **TaTi URL**: `http://mcp-airflow:8017/mcp` (Compose) or `http://localhost:8017/mcp` from the host.
- **Variables**: `AIRFLOW_BASE_URL` (webserver root URL **without** `/api/v1`), `AIRFLOW_USERNAME` / `AIRFLOW_PASSWORD` (Basic auth), optional `AIRFLOW_API_TOKEN` (Bearer), `AIRFLOW_SSL_VERIFY`, `AIRFLOW_ALLOW_MUTATIONS`.

---

## MCP dbt Cloud (Discovery API) {#mcp-dbt}

**Role**: Query **dbt Cloud** metadata via the **Discovery** GraphQL API — models, sources, custom lineage queries.

**Setup**: Port **8018** (`MCP_DBT_PORT`). **TaTi URL**: `http://mcp-dbt:8018/mcp`.

**Variables**: `DBT_CLOUD_DISCOVERY_URL` (from Account settings → Access URLs), **`DBT_CLOUD_TOKEN`** (service token with Discovery access), optional **`DBT_CLOUD_ENVIRONMENT_ID`** for shortcut tools, **`DBT_SSL_VERIFY`**.

**Scope**: This bridge targets **dbt Cloud** Discovery. For a local **dbt Core** project, use **[MCP dbt Core](#mcp-dbt-core)**.

---

## MCP dbt Core (local CLI) {#mcp-dbt-core}

**Role**: Run **dbt Core** CLI in a container against a **mounted project directory** — `parse`, `ls`, `compile`, manifest summary, and optionally `deps` / `run` / `test` / `build` when mutations are enabled.

**Setup**: Port **8019** (`MCP_DBT_CORE_PORT`). **TaTi URL**: `http://mcp-dbt-core:8019/mcp`.

**Variables**: **`DBT_CORE_HOST_PROJECT`** (host path mounted at `/workspace`), **`DBT_CORE_PROJECT_DIR`** (container path, default `/workspace`), optional **`DBT_PROFILES_DIR`**, **`DBT_CORE_TARGET`** (`--target`), **`DBT_ALLOW_MUTATIONS`** (`false` by default — blocks deps/run/test/build).

**Notes**: Image includes **dbt-postgres**; extend the Dockerfile for other adapters. Warehouse credentials are required for compile/run against a live warehouse.

---

## MCP Grafana {#mcp-grafana}

**Role**: Official Grafana MCP — dashboards, folders, alerts.

**Setup**: Port **8020**, `MCP_GRAFANA_URL`, `MCP_GRAFANA_SERVICE_ACCOUNT_TOKEN`, optional org ID.

---

## MCP Prometheus {#mcp-prometheus}

**Role**: PromQL queries, targets, series metadata.

**Setup**: Port **8021**, `MCP_PROMETHEUS_URL`, optional auth, `MCP_PROMETHEUS_SSL_VERIFY`.

---

## MCP Datadog {#mcp-datadog}

**Role**: **Hosted Datadog MCP** (not a default Compose container) — APM, logs, metrics per product.

**Setup**: `MCP_DATADOG_MCP_URL` (US/EU). Keys often passed as **headers** in TaTi (`DD_API_KEY`, `DD_APPLICATION_KEY`).

---

## MCP n8n (Builder + Instance) {#mcp-n8n}

**Goal**: let TaTi **create, edit, list, and run** n8n workflows from chat.

### Choose the right mode

- **n8n Builder MCP (recommended for build/edit)**:
  - Local Docker service `mcp-n8n` (`ghcr.io/talent-tally/tati-mcp-n8n:latest`).
  - TaTi URL: `http://mcp-n8n:3000/mcp`.
  - Exposes workflow CRUD/build tools when `N8N_MODE=true` and API access is valid.
- **n8n Instance MCP (native n8n endpoint)**:
  - Direct n8n endpoint: `https://<your-domain>/mcp-server/http`.
  - Auth with n8n MCP token (`Authorization: Bearer <token>`).
  - Good for native instance-level access; depending on n8n version/config, tool coverage may be more run/ops-oriented.

### n8n-side prerequisites

1. Enable **Instance-level MCP** in n8n: `Settings -> Instance-level MCP`.
2. Enable target workflows as **Available in MCP**.
3. Generate the required secrets:
   - **n8n API Key** (for Builder MCP through n8n API).
   - **MCP Access Token** (for native Instance MCP).

### `.env` variables (local Builder MCP)

```bash
MCP_N8N_API_URL=https://your-subdomain.app.n8n.cloud
MCP_N8N_API_KEY=...
MCP_N8N_AUTH_TOKEN=change-me-n8n-mcp-token
MCP_N8N_WEBHOOK_SECURITY_MODE=strict
MCP_N8N_PORT=8022
MCP_N8N_IMAGE=ghcr.io/talent-tally/tati-mcp-n8n:latest
```

**Important**

- `MCP_N8N_API_URL` must be the base instance URL (for example `https://xxx.app.n8n.cloud`), **without** `/api/v1`.
- Keep token/key values literal in `.env` (special characters are supported).

### Start command (exact)

From repo root:

```bash
docker compose up -d mcp-n8n app
```

Then verify:

```bash
docker compose logs --tail=100 mcp-n8n
curl -s http://localhost:8022/health
```

Expected:

- logs showing `n8n MCP ... running on 0.0.0.0:3000`
- health endpoint returns OK.

### TaTi UI setup

In **Settings -> MCP servers**:

- preset **n8n (Builder MCP)**:
  - URL: `http://mcp-n8n:3000/mcp`
  - Headers JSON:
    ```json
    {
      "Authorization": "Bearer <MCP_N8N_AUTH_TOKEN>"
    }
    ```
- optional preset **n8n (Instance MCP)**:
  - URL: `https://<your-subdomain>.app.n8n.cloud/mcp-server/http`
  - Header `Authorization: Bearer <YOUR_N8N_MCP_TOKEN>`

### Recommended end-to-end smoke test

1. In TaTi, enable only **n8n Builder**.
2. Send short prompts:
   - `List my n8n workflows`
   - then `Create a simple workflow with a trigger and email send`
3. Confirm workflow creation/changes in n8n UI.

### Common failures and fixes

- **Missing tools (`n8n_create_workflow`, `n8n_list_workflows`)**
  - check `N8N_MODE=true` on `mcp-n8n`
  - check `MCP_N8N_API_URL` does not include `/api/v1`
  - verify `MCP_N8N_API_KEY` validity.
- **“Cannot test via API - Manual Trigger...”**
  - expected behavior: `Manual Trigger` does not support external API test; use webhook/schedule/chat trigger for API-driven testing.
- **Port conflict concerns**
  - host uses `8022`; `3000` is internal container port.
- **Agent gives incomplete answers**
  - verify TaTi is using the intended MCP server (Builder vs Instance), then retry with shorter prompts.

---

## Google Gmail & Calendar (remote MCP) {#mcp-google}

**Role**: Gmail and Calendar via **Google-hosted** MCP endpoints.

**Setup**: `MCP_GMAIL_MCP_URL`, `MCP_GOOGLE_CALENDAR_MCP_URL`, `GOOGLE_CLOUD_PROJECT_ID`, OAuth vars. Configure **headers** in TaTi if required.

---

## MCP Moodle {#mcp-moodle}

**Role**: Moodle plugin MCP endpoint for courses and activities.

**Setup**: `MCP_MOODLE_MCP_URL`, `MCP_MOODLE_TOKEN` — least-privilege token.

---

## Deprecations and alternatives

- **Elasticsearch MCP image**: `.env.example` may note Elastic-side evolution — watch release notes for recommended endpoints.

## See also

- [Architecture](./architecture.md) — UI, API, and MCP flows.
- [Configuration](./configuration.md) — full variable list.
- [Security](./security.md) — tokens, read-only, networking.
