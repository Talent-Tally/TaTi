<script setup lang="ts">
/**
 * Assistant doc TaTi — relais vers Worker Cloudflare (clé Anthropic jamais côté client).
 * Build / CI : définir VITE_DOCS_CHAT_WORKER_URL (sans slash final, sans /chat).
 */
import { computed, nextTick, ref, watch } from "vue";

const workerOrigin = import.meta.env.VITE_DOCS_CHAT_WORKER_URL as string | undefined;

const open = ref(false);
const input = ref("");
const loading = ref(false);
const error = ref<string | null>(null);
const messages = ref<{ role: "user" | "assistant"; content: string }[]>([]);
const listRef = ref<HTMLElement | null>(null);

const canUse = computed(() => Boolean(workerOrigin?.trim()));

const chatUrl = computed(() => {
  const o = workerOrigin?.trim();
  if (!o) return "";
  return `${o.replace(/\/$/, "")}/chat`;
});

function scrollToBottom() {
  nextTick(() => {
    const el = listRef.value;
    if (el) el.scrollTop = el.scrollHeight;
  });
}

watch(messages, scrollToBottom, { deep: true });

async function send() {
  const text = input.value.trim();
  if (!text || loading.value || !chatUrl.value) return;

  error.value = null;
  messages.value.push({ role: "user", content: text });
  input.value = "";
  loading.value = true;

  const assistantIndex = messages.value.length;
  messages.value.push({ role: "assistant", content: "" });

  try {
    const res = await fetch(chatUrl.value, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: messages.value.slice(0, -1) }),
    });

    if (!res.ok || !res.body) {
      const t = await res.text().catch(() => "");
      throw new Error(t || `HTTP ${res.status}`);
    }

    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let sep;
      while ((sep = buf.indexOf("\n\n")) >= 0) {
        const block = buf.slice(0, sep).trim();
        buf = buf.slice(sep + 2);
        for (const line of block.split("\n")) {
          if (!line.startsWith("data:")) continue;
          const raw = line.slice(5).trim();
          if (!raw) continue;
          try {
            const ev = JSON.parse(raw) as {
              type?: string;
              text?: string;
              message?: string;
            };
            if (ev.type === "token" && typeof ev.text === "string") {
              const m = messages.value[assistantIndex];
              if (m) m.content += ev.text;
            } else if (ev.type === "error") {
              throw new Error(ev.message ?? "stream_error");
            }
          } catch (e) {
            if (e instanceof SyntaxError) continue;
            throw e;
          }
        }
      }
    }
  } catch (e) {
    error.value = e instanceof Error ? e.message : "Erreur réseau";
    messages.value.pop();
    if (messages.value.at(-1)?.role === "user") messages.value.pop();
  } finally {
    loading.value = false;
    scrollToBottom();
  }
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    send();
  }
}
</script>

<template>
  <div v-if="canUse" class="tati-doc-ai">
    <button
      v-if="!open"
      type="button"
      class="tati-doc-ai__fab"
      aria-label="Ouvrir l’assistant documentation TaTi"
      @click="open = true"
    >
      <span class="tati-doc-ai__fab-icon" aria-hidden="true">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path
            d="M12 2L13.09 8.26L19 7L14.74 12L19 17L13.09 15.74L12 22L10.91 15.74L5 17L9.26 12L5 7L10.91 8.26L12 2Z"
            stroke="currentColor"
            stroke-width="1.5"
            stroke-linejoin="round"
          />
          <path
            d="M19 3L19.5 5.5L22 6L19.5 6.5L19 9L18.5 6.5L16 6L18.5 5.5L19 3Z"
            stroke="currentColor"
            stroke-width="1.2"
            stroke-linejoin="round"
          />
        </svg>
      </span>
      <span class="tati-doc-ai__fab-label">Assistant</span>
    </button>

    <div v-else class="tati-doc-ai__panel" role="dialog" aria-modal="false" aria-label="Assistant documentation">
      <header class="tati-doc-ai__head">
        <div class="tati-doc-ai__head-text">
          <h2 class="tati-doc-ai__title">Assistant TaTi</h2>
          <p class="tati-doc-ai__subtitle">Documentation — questions sur la plateforme uniquement</p>
        </div>
        <button type="button" class="tati-doc-ai__close" aria-label="Fermer" @click="open = false">×</button>
      </header>

      <p class="tati-doc-ai__disclaimer">
        Réponses générées — périmètre TaTi uniquement ; pour les opérations sensibles, suivre les guides et le dépôt
        <a href="https://github.com/Talent-Tally/TaTi" rel="noopener noreferrer">GitHub</a>. Présentation inspirée des
        docs produit (OpenMetadata, Dagster)&nbsp;: réponses courtes, orientées procédure.
      </p>

      <div ref="listRef" class="tati-doc-ai__messages">
        <p v-if="messages.length === 0" class="tati-doc-ai__empty">
          Pose une question sur l’installation, le déploiement, MCP, la configuration ou l’architecture TaTi.
        </p>
        <div
          v-for="(m, i) in messages"
          :key="i"
          class="tati-doc-ai__msg"
          :class="m.role === 'user' ? 'tati-doc-ai__msg--user' : 'tati-doc-ai__msg--assistant'"
        >
          <span class="tati-doc-ai__msg-role">{{ m.role === "user" ? "Vous" : "TaTi" }}</span>
          <div class="tati-doc-ai__msg-body">{{ m.content }}</div>
        </div>
      </div>

      <p v-if="error" class="tati-doc-ai__error">{{ error }}</p>

      <div class="tati-doc-ai__composer">
        <textarea
          v-model="input"
          class="tati-doc-ai__input"
          rows="2"
          placeholder="Ex. Comment configurer les serveurs MCP ?"
          :disabled="loading"
          @keydown="onKeydown"
        />
        <button type="button" class="tati-doc-ai__send" :disabled="loading || !input.trim()" @click="send">
          {{ loading ? "…" : "Envoyer" }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.tati-doc-ai {
  --tati-ai-radius: var(--om-radius-lg, 16px);
  --tati-ai-shadow: var(--om-shadow-card, 0 8px 24px rgba(15, 23, 42, 0.12));
  font-family: var(--vp-font-family-base);
  z-index: 9999;
}

.tati-doc-ai__fab {
  position: fixed;
  right: clamp(1rem, 3vw, 1.75rem);
  bottom: clamp(1rem, 3vw, 1.75rem);
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.65rem 1rem 0.65rem 0.75rem;
  border: 1px solid var(--vp-c-divider);
  border-radius: 999px;
  background: var(--vp-c-bg-elv);
  color: var(--vp-c-brand-1);
  box-shadow: var(--tati-ai-shadow);
  cursor: pointer;
  font-size: 0.875rem;
  font-weight: 600;
  transition:
    transform 0.2s var(--om-ease, ease),
    box-shadow 0.2s ease;
}

.tati-doc-ai__fab:hover {
  transform: translateY(-2px);
  box-shadow: 0 12px 28px rgba(15, 23, 42, 0.14);
}

.tati-doc-ai__fab-icon {
  display: flex;
  color: var(--vp-c-brand-2);
}

.tati-doc-ai__fab-label {
  color: var(--vp-c-text-1);
}

.tati-doc-ai__panel {
  position: fixed;
  right: clamp(1rem, 3vw, 1.75rem);
  bottom: clamp(1rem, 3vw, 1.75rem);
  width: min(420px, calc(100vw - 2rem));
  max-height: min(640px, 72vh);
  display: flex;
  flex-direction: column;
  border-radius: var(--tati-ai-radius);
  border: 1px solid var(--vp-c-divider);
  background: var(--vp-c-bg-elv);
  box-shadow: var(--tati-ai-shadow);
  overflow: hidden;
}

.tati-doc-ai__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.75rem;
  padding: 1rem 1rem 0.75rem;
  border-bottom: 1px solid var(--vp-c-divider);
  background: var(--vp-c-bg-soft);
}

