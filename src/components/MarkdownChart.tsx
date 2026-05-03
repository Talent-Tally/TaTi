import { useLayoutEffect, useRef, useState } from "react";
import {
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { ChartSpec } from "@/lib/chart-spec";
import { chartColors } from "@/lib/chart-spec";

/**
 * ResponsiveContainer se retrouve souvent avec une largeur mesurée à 0 dans une colonne flex
 * (bulle de chat) → zone « vide » sans barres. On impose largeur/hauteur en pixels mesurés.
 */
function useChartDimensions(heightPx: number) {
  const ref = useRef<HTMLDivElement>(null);
  const [dims, setDims] = useState({ width: 520, height: heightPx });

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;

    const read = () => {
      const w = el.getBoundingClientRect().width;
      const fallback =
        typeof window !== "undefined" ? Math.min(640, Math.max(280, window.innerWidth - 48)) : 520;
      const width = Number.isFinite(w) && w > 8 ? Math.floor(w) : fallback;
      setDims({ width: Math.max(width, 280), height: heightPx });
    };

    read();
    const ro = new ResizeObserver(read);
    ro.observe(el);
    window.addEventListener("resize", read);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", read);
    };
  }, [heightPx]);

  return { ref, width: dims.width, height: dims.height };
}

function buildRows(spec: Extract<ChartSpec, { type: "bar" | "line" }>) {
  const { categories, series } = spec;
  return categories.map((cat, i) => {
    const row: Record<string, string | number> = { __cat: cat };
    for (const s of series) {
      const raw = s.data[i];
      const n = typeof raw === "number" ? raw : Number(raw);
      row[s.name] = Number.isFinite(n) ? n : 0;
    }
    return row;
  });
}

/**
 * Barres en HTML/CSS : affichage fiable dans le chat (flex, overflow, Recharts souvent à largeur 0).
 */
function SimpleBarChartView({
  title,
  categories,
  series,
}: {
  title?: string;
  categories: string[];
  series: Array<{ name: string; data: number[] }>;
}) {
  const palette = chartColors();
  const primary = series[0];
  if (!primary) return null;
  const nums = primary.data.map((v) => {
    const n = typeof v === "number" ? v : Number(v);
    return Number.isFinite(n) ? n : 0;
  });
  const max = Math.max(...nums, 1);

  return (
    <figure className="chart-block my-3 w-full min-w-0 max-w-full rounded-lg border border-border bg-card/40 p-3 not-prose">
      {title ? (
        <figcaption className="mb-3 text-center text-sm font-medium text-foreground">
          {title}
        </figcaption>
      ) : null}
      {/* Grille à colonnes fixes : évite l’effet « escalier » du flex quand les libellés ont des largeurs différentes */}
      <div className="mt-1 flex w-full min-w-0 flex-col gap-2 px-0.5">
        {categories.map((cat, i) => {
          const v = nums[i] ?? 0;
          const pct = max > 0 ? (v / max) * 100 : 0;
          return (
            <div
              key={`${cat}-${i}`}
              className="grid w-full min-w-0 items-center gap-x-3 [grid-template-columns:minmax(0,9.5rem)_minmax(0,1fr)_3.25rem]"
            >
              <div
                className="min-w-0 truncate text-left text-[11px] leading-snug text-foreground/90"
                title={cat}
              >
                {cat}
              </div>
              <div className="min-w-0 overflow-hidden rounded-md bg-muted/70">
                <div
                  className="h-7 rounded-md shadow-sm"
                  style={{
                    width: `${Math.max(pct, v > 0 ? 2 : 0)}%`,
                    minWidth: v > 0 ? "4px" : undefined,
                    backgroundColor: palette[i % palette.length],
                  }}
                />
              </div>
              <div className="shrink-0 text-right text-[11px] tabular-nums leading-none text-muted-foreground">
                {v}
              </div>
            </div>
          );
        })}
      </div>
      {series.length > 1 ? (
        <p className="mt-2 text-[10px] text-muted-foreground">
          Série affichée : {primary.name} (+ {series.length - 1} autre(s) — voir tableau pour le
          détail)
        </p>
      ) : null}
    </figure>
  );
}

