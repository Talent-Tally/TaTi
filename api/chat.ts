type ChatMsg = { role: "user" | "assistant"; content: string };

type ChatBody = {
  messages?: ChatMsg[];
  locale?: string;
  page?: {
    title?: string;
    path?: string;
  };
};

const DEFAULT_ALLOWED_ORIGINS = [
  "https://www.tati.blog",
  "https://talent-tally.github.io",
  "http://localhost:5174",
  "http://localhost:5173",
];

function getAllowedOrigins(): string[] {
  const fromEnv = (process.env.ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return [...new Set([...DEFAULT_ALLOWED_ORIGINS, ...fromEnv])];
}

function corsHeaders(origin: string | null): HeadersInit {
  const allowed = getAllowedOrigins();
  const allowOrigin = origin && allowed.includes(origin) ? origin : allowed[0];
  return {
    "access-control-allow-origin": allowOrigin,
    "access-control-allow-methods": "POST, OPTIONS",
    "access-control-allow-headers": "content-type",
    vary: "origin",
  };
}

function json(data: unknown, status = 200, origin: string | null = null): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders(origin),
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

function sse(data: unknown): string {
  return `data: ${JSON.stringify(data)}\n\n`;
}

function buildSystemPrompt(locale?: string, pagePath?: string): string {
  const lang = locale?.startsWith("en")
    ? "english"
    : locale?.startsWith("zh")
      ? "chinese"
      : "french";

  return [
    "You are the TaTi documentation assistant.",
    `Primary response language: ${lang}.`,
    "Answer only from TaTi docs scope: installation, MCP, architecture, security, troubleshooting.",
    "If uncertain, say what is missing and point to the closest relevant guide page.",
    `Current docs page path: ${pagePath ?? "unknown"}`,
    "Be concise and actionable.",
  ].join("\n");
}

export const config = { runtime: "edge" };

export default async function handler(req: Request): Promise<Response> {
  const origin = req.headers.get("origin");

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(origin) });
  }

  if (req.method !== "POST") {
    return json({ error: "method_not_allowed" }, 405, origin);
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return json({ error: "missing_anthropic_api_key" }, 503, origin);
  }

  let body: ChatBody;
  try {
    body = (await req.json()) as ChatBody;
  } catch {
    return json({ error: "invalid_json" }, 400, origin);
  }

  const messages = (body.messages ?? [])
    .filter((m): m is ChatMsg => !!m && (m.role === "user" || m.role === "assistant"))
    .map((m) => ({ role: m.role, content: m.content?.trim() ?? "" }))
    .filter((m) => m.content.length > 0)
    .slice(-24);

  if (messages.length === 0) {
    return json({ error: "empty_messages" }, 400, origin);
  }

  const upstream = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-20250514",
      max_tokens: 900,
      stream: true,
      system: buildSystemPrompt(body.locale, body.page?.path),
      messages,
    }),
  });

  if (!upstream.ok || !upstream.body) {
    const detail = await upstream.text().catch(() => "");
    return json(
      {
        error: "upstream_error",
        status: upstream.status,
        detail: detail.slice(0, 400),
      },
      502,
      origin,
    );
  }

  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const reader = upstream.body!.getReader();
      let raw = "";

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          raw += decoder.decode(value, { stream: true });
          const lines = raw.split("\n");
          raw = lines.pop() ?? "";

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            const payload = line.slice(6).trim();
            if (!payload || payload === "[DONE]") continue;

            try {
              const evt = JSON.parse(payload) as {
                type?: string;
                delta?: { type?: string; text?: string };
                error?: { message?: string };
              };

              if (
                evt.type === "content_block_delta" &&
                evt.delta?.type === "text_delta" &&
                evt.delta.text
              ) {
                controller.enqueue(encoder.encode(sse({ type: "token", content: evt.delta.text })));
              } else if (evt.type === "error" && evt.error?.message) {
                controller.enqueue(
                  encoder.encode(sse({ type: "error", message: evt.error.message })),
                );
              }
            } catch {}
          }
        }
      } catch {
        controller.enqueue(
          encoder.encode(sse({ type: "error", message: "stream_read_error_from_upstream" })),
        );
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      ...corsHeaders(origin),
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-store",
      connection: "keep-alive",
    },
  });
}