.tati-doc-ai__title {
  margin: 0;
  font-size: 1rem;
  font-weight: 700;
  letter-spacing: -0.02em;
  color: var(--vp-c-text-1);
}

.tati-doc-ai__subtitle {
  margin: 0.2rem 0 0;
  font-size: 0.75rem;
  color: var(--vp-c-text-2);
  line-height: 1.35;
}

.tati-doc-ai__close {
  flex-shrink: 0;
  width: 2rem;
  height: 2rem;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: var(--vp-c-text-2);
  font-size: 1.35rem;
  line-height: 1;
  cursor: pointer;
}

.tati-doc-ai__close:hover {
  background: var(--vp-c-bg-soft);
  color: var(--vp-c-text-1);
}

.tati-doc-ai__disclaimer {
  margin: 0;
  padding: 0.65rem 1rem;
  font-size: 0.7rem;
  line-height: 1.45;
  color: var(--vp-c-text-2);
  background: var(--vp-c-brand-soft);
  border-bottom: 1px solid var(--vp-c-divider);
}

.tati-doc-ai__disclaimer a {
  color: var(--vp-c-brand-1);
  text-decoration: underline;
  text-underline-offset: 2px;
}

.tati-doc-ai__messages {
  flex: 1;
  min-height: 180px;
  max-height: 360px;
  overflow-y: auto;
  padding: 0.75rem 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.tati-doc-ai__empty {
  margin: 0;
  font-size: 0.8125rem;
  color: var(--vp-c-text-2);
  line-height: 1.5;
}

.tati-doc-ai__msg {
  border-radius: var(--om-radius-md, 12px);
  padding: 0.6rem 0.75rem;
  font-size: 0.8125rem;
  line-height: 1.5;
}

.tati-doc-ai__msg--user {
  align-self: flex-end;
  max-width: 92%;
  background: var(--vp-c-brand-soft);
  border: 1px solid rgba(6, 182, 212, 0.25);
}

.tati-doc-ai__msg--assistant {
  align-self: stretch;
  background: var(--vp-c-bg-soft);
  border: 1px solid var(--vp-c-divider);
}

.tati-doc-ai__msg-role {
  display: block;
  font-size: 0.65rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--vp-c-text-2);
  margin-bottom: 0.35rem;
}

.tati-doc-ai__msg-body {
  white-space: pre-wrap;
  word-break: break-word;
  color: var(--vp-c-text-1);
}

.tati-doc-ai__error {
  margin: 0;
  padding: 0 1rem;
  font-size: 0.75rem;
  color: #b91c1c;
}

.tati-doc-ai__composer {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding: 0.75rem 1rem 1rem;
  border-top: 1px solid var(--vp-c-divider);
  background: var(--vp-c-bg-soft);
}

.tati-doc-ai__input {
  width: 100%;
  resize: none;
  border-radius: 10px;
  border: 1px solid var(--vp-c-divider);
  padding: 0.5rem 0.65rem;
  font: inherit;
  font-size: 0.8125rem;
  background: var(--vp-c-bg-elv);
  color: var(--vp-c-text-1);
}

.tati-doc-ai__input:focus {
  outline: 2px solid var(--vp-c-brand-2);
  outline-offset: 0;
}

.tati-doc-ai__send {
  align-self: flex-end;
  padding: 0.45rem 1rem;
  border: none;
  border-radius: 999px;
  font-size: 0.8125rem;
  font-weight: 600;
  cursor: pointer;
  background: var(--vp-c-brand-1);
  color: #fff;
}

.tati-doc-ai__send:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
</style>
