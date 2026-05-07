<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";
import { useData } from "vitepress";

type Msg = { role: "user" | "assistant"; content: string };

const workerOrigin = import.meta.env.VITE_DOCS_CHAT_WORKER_URL as string | undefined;
const { lang, page } = useData();
const SUGGESTIONS = [
  "Comment installer TaTi ?",
  "Comment ajouter un connecteur MCP ?",
  "Quelles variables .env sont obligatoires ?",
  "Comment fonctionne l'authentification ?",
];

const configured = computed(() => Boolean(workerOrigin?.trim()));
const chatUrl = computed(() => {
  const o = workerOrigin?.replace(/\/$/, "") ?? "";
  return o ? `${o}/chat` : "";
});

const open = ref(false);
const loading = ref(false);
const input = ref("");
const messages = ref<Msg[]>([
  {
    role: "assistant",
    content:
      "Bonjour ! Je peux t'aider sur l'installation, la configuration MCP, l'architecture et la sécurité de TaTi.",
  },
]);
const error = ref<string | null>(null);
const listRef = ref<HTMLElement | null>(null);

watch(
  () => messages.value.length,
  async () => {
    await nextTick();
    const el = listRef.value;
    if (el) el.scrollTop = el.scrollHeight;
  },
);

function toggle() {
  open.value = !open.value;
  if (open.value) {
    void nextTick(() => {
      const el = listRef.value;
      if (el) el.scrollTop = el.scrollHeight;
    });
  }
}

async function send(rawText?: string) {
  const text = (rawText ?? input.value).trim();
  if (!text || loading.value) return;
  if (!chatUrl.value) {
    error.value =
      "Assistant non configuré. Définis VITE_DOCS_CHAT_WORKER_URL vers ton endpoint backend (ex: Vercel /api/chat).";
    return;
  }

  error.value = null;
  const history: Msg[] = [...messages.value, { role: "user", content: text }];
  messages.value = [...history, { role: "assistant", content: "" }];
  input.value = "";
  loading.value = true;

  const assistantIdx = messages.value.length - 1;
  let buf = "";

  try {
    const res = await fetch(chatUrl.value, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: history,
        locale: lang.value,
        page: {
          title: page.value.title,
          path: page.value.relativePath,
        },
      }),
    });

    if (res.status === 503) {
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      error.value =
        j.error ?? "Assistant indisponible : vérifie que ton backend a bien ANTHROPIC_API_KEY.";
      messages.value = messages.value.slice(0, -2);
      loading.value = false;
      return;
    }

    if (!res.ok || !res.body) {
      const t = await res.text().catch(() => "");
      throw new Error(`HTTP ${res.status}: ${t.slice(0, 120)}`);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let raw = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      raw += decoder.decode(value, { stream: true });
      let sep: number;
      while ((sep = raw.indexOf("\n\n")) !== -1) {
        const block = raw.slice(0, sep);
        raw = raw.slice(sep + 2);
        for (const line of block.split("\n")) {
          if (!line.startsWith("data: ")) continue;
          try {
            const evt = JSON.parse(line.slice(6)) as {
              type?: string;
              content?: string;
              message?: string;
            };
            if (evt.type === "token" && evt.content) {
              buf += evt.content;
              const cur = buf;
              messages.value = messages.value.map((m, i) =>
                i === assistantIdx ? { ...m, content: cur } : m,
              );
            } else if (evt.type === "error" && evt.message) {
              error.value = evt.message;
            }
          } catch {
            /* ignore */
          }
        }
      }
    }
  } catch (e) {
    error.value = e instanceof Error ? e.message : "Erreur réseau";
    messages.value = messages.value.slice(0, -2);
    input.value = text;
  } finally {
    loading.value = false;
  }
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    void send();
  }
}

function formatContent(text: string): string {
  const escaped = text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");

  return escaped
    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(
      /\[(.*?)\]\((https?:\/\/[^\s)]+)\)/g,
      '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>',
    )
    .replace(/\n/g, "<br>");
}
</script>

