/**
 * Schéma JSON pour les blocs ```chart du Markdown (réponses assistant).
 * Pensé pour être émis par un LLM après résultats d’outils (SQL, agrégations).
 */

export type ChartSpec =
  | {
      type: "bar" | "line";
      title?: string;
      categories: string[];
      series: Array<{ name: string; data: number[] }>;
    }
  | {
      type: "pie";
      title?: string;
      data: Array<{ name: string; value: number }>;
    };

/**
 * Couleurs en hex : les `var(--chart-n)` ne sont pas toujours appliquées correctement
 * sur les `<rect>` / `<path>` SVG générés par Recharts (graphe vide à l’écran).
 */
const CHART_PALETTE_HEX = ["#a78bfa", "#22d3ee", "#34d399", "#fbbf24", "#fb7185"];

export function chartColors(): string[] {
  return [...CHART_PALETTE_HEX];
}

/**
 * Les modèles renvoient souvent d'autres formes (labels, datasets Chart.js, tableaux
 * d'enregistrements { name, value }) — on les ramène au schéma attendu pour que le graphe s'affiche.
 */
function normalizeChartPayload(o: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...o };
  const type = out.type;

  if (!Array.isArray(out.categories)) {
    if (Array.isArray(out.labels)) out.categories = out.labels;
    else if (Array.isArray(out.x)) out.categories = out.x;
  }

  if (Array.isArray(out.series)) {
    out.series = (out.series as unknown[]).map((s) => {
      if (!s || typeof s !== "object") {
        return { name: "Série", data: [] as number[] };
      }
      const so = s as Record<string, unknown>;
      const name = String(so.name ?? so.label ?? "Série");
      let raw = so.data;
      if (!Array.isArray(raw) && Array.isArray(so.values)) raw = so.values;
      if (!Array.isArray(raw) && Array.isArray(so.y)) raw = so.y;
      const data = Array.isArray(raw)
        ? raw.map((v) => {
            const n = Number(v);
            return Number.isFinite(n) ? n : 0;
          })
        : [];
      return { name, data };
    });
  }

  if (!Array.isArray(out.series) && Array.isArray(out.datasets)) {
    const series: Array<{ name: string; data: number[] }> = [];
    for (const d of out.datasets as unknown[]) {
      if (!d || typeof d !== "object") continue;
      const ds = d as Record<string, unknown>;
      const name = String(ds.label ?? ds.name ?? "Série");
      const rawData = ds.data;
      if (!Array.isArray(rawData)) continue;
      series.push({
        name,
        data: rawData.map((v) => {
          const n = Number(v);
          return Number.isFinite(n) ? n : 0;
        }),
      });
    }
    if (series.length > 0) out.series = series;
  }

  const cats = out.categories;
  if (!Array.isArray(out.series) && Array.isArray(out.values) && Array.isArray(cats)) {
    out.series = [
      {
        name: String(out.seriesName ?? out.metricName ?? out.label ?? "Valeur"),
        data: (out.values as unknown[]).map((v) => {
          const n = Number(v);
          return Number.isFinite(n) ? n : 0;
        }),
      },
    ];
  }

  if (!Array.isArray(out.series) && Array.isArray(out.y) && Array.isArray(cats)) {
    out.series = [
      {
        name: String(out.seriesName ?? "Valeur"),
        data: (out.y as unknown[]).map((v) => {
          const n = Number(v);
          return Number.isFinite(n) ? n : 0;
        }),
      },
    ];
  }

  const wantsPie = type === "pie";
  const needsBarCoercion =
    !wantsPie &&
    (!Array.isArray(out.series) || !Array.isArray(out.categories)) &&
    Array.isArray(out.data) &&
    (out.data as unknown[]).length > 0;

  if (needsBarCoercion) {
    const dataArr = out.data as unknown[];
    const row0 = dataArr[0];
    if (row0 && typeof row0 === "object") {
      const r0 = row0 as Record<string, unknown>;
      const keys = Object.keys(r0);
      const catKey =
        keys.find((k) => /^(name|label|category|client|nom|title|x)$/i.test(k)) ??
        keys.find((k) => typeof r0[k] === "string");
      const numKey =
        keys.find((k) =>
          /^(value|values|count|rides|courses|total|nombre|montant|sum|y)$/i.test(k),
        ) ??
        keys.find((k) => /courses|rides|count|total|nombre|montant|valeur/i.test(String(k))) ??
        keys.find((k) => typeof r0[k] === "number");
      if (catKey && numKey && catKey !== numKey) {
        const categories: string[] = [];
        const nums: number[] = [];
        for (const row of dataArr) {
          if (!row || typeof row !== "object") continue;
          const rr = row as Record<string, unknown>;
          categories.push(String(rr[catKey] ?? ""));
          const n = Number(rr[numKey]);
          nums.push(Number.isFinite(n) ? n : 0);
        }
        if (categories.length > 0) {
          out.categories = categories;
          out.series = [
            {
              name: String(out.seriesName ?? out.metricName ?? "Courses"),
              data: nums,
            },
          ];
          if (out.type === undefined || out.type === null) {
            out.type = "bar";
          }
        }
      }
    }
  }

  return out;
}

