/**
 * Déduit un ChartSpec exploitable par MarkdownChart à partir du résultat brut d’un outil MCP
 * (PostgreSQL, JSON tabulaire, etc.) — sans passer par le markdown ```chart du modèle.
 */
import type { ChartSpec } from "@/lib/chart-spec";

const MAX_POINTS = 35;

function parseMaybeJson(text: string): unknown {
  const t = text.trim();
  if (!t.startsWith("{") && !t.startsWith("[")) return null;
  try {
    return JSON.parse(t);
  } catch {
    return null;
  }
}

function asObjectRows(arr: unknown[]): Record<string, unknown>[] | null {
  if (arr.length === 0) return null;
  const first = arr[0];
  if (!first || typeof first !== "object" || Array.isArray(first)) return null;
  return arr as Record<string, unknown>[];
}

/** Extrait un tableau d’objets depuis les formes courantes (MCP / Postgres / JSON). */
export function extractTabularRows(result: unknown): Record<string, unknown>[] | null {
  if (result === null || result === undefined) return null;

  if (typeof result === "string") {
    const parsed = parseMaybeJson(result);
    return parsed !== null ? extractTabularRows(parsed) : null;
  }

  if (Array.isArray(result)) {
    return asObjectRows(result);
  }

  if (typeof result !== "object") return null;
  const o = result as Record<string, unknown>;

  for (const key of ["rows", "data", "records", "result", "items"]) {
    const v = o[key];
    if (Array.isArray(v)) {
      const inner = extractTabularRows(v);
      if (inner) return inner;
      const rows = asObjectRows(v);
      if (rows) return rows;
    }
  }

  if (Array.isArray(o.content)) {
    for (const block of o.content) {
      if (!block || typeof block !== "object") continue;
      const b = block as Record<string, unknown>;
      if (b.type === "text" && typeof b.text === "string") {
        const parsed = parseMaybeJson(b.text);
        const fromText = parsed !== null ? extractTabularRows(parsed) : null;
        if (fromText) return fromText;
      }
    }
  }

  return null;
}

function pickCategoryAndValueKeys(row: Record<string, unknown>): {
  catKey: string;
  numKey: string;
} | null {
  const keys = Object.keys(row);
  if (keys.length < 2) return null;

  const catKey =
    keys.find((k) => /^(name|label|category|client|nom|title|libelle|client_name)$/i.test(k)) ??
    keys.find((k) => typeof row[k] === "string");

  const numKey =
    keys.find((k) =>
      /^(value|values|count|total|sum|amount|ca|chiffre|montant|nombre|rides|courses)$/i.test(k),
    ) ??
    keys.find((k) => /montant|total|ca|chiffre|count|nombre|courses|rides/i.test(String(k))) ??
    keys.find((k) => typeof row[k] === "number") ??
    keys.find((k) => {
      const n = Number(row[k]);
      return Number.isFinite(n);
    });

  if (!catKey || !numKey || catKey === numKey) return null;
  return { catKey, numKey };
}

/**
 * Si le résultat ressemble à un tableau catégorie → nombre, retourne un graphique en barres.
 */
export function inferBarChartFromToolResult(result: unknown, title?: string): ChartSpec | null {
  const rows = extractTabularRows(result);
  if (!rows || rows.length === 0) return null;

  const keys = pickCategoryAndValueKeys(rows[0]);
  if (!keys) return null;

  const { catKey, numKey } = keys;
  const pairs: { label: string; value: number }[] = [];
  for (const row of rows) {
    const label = String(row[catKey] ?? "");
    const n = Number(row[numKey]);
    if (!Number.isFinite(n)) continue;
    pairs.push({ label, value: n });
  }
  if (pairs.length === 0) return null;

  pairs.sort((a, b) => b.value - a.value);
  const top = pairs.slice(0, MAX_POINTS);

  const metric = numKey.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) || "Valeur";

  return {
    type: "bar",
    title: title ?? metric,
    categories: top.map((p) => p.label),
    series: [{ name: metric, data: top.map((p) => p.value) }],
  };
}