<template>
  <div class="docs-ai-root">
    <button
      v-if="!open"
      type="button"
      class="docs-ai-fab"
      :class="{ 'docs-ai-fab-disabled': !configured }"
      :aria-label="
        configured
          ? 'Ouvrir l’assistant documentation TaTi'
          : 'Assistant non configuré (VITE_DOCS_CHAT_WORKER_URL manquant)'
      "
      @click="toggle"
    >
      <svg class="docs-ai-sparkles" viewBox="0 0 32 32" aria-hidden="true" focusable="false">
        <!-- Etoile en forme de croix -->
        <path
          class="docs-ai-star-cross"
          d="M16 4c.5 0 .9.4.9.9v7.7h7.7c.5 0 .9.4.9.9s-.4.9-.9.9h-7.7v7.7c0 .5-.4.9-.9.9s-.9-.4-.9-.9v-7.7H7.4c-.5 0-.9-.4-.9-.9s.4-.9.9-.9h7.7V4.9c0-.5.4-.9.9-.9z"
        />
        <path
          class="docs-ai-star-cross-soft"
          d="M23.6 6.8c.3.3.3.9 0 1.2l-2.5 2.5 2.5 2.5c.3.3.3.9 0 1.2s-.9.3-1.2 0l-2.5-2.5-2.5 2.5c-.3.3-.9.3-1.2 0s-.3-.9 0-1.2l2.5-2.5-2.5-2.5c-.3-.3-.3-.9 0-1.2s.9-.3 1.2 0l2.5 2.5L22.4 6.8c.3-.3.9-.3 1.2 0z"
        />
      </svg>
    </button>

    <div v-else class="docs-ai-panel" role="dialog" aria-label="Assistant documentation TaTi">
      <div class="docs-ai-head">
        <span class="docs-ai-title">Assistant TaTi</span>
        <button type="button" class="docs-ai-close" aria-label="Fermer" @click="toggle">×</button>
      </div>
      <p class="docs-ai-hint">
        Pose des questions sur TaTi (installation, MCP, déploiement…). Réponses générées par IA ;
        vérifie les guides pour les détails officiels.
      </p>
      <div ref="listRef" class="docs-ai-messages">
        <div v-for="(m, i) in messages" :key="i" class="docs-ai-msg" :data-role="m.role">
          <span class="docs-ai-msg-label">{{ m.role === "user" ? "Vous" : "Assistant" }}</span>
          <div
            class="docs-ai-msg-body"
            v-html="
              m.content ? formatContent(m.content) : loading && i === messages.length - 1 ? '…' : ''
            "
          />
        </div>
        <div v-if="messages.length === 1" class="docs-ai-suggestions">
          <button
            v-for="suggestion in SUGGESTIONS"
            :key="suggestion"
            type="button"
            class="docs-ai-chip"
            @click="send(suggestion)"
          >
            {{ suggestion }}
          </button>
        </div>
        <div v-if="error" class="docs-ai-err">{{ error }}</div>
      </div>
      <div class="docs-ai-input-row">
        <textarea
          v-model="input"
          class="docs-ai-input"
          rows="2"
          placeholder="Ex. Comment ajouter un serveur MCP Postgres ?"
          :disabled="loading"
          @keydown="onKeydown"
        />
        <button
          type="button"
          class="docs-ai-send"
          :disabled="loading || !input.trim()"
          @click="send"
        >
          Envoyer
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.docs-ai-root {
  position: fixed;
  z-index: 2147483646;
  right: 1.25rem;
  bottom: 1.25rem;
  font-family: var(--vp-font-family-base);
  font-size: 14px;
}

.docs-ai-fab {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 3.25rem;
  height: 3.25rem;
  padding: 0;
  border-radius: 50%;
  border: 1px solid color-mix(in srgb, var(--vp-c-brand-1) 35%, var(--vp-c-divider));
  background: linear-gradient(
    145deg,
    var(--vp-c-bg) 0%,
    color-mix(in srgb, var(--vp-c-brand-soft) 40%, var(--vp-c-bg)) 100%
  );
  color: var(--vp-c-brand-1);
  box-shadow:
    0 4px 14px color-mix(in srgb, var(--vp-c-text-1) 12%, transparent),
    0 0 0 1px color-mix(in srgb, var(--vp-c-brand-1) 20%, transparent);
  cursor: pointer;
  transition:
    transform 0.15s ease,
    box-shadow 0.15s ease;
}

.docs-ai-fab:hover {
  transform: scale(1.06);
  box-shadow:
    0 6px 20px color-mix(in srgb, var(--vp-c-text-1) 16%, transparent),
    0 0 0 1px color-mix(in srgb, var(--vp-c-brand-1) 35%, transparent);
}