export function parseChartSpec(
  raw: string,
): { ok: true; spec: ChartSpec } | { ok: false; error: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.trim());
  } catch {
    return { ok: false, error: "JSON invalide dans le bloc chart." };
  }
  if (!parsed || typeof parsed !== "object") {
    return { ok: false, error: "Le bloc chart doit être un objet JSON." };
  }
  const o = normalizeChartPayload(parsed as Record<string, unknown>);
  const t = o.type;
  if (t === "pie") {
    const data = o.data;
    if (!Array.isArray(data) || data.length === 0) {
      return {
        ok: false,
        error: 'Pour type "pie", le champ "data" doit être un tableau non vide.',
      };
    }
    const rows: Array<{ name: string; value: number }> = [];
    for (const row of data) {
      if (!row || typeof row !== "object") continue;
      const r = row as Record<string, unknown>;
      const name = String(r.name ?? "");
      const value = Number(r.value);
      if (!Number.isFinite(value)) continue;
      rows.push({ name, value });
    }
    if (rows.length === 0) {
      return { ok: false, error: 'Chaque entrée "pie" doit avoir name et value numérique.' };
    }
    return {
      ok: true,
      spec: {
        type: "pie",
        title: typeof o.title === "string" ? o.title : undefined,
        data: rows,
      },
    };
  }
  if (t === "bar" || t === "line") {
    const categories = o.categories;
    const series = o.series;
    if (!Array.isArray(categories) || categories.length === 0) {
      return {
        ok: false,
        error:
          'Il manque un tableau non vide "categories" (aliases acceptés : "labels", "x"). Exemple : {"type":"bar","categories":["A","B"],"series":[{"name":"Courses","data":[1,2]}]}',
      };
    }
    if (!Array.isArray(series) || series.length === 0) {
      return {
        ok: false,
        error: "Au moins une série est requise dans « series » (ou « datasets » style Chart.js).",
      };
    }
    const catStr = categories.map((c) => String(c));
    const n = catStr.length;
    const ser: Array<{ name: string; data: number[] }> = [];
    for (const s of series) {
      if (!s || typeof s !== "object") continue;
      const so = s as Record<string, unknown>;
      const name = String(so.name ?? " série ");
      const data = so.data;
      if (!Array.isArray(data)) continue;
      const nums = data.map((v) => Number(v)).map((v) => (Number.isFinite(v) ? v : 0));
      while (nums.length < n) nums.push(0);
      ser.push({ name, data: nums.slice(0, n) });
    }
    if (ser.length === 0) {
      return { ok: false, error: 'Chaque série doit avoir "name" et "data" (tableau de nombres).' };
    }
    return {
      ok: true,
      spec: {
        type: t,
        title: typeof o.title === "string" ? o.title : undefined,
        categories: catStr,
        series: ser,
      },
    };
  }
  return { ok: false, error: 'Le champ "type" doit être "bar", "line" ou "pie".' };
}
