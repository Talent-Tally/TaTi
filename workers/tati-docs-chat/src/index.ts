/**
 * Relais documentation TaTi → Anthropic (streaming SSE).
 * Secret : ANTHROPIC_API_KEY (Secrets Store ou wrangler secret).
 */

export interface Env {
  ANTHROPIC_API_KEY: string;
  ANTHROPIC_MODEL?: string;
  /** Origine autorisée (ex. https://talent-tally.github.io). Vide = * */
  ALLOWED_ORIGIN?: string;
}

const SYSTEM = `Tu es l'assistant officiel de la documentation TaTi.

PÉRIMÈTRE STRICT (OBLIGATOIRE)
- Tu réponds UNIQUEMENT aux questions sur la plateforme TaTi : présentation du produit, architecture, installation, configuration, déploiement, MCP, authentification, sécurité, dépannage lié à TaTi.
- Pour toute question hors sujet (autres outils sans lien, devoirs, sujets généraux, code arbitraire, politique, etc.), réponds en UNE courte phrase que tu es limité à la documentation TaTi et n’apporte AUCUNE réponse au hors-sujet. Ne dérive pas.

STYLE
- Réponds dans la même langue que la question (français, anglais, chinois, etc.).
- Concis, listes courtes, étapes numérotées pour les procédures.
- Ne promets pas de fonctionnalités futures. Si tu n’es pas certain, renvoie vers le guide concerné ou le dépôt https://github.com/Talent-Tally/TaTi

RAPPEL PRODUIT
- TaTi est une plateforme open source de copilote IA pour équipes delivery / SRE / ops.
- Connexion à des serveurs MCP (Model Context Protocol) configurés par l’utilisateur.
- App web, PostgreSQL, services MCP (souvent Docker). Auth locale optionnelle (TATI_AUTH_REQUIRED).
- Cet assistant ne voit pas les outils MCP ni les données des utilisateurs.`;

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

async function* streamAnthropicText(body: ReadableStream<Uint8Array> | null): AsyncGenerator<string> {
  if (!body) return;
  const reader = body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      for (;;) {
        const nl = buf.indexOf("\n");
        if (nl < 0) break;
        const line = buf.slice(0, nl).trimEnd();
        buf = buf.slice(nl + 1);
        if (!line.startsWith("data:")) continue;
        const raw = line.slice(5).trim();
        if (!raw || raw === "[DONE]") continue;
        try {
          const ev = JSON.parse(raw) as {
            type?: string;
            delta?: { type?: string; text?: string };
          };
          if (
            ev.type === "content_block_delta" &&
            ev.delta?.type === "text_delta" &&
            typeof ev.delta.text === "string"
          ) {
            yield ev.delta.text;
          }
        } catch {
          /* ligne non JSON */
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
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
      return json(env, { error: "origin_not_allowed" }, 403);
    }

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(env) });
    }

    if (request.method !== "POST") {
      return json(env, { error: "method_not_allowed" }, 405);
    }

    let payload: { messages?: unknown };
    try {
      payload = (await request.json()) as { messages?: unknown };
    } catch {
      return json(env, { error: "invalid_json" }, 400);
    }

    const messages = sanitizeMessages(payload.messages);
    if (messages.length === 0) {
      return json(env, { error: "no_messages" }, 400);
    }

    const apiKey = env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return json(env, { error: "missing_api_key" }, 500);
    }

    const model = (env.ANTHROPIC_MODEL ?? "claude-sonnet-4-20250514").trim();

    const upstream = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model,
        max_tokens: 4096,
        stream: true,
        system: SYSTEM,
        messages: messages.map((m) => ({
          role: m.role,
          content: [{ type: "text", text: m.content }],
        })),
      }),
    });

    if (!upstream.ok) {
      const errText = await upstream.text().catch(() => "");
      return json(
        env,
        { error: "anthropic_error", status: upstream.status, detail: errText.slice(0, 500) },
        502,
      );
    }

    const stream = new ReadableStream({
      async start(controller) {
        const enc = new TextEncoder();
        const send = (obj: unknown) => {
          controller.enqueue(enc.encode(`data: ${JSON.stringify(obj)}\n\n`));
        };
        try {
          for await (const chunk of streamAnthropicText(upstream.body)) {
            send({ type: "token", text: chunk });
          }
          send({ type: "done" });
        } catch (e) {
          send({
            type: "error",
            message: e instanceof Error ? e.message : "stream_error",
          });
        } finally {
          controller.close();
        }
      },
    });

    const h = new Headers();
    h.set("Content-Type", "text/event-stream; charset=utf-8");
    h.set("Cache-Control", "no-cache");
    h.set("Connection", "keep-alive");
    for (const [k, v] of Object.entries(corsHeaders(env))) {
      h.set(k, v);
    }
    return new Response(stream, { headers: h });
  },
};