.docs-ai-fab-disabled {
  opacity: 0.82;
}

.docs-ai-sparkles {
  width: 1.8rem;
  height: 1.8rem;
  overflow: visible;
}

.docs-ai-star-cross,
.docs-ai-star-cross-soft {
  fill: currentColor;
}

.docs-ai-star-cross {
  opacity: 1;
}

.docs-ai-star-cross-soft {
  opacity: 0.38;
}

.docs-ai-panel {
  width: min(100vw - 2rem, 400px);
  max-height: min(72vh, 580px);
  display: flex;
  flex-direction: column;
  border-radius: 14px;
  border: 1px solid var(--vp-c-divider);
  background: var(--vp-c-bg);
  box-shadow: var(--vp-shadow-3);
  overflow: hidden;
}

.docs-ai-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.65rem 0.85rem;
  border-bottom: 1px solid var(--vp-c-divider);
  background: var(--vp-c-bg-soft);
}

.docs-ai-title {
  font-weight: 700;
  color: var(--vp-c-text-1);
}

.docs-ai-close {
  border: none;
  background: transparent;
  font-size: 1.5rem;
  line-height: 1;
  cursor: pointer;
  color: var(--vp-c-text-2);
  padding: 0 0.25rem;
}

.docs-ai-hint {
  margin: 0;
  padding: 0.5rem 0.85rem;
  font-size: 12px;
  color: var(--vp-c-text-2);
  border-bottom: 1px solid var(--vp-c-divider);
}

.docs-ai-messages {
  flex: 1;
  overflow-y: auto;
  padding: 0.65rem 0.85rem;
  min-height: 140px;
  max-height: 320px;
}

.docs-ai-empty {
  color: var(--vp-c-text-3);
  font-size: 13px;
}

.docs-ai-msg {
  margin-bottom: 0.75rem;
}

.docs-ai-msg-label {
  display: block;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--vp-c-text-3);
  margin-bottom: 0.2rem;
}

.docs-ai-msg-body {
  white-space: pre-wrap;
  word-break: break-word;
  color: var(--vp-c-text-1);
  font-size: 13px;
  line-height: 1.45;
}

.docs-ai-msg[data-role="user"] .docs-ai-msg-body {
  background: var(--vp-c-bg-soft);
  padding: 0.45rem 0.55rem;
  border-radius: 8px;
}

.docs-ai-msg-body :deep(a) {
  color: var(--vp-c-brand-1);
  text-decoration: underline;
}

.docs-ai-msg-body :deep(code) {
  font-family: var(--vp-font-family-mono);
  font-size: 12px;
  background: color-mix(in srgb, var(--vp-c-text-1) 8%, transparent);
  padding: 1px 4px;
  border-radius: 4px;
}

.docs-ai-suggestions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 0.15rem;
}

.docs-ai-chip {
  border: 1px solid var(--vp-c-divider);
  background: var(--vp-c-bg-soft);
  color: var(--vp-c-text-1);
  border-radius: 999px;
  font-size: 12px;
  padding: 0.22rem 0.58rem;
  cursor: pointer;
}

.docs-ai-chip:hover {
  border-color: color-mix(in srgb, var(--vp-c-brand-1) 35%, var(--vp-c-divider));
}

.docs-ai-err {
  margin-top: 0.5rem;
  font-size: 12px;
  color: var(--vp-c-red);
}

.docs-ai-input-row {
  display: flex;
  gap: 0.5rem;
  padding: 0.65rem 0.85rem;
  border-top: 1px solid var(--vp-c-divider);
  background: var(--vp-c-bg-soft);
  align-items: flex-end;
}

.docs-ai-input {
  flex: 1;
  resize: none;
  border: 1px solid var(--vp-c-divider);
  border-radius: 8px;
  padding: 0.45rem 0.55rem;
  font: inherit;
  background: var(--vp-c-bg);
  color: var(--vp-c-text-1);
}

.docs-ai-send {
  flex-shrink: 0;
  padding: 0.45rem 0.75rem;
  border-radius: 8px;
  border: none;
  background: var(--vp-c-brand-1);
  color: var(--vp-c-bg);
  font-weight: 600;
  cursor: pointer;
}

.docs-ai-send:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
