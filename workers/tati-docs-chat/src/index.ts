/**
 * Relais documentation TaTi → Anthropic (streaming).
 * Secret : ANTHROPIC_API_KEY (wrangler secret put ANTHROPIC_API_KEY)
 */

export interface Env {
  ANTHROPIC_API_KEY: string;
  ANTHROPIC_MODEL?: string;
  /** Si défini, n’accepte que cette origine (ex. https://docs.example.com) */
  ALLOWED_ORIGIN?: string;
}

const SYSTEM = `Tu es l'assistant de la documentation TaTi.

RÔLE
- Répondre sur le fonctionnement de TaTi : installation, architecture, MCP, auth, déploiement, dépannage.
- Concis, listes courtes, étapes numérotées pour les procédures.
- Répondre dans la même langue que la question.

RAPPEL PRODUIT
- TaTi est une plateforme open source de copilote IA pour équipes delivery / SRE / ops.
- Connexion à des serveurs MCP (Model Context Protocol) configurés par l'utilisateur.
- App web + PostgreSQL + services MCP (souvent Docker). Auth locale optionnelle (TATI_AUTH_REQUIRED).
- Ce canal ne voit pas les outils MCP ni la base de l'utilisateur.

PAGES DOC (chemins typiques)
- FR : /guide/introduction, quick-start, architecture, deployment, configuration, mcp, security, troubleshooting
- EN : /en/guide/… — ZH : /zh/guide/…

RÈGLES
- Ne pas inventer : si incertain, renvoyer vers le guide ou le dépôt GitHub.
- Pas de promesses sur des versions futures.`;

type ChatMsg = { role: "user" | "assistant"; content: string };

function corsHeaders(env: Env): HeadersInit {
  const allowed = (env.ALLOWED_ORIGIN ?? "").trim();
  return {
    "Access-Control-Allow-Origin": allowed || "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
  };
}

function json(env: Env, body: unknown, status = 200) {
  const h = new Headers();
  h.set("Content-Type", "application/json");
  for (const [k, v] of Object.entries(corsHeaders(env))) {
    h.set(k, v);
  }
  return new Response(JSON.stringify(body), { status, headers: h });
}

const MAX_MSGS = 20;
const MAX_LEN = 12_000;

function sanitizeMessages(raw: unknown): Array<{ role: "user" | "assistant"; content: string }> {
  if (!Array.isArray(raw)) return [];
  const out: Array<{ role: "user" | "assistant"; content: string }> = [];
  for (const m of raw.slice(-MAX_MSGS)) {
    if (!m || typeof m !== "object") continue;
    const role = (m as ChatMsg).role;
    const content = String((m as ChatMsg).content ?? "").slice(0, MAX_LEN);
    if (role !== "user" && role !== "assistant") continue;
    if (!content.trim()) continue;
    out.push({ role, content });
  }
  return out;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname !== "/" && url.pathname !== "/chat") {
      return new Response("Not Found", { status: 404 });
    }

    const origin = request.headers.get("Origin") ?? "";
    const allowed = (env.ALLOWED_ORIGIN ?? "").trim();
    if (allowed && origin && origin !== allowed) {
      return new Response(JSON.stringify({ error: "Origin not allowed" }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(env) });
    }

    if (request.method !== "POST") {
      return json(env, { error: "Method not allowed" }, 405);
    }

    if (!env.ANTHROPIC_API_KEY?.trim()) {
      return json(
        env,
        { ok: false, code: "NOT_CONFIGURED", error: "ANTHROPIC_API_KEY manquant sur le Worker" },
        503,
      );
    }

    let body: { messages?: unknown };
    try {
      body = (await request.json()) as { messages?: unknown };
    } catch {
      return json(env, { error: "Invalid JSON" }, 400);
    }

    const history = sanitizeMessages(body.messages);
    if (history.length === 0 || history[history.length - 1]?.role !== "user") {
      return json(env, { error: "messages must end with a user message" }, 400);
    }

    const model = env.ANTHROPIC_MODEL?.trim() || "claude-sonnet-4-5-20250929";

    const upstream = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model,
        max_tokens: 4096,
        stream: true,
        system: SYSTEM,
        messages: history,
      }),
    });

    if (!upstream.ok || !upstream.body) {
      const txt = await upstream.text().catch(() => "");
      return json(env, { error: `Anthropic ${upstream.status}: ${txt.slice(0, 300)}` }, upstream.status);
    }

    const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();
    const writer = writable.getWriter();
    const enc = new TextEncoder();
    const dec = new TextDecoder();

    void (async () => {
      const reader = upstream.body!.getReader();
      let buf = "";
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          let sep: number;
          while ((sep = buf.indexOf("\n\n")) !== -1) {
            const block = buf.slice(0, sep);
            buf = buf.slice(sep + 2);
            for (const line of block.split("\n")) {
              if (!line.startsWith("data: ")) continue;
              const data = line.slice(6).trim();
              if (!data) continue;
              try {
                const evt = JSON.parse(data) as {
                  type?: string;
                  delta?: { type?: string; text?: string };
                };
                if (evt.type === "content_block_delta" && evt.delta?.type === "text_delta") {
                  const text = evt.delta.text ?? "";
                  if (text) {
                    await writer.write(
                      enc.encode(`data: ${JSON.stringify({ type: "token", content: text })}\n\n`),
                    );
                  }
                } else if (evt.type === "error") {
                  await writer.write(
                    enc.encode(
                      `data: ${JSON.stringify({ type: "error", message: "Stream error" })}\n\n`,
                    ),
                  );
                }
              } catch {
                /* ignore ligne SSE invalide */
              }
            }
          }
        }
        await writer.write(enc.encode(`data: ${JSON.stringify({ type: "done" })}\n\n`));
      } catch (e) {
        const msg = e instanceof Error ? e.message : "stream failed";
        await writer.write(enc.encode(`data: ${JSON.stringify({ type: "error", message: msg })}\n\n`));
        await writer.write(enc.encode(`data: ${JSON.stringify({ type: "done" })}\n\n`));
      } finally {
        await writer.close();
      }
    })();

    const headers = new Headers({
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });
    for (const [k, v] of Object.entries(corsHeaders(env))) {
      headers.set(k, v);
    }

    return new Response(readable, { headers });
  },
};
