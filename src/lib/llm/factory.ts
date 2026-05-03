// Factory: returns the right adapter based on provider config
import type { LlmAdapter, LlmProviderConfig } from "./types";
import { createOpenAiAdapter } from "./adapters/openai";
import { createAnthropicAdapter } from "./adapters/anthropic";
import { createOllamaAdapter } from "./adapters/ollama";

/** Première variable d’environnement non vide (usage typique : secrets Docker sans stockage en DB). */
function firstEnvKey(...names: string[]): string | undefined {
  for (const n of names) {
    const v = process.env[n]?.trim();
    if (v) return v;
  }
  return undefined;
}

function normalizeKind(kind: string | undefined): string {
  return String(kind ?? "")
    .toLowerCase()
    .trim();
}

export function getAdapter(provider: LlmProviderConfig): LlmAdapter {
  const kind = normalizeKind(provider.kind);
  switch (kind) {
    case "anthropic": {
      if (!provider.api_key) throw new Error("Clé API Anthropic manquante");
      return createAnthropicAdapter({ apiKey: provider.api_key });
    }
    case "openai": {
      if (!provider.api_key) throw new Error("Clé API OpenAI manquante");
      return createOpenAiAdapter({
        baseUrl: provider.base_url || "https://api.openai.com/v1",
        apiKey: provider.api_key,
      });
    }
    case "mistral": {
      if (!provider.api_key) throw new Error("Clé API Mistral manquante");
      return createOpenAiAdapter({
        baseUrl: provider.base_url || "https://api.mistral.ai/v1",
        apiKey: provider.api_key,
      });
    }
    case "gemini": {
      const apiKey =
        provider.api_key?.trim() ||
        firstEnvKey(
          "GEMINI_API_KEY",
          "GOOGLE_API_KEY",
          "GOOGLE_AI_API_KEY",
          "GOOGLE_GENERATIVE_AI_API_KEY",
        );
      if (!apiKey) {
        throw new Error(
          "Clé API Gemini absente en base. Va dans Paramètres → Google Gemini : colle la clé, Test puis la clé est enregistrée automatiquement après un test réussi (sinon clique Enregistrer), ou définis GEMINI_API_KEY sur le serveur.",
        );
      }
      return createOpenAiAdapter({
        baseUrl: provider.base_url || "https://generativelanguage.googleapis.com/v1beta/openai",
        apiKey,
      });
    }
    case "grok": {
      if (!provider.api_key) throw new Error("Clé API xAI manquante");
      return createOpenAiAdapter({
        baseUrl: provider.base_url || "https://api.x.ai/v1",
        apiKey: provider.api_key,
      });
    }
    case "deepseek": {
      if (!provider.api_key) throw new Error("Clé API DeepSeek manquante");
      return createOpenAiAdapter({
        baseUrl: provider.base_url || "https://api.deepseek.com/v1",
        apiKey: provider.api_key,
      });
    }
    case "cohere": {
      if (!provider.api_key) throw new Error("Clé API Cohere manquante");
      return createOpenAiAdapter({
        baseUrl: provider.base_url || "https://api.cohere.ai/compatibility/v1",
        apiKey: provider.api_key,
      });
    }
    case "huggingface": {
      if (!provider.api_key) throw new Error("Clé API Hugging Face manquante");
      return createOpenAiAdapter({
        baseUrl: provider.base_url || "https://router.huggingface.co/v1",
        apiKey: provider.api_key,
      });
    }
    case "nvidia": {
      if (!provider.api_key) throw new Error("Clé API NVIDIA manquante");
      return createOpenAiAdapter({
        baseUrl: provider.base_url || "https://integrate.api.nvidia.com/v1",
        apiKey: provider.api_key,
      });
    }
    case "perplexity": {
      if (!provider.api_key) throw new Error("Clé API Perplexity manquante");
      return createOpenAiAdapter({
        baseUrl: provider.base_url || "https://api.perplexity.ai",
        apiKey: provider.api_key,
      });
    }
    case "ollama": {
      if (!provider.base_url) throw new Error("URL Ollama manquante");
      return createOllamaAdapter({ baseUrl: provider.base_url });
    }
    default:
      throw new Error(`Provider inconnu : ${kind || provider.kind}`);
  }
}
