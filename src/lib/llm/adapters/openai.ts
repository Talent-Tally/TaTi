// OpenAI-compatible adapter (works for OpenAI, Mistral, and any OpenAI-compatible API)
import type { LlmAdapter, LlmMessage, LlmStreamChunk, LlmTool, LlmToolCall } from "../types";

/**
 * Certains modèles OpenAI (ex. gpt-5) n'acceptent que la température par défaut (1) :
 * envoyer 0.7 produit HTTP 400 "Unsupported value: 'temperature'".
 */
function shouldIncludeTemperatureParam(model: string): boolean {
  const id = model.toLowerCase();
  if (id.startsWith("gpt-5")) return false;
  if (/^o[0-9]/.test(id)) return false;
  return true;
}

/**
 * OpenAI exige : tout message `tool` doit suivre un `assistant` qui contient le `tool_call`
 * correspondant. L’historique DB peut être incomplet (outil sans ligne assistant, ou assistant
 * sans tool_calls) → HTTP 400. On supprime les tools orphelins et on retire les tool_calls
 * d’un assistant si les réponses outil attendues manquent avant le prochain tour utilisateur.
 */
export function sanitizeOpenAiMessageChain(messages: LlmMessage[]): LlmMessage[] {
  const out: LlmMessage[] = [];
  let pendingAssistantIdx: number | null = null;
  let pendingIds: Set<string> | null = null;

  const stripIncompleteAssistantTools = () => {
    if (pendingAssistantIdx === null || pendingIds === null || pendingIds.size === 0) {
      pendingAssistantIdx = null;
      pendingIds = null;
      return;
    }
    const cur = out[pendingAssistantIdx];
    if (cur?.role === "assistant") {
      out[pendingAssistantIdx] = { role: "assistant", content: cur.content };
    }
    pendingAssistantIdx = null;
    pendingIds = null;
  };

  for (const m of messages) {
    if (m.role === "system") {
      stripIncompleteAssistantTools();
      out.push(m);
      continue;
    }
    if (m.role === "user") {
      stripIncompleteAssistantTools();
      out.push(m);
      continue;
    }
    if (m.role === "assistant") {
      stripIncompleteAssistantTools();
      if (m.toolCalls && m.toolCalls.length > 0) {
        out.push(m);
        pendingAssistantIdx = out.length - 1;
        pendingIds = new Set(m.toolCalls.map((tc) => tc.id));
      } else {
        out.push(m);
      }
      continue;
    }
    if (m.role === "tool") {
      const id = m.toolCallId ?? "";
      if (pendingIds?.has(id)) {
        pendingIds.delete(id);
        out.push(m);
        if (pendingIds.size === 0) {
          pendingAssistantIdx = null;
          pendingIds = null;
        }
      }
    }
  }
  stripIncompleteAssistantTools();
  return out;
}