function MarkdownPieChartInner({ spec }: { spec: Extract<ChartSpec, { type: "pie" }> }) {
  const palette = chartColors();
  const pieH = 260;
  const { ref, width, height } = useChartDimensions(pieH);

  return (
    <figure className="chart-block my-3 rounded-lg border border-border bg-card/40 p-3 not-prose">
      {spec.title ? (
        <figcaption className="mb-2 text-center text-sm font-medium text-foreground">
          {spec.title}
        </figcaption>
      ) : null}
      <div ref={ref} className="h-[260px] w-full min-w-0 overflow-x-auto">
        <PieChart width={width} height={height}>
          <Pie
            data={spec.data}
            dataKey="value"
            nameKey="name"
            cx={width / 2}
            cy={height / 2}
            outerRadius={Math.min(width, height) / 2 - 24}
            label
            isAnimationActive={false}
          >
            {spec.data.map((_, i) => (
              <Cell key={i} fill={palette[i % palette.length]} stroke="transparent" />
            ))}
          </Pie>
          <Tooltip
            contentStyle={{
              background: "#1e1b2e",
              border: "1px solid rgba(255,255,255,0.12)",
              borderRadius: "8px",
              fontSize: "12px",
              color: "#e2e8f0",
            }}
          />
        </PieChart>
      </div>
    </figure>
  );
}

type BarLineSpec = Extract<ChartSpec, { type: "bar" | "line" }>;

function MarkdownLineChartInner({ spec }: { spec: BarLineSpec & { type: "line" } }) {
  const palette = chartColors();
  const rows = buildRows(spec);
  const keys = spec.series.map((s) => s.name);
  const manyCats = rows.length > 6;
  const bottomMargin = manyCats ? 72 : 16;
  const chartH = 300;
  const { ref, width, height } = useChartDimensions(chartH);

  const inner = (
    <>
      <CartesianGrid stroke="#64748b55" strokeDasharray="3 3" opacity={0.8} />
      <XAxis
        dataKey="__cat"
        tick={{ fill: "#94a3b8", fontSize: 10 }}
        interval={0}
        angle={manyCats ? -40 : 0}
        textAnchor={manyCats ? "end" : "middle"}
        height={manyCats ? 70 : 30}
      />
      <YAxis tick={{ fill: "#94a3b8", fontSize: 11 }} width={44} />
      <Tooltip
        contentStyle={{
          background: "#1e1b2e",
          border: "1px solid rgba(255,255,255,0.12)",
          borderRadius: "8px",
          fontSize: "12px",
          color: "#e2e8f0",
        }}
      />
      <Legend wrapperStyle={{ fontSize: "11px", color: "#94a3b8" }} />
      {keys.map((k, i) => (
        <Line
          key={`${k}-${i}`}
          type="monotone"
          dataKey={k}
          name={k}
          stroke={palette[i % palette.length]}
          strokeWidth={2}
          dot={{ r: 3 }}
          isAnimationActive={false}
        />
      ))}
    </>
  );

  return (
    <figure className="chart-block my-3 w-full min-w-0 max-w-full rounded-lg border border-border bg-card/40 p-3 not-prose">
      {spec.title ? (
        <figcaption className="mb-2 text-center text-sm font-medium text-foreground">
          {spec.title}
        </figcaption>
      ) : null}
      <div ref={ref} className="min-h-[300px] w-full min-w-0 overflow-x-auto">
        <LineChart
          width={width}
          height={height}
          data={rows}
          margin={{ top: 8, right: 12, left: 4, bottom: bottomMargin }}
        >
          {inner}
        </LineChart>
      </div>
    </figure>
  );
}

function MarkdownBarLineInner({ spec }: { spec: Extract<ChartSpec, { type: "bar" | "line" }> }) {
  if (spec.type === "bar") {
    return (
      <SimpleBarChartView title={spec.title} categories={spec.categories} series={spec.series} />
    );
  }
  return <MarkdownLineChartInner spec={{ ...spec, type: "line" }} />;
}

export function MarkdownChart({ spec }: { spec: ChartSpec }) {
  if (spec.type === "pie") {
    return <MarkdownPieChartInner spec={spec} />;
  }
  return <MarkdownBarLineInner spec={spec} />;
}