export function createOpenAiAdapter(opts: {
  baseUrl: string; // e.g. https://api.openai.com/v1
  apiKey: string;
}): LlmAdapter {
  return {
    async *streamChat({ model, messages, tools, temperature, signal, toolChoice }) {
      const cleaned = sanitizeOpenAiMessageChain(messages);
      const oaiMessages = cleaned.map((m) => {
        if (m.role === "tool") {
          return {
            role: "tool" as const,
            content: m.content,
            tool_call_id: m.toolCallId,
          };
        }
        if (m.role === "assistant") {
          const calls =
            m.toolCalls && m.toolCalls.length > 0
              ? m.toolCalls.map((tc) => ({
                  id: tc.id,
                  type: "function" as const,
                  function: { name: tc.name, arguments: JSON.stringify(tc.arguments) },
                }))
              : undefined;
          // OpenAI rejette explicitement tool_calls: [] (minimum length 1).
          return calls
            ? {
                role: "assistant" as const,
                content: m.content,
                tool_calls: calls,
              }
            : {
                role: "assistant" as const,
                content: m.content,
              };
        }
        return { role: m.role, content: m.content };
      });

      const oaiTools =
        tools.length > 0
          ? tools.map((t) => ({
              type: "function" as const,
              function: { name: t.name, description: t.description, parameters: t.parameters },
            }))
          : undefined;

      const url = `${opts.baseUrl.replace(/\/$/, "")}/chat/completions`;

      const buildPayload = (includeRequiredToolChoice: boolean): Record<string, unknown> => {
        const payload: Record<string, unknown> = {
          model,
          messages: oaiMessages,
          tools: oaiTools,
          stream: true,
        };
        if (shouldIncludeTemperatureParam(model)) {
          payload.temperature = temperature;
        }
        if (
          oaiTools &&
          oaiTools.length > 0 &&
          includeRequiredToolChoice &&
          toolChoice === "required"
        ) {
          payload.tool_choice = "required";
        }
        if (oaiTools && oaiTools.length > 0 && toolChoice === "none") {
          payload.tool_choice = "none";
        }
        return payload;
      };

      async function* readSse(res: Response): AsyncGenerator<LlmStreamChunk> {
        if (!res.body) return;
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buf = "";

        const toolBuf = new Map<number, { id: string; name: string; args: string }>();

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });

          let nlIdx: number;
          while ((nlIdx = buf.indexOf("\n")) !== -1) {
            const line = buf.slice(0, nlIdx).trim();
            buf = buf.slice(nlIdx + 1);
            if (!line || line.startsWith(":")) continue;
            if (!line.startsWith("data: ")) continue;
            const data = line.slice(6).trim();
            if (data === "[DONE]") {
              for (const [, tc] of toolBuf) {
                let parsed: Record<string, unknown> = {};
                try {
                  parsed = tc.args ? JSON.parse(tc.args) : {};
                } catch {
                  parsed = {};
                }
                yield {
                  type: "tool_call",
                  toolCall: { id: tc.id, name: tc.name, arguments: parsed },
                };
              }
              return;
            }
            try {
              const obj = JSON.parse(data);
              const delta = obj.choices?.[0]?.delta;
              if (delta?.content) {
                yield { type: "text", text: delta.content };
              }
              if (delta?.tool_calls) {
                for (const tc of delta.tool_calls) {
                  const idx = tc.index ?? 0;
                  let entry = toolBuf.get(idx);
                  if (!entry) {
                    entry = { id: tc.id ?? `call_${idx}_${Date.now()}`, name: "", args: "" };
                    toolBuf.set(idx, entry);
                  }
                  if (tc.id) entry.id = tc.id;
                  if (tc.function?.name) entry.name += tc.function.name;
                  if (tc.function?.arguments) entry.args += tc.function.arguments;
                }
              }
              const finish = obj.choices?.[0]?.finish_reason;
              if (finish === "tool_calls" || finish === "stop") {
                // wait for [DONE]
              }
            } catch {
              // skip malformed line
            }
          }
        }

        for (const [, tc] of toolBuf) {
          let parsed: Record<string, unknown> = {};
          try {
            parsed = tc.args ? JSON.parse(tc.args) : {};
          } catch {
            parsed = {};
          }
          yield {
            type: "tool_call",
            toolCall: { id: tc.id, name: tc.name, arguments: parsed },
          };
        }
      }

      let res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${opts.apiKey}`,
        },
        body: JSON.stringify(buildPayload(true)),
        signal,
      });

      if (!res.ok) {
        const errTxt = await res.text().catch(() => "");
        if (toolChoice === "required" && res.status === 400) {
          res = await fetch(url, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${opts.apiKey}`,
            },
            body: JSON.stringify(buildPayload(false)),
            signal,
          });
          if (!res.ok || !res.body) {
            const err2 = await res.text().catch(() => "");
            yield {
              type: "error",
              error: `HTTP ${res.status}: ${err2.slice(0, 400)} (après repli sans tool_choice requis — erreur initiale: ${errTxt.slice(0, 200)})`,
            };
            return;
          }
          yield* readSse(res);
          return;
        }
        yield { type: "error", error: `HTTP ${res.status}: ${errTxt.slice(0, 400)}` };
        return;
      }

      if (!res.body) {
        yield { type: "error", error: "Réponse vide du provider (pas de corps SSE)." };
        return;
      }

      yield* readSse(res);
    },
  };
}

// Helpers exposed for testing/listing
export type { LlmMessage, LlmStreamChunk, LlmTool, LlmToolCall };
