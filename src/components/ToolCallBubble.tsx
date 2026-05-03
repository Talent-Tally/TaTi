import { useMemo, useState } from "react";
import { ChevronRight, Wrench, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import { MarkdownChart } from "@/components/MarkdownChart";
import { inferBarChartFromToolResult } from "@/lib/infer-chart-from-result";
import { cn } from "@/lib/utils";

export interface ToolCallDisplay {
  id: string;
  name: string;
  serverName: string;
  arguments: unknown;
  result?: unknown;
  error?: string;
  status: "running" | "done" | "error";
}

export function ToolCallBubble({ call }: { call: ToolCallDisplay }) {
  const [open, setOpen] = useState(false);

  const autoChart = useMemo(() => {
    if (call.status !== "done" || call.error) return null;
    return inferBarChartFromToolResult(call.result, undefined);
  }, [call.status, call.error, call.result]);

  return (
    <div className="my-2 rounded-lg border border-border bg-muted/40 text-sm overflow-x-auto">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2 px-3 py-2 hover:bg-muted/60 transition-colors text-left"
      >
        <ChevronRight
          className={cn(
            "h-3.5 w-3.5 text-muted-foreground transition-transform",
            open && "rotate-90",
          )}
        />
        <Wrench className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="font-mono text-xs font-medium">{call.name}</span>
        <span className="text-xs text-muted-foreground">via {call.serverName}</span>
        <span className="ml-auto">
          {call.status === "running" && (
            <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
          )}
          {call.status === "done" && <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />}
          {call.status === "error" && <AlertCircle className="h-3.5 w-3.5 text-destructive" />}
        </span>
      </button>
      {autoChart ? (
        <div className="border-t border-border/50 bg-background/30 px-2 pb-2 pt-2">
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1 px-1">
            Graphique (données outil)
          </div>
          <MarkdownChart spec={autoChart} />
        </div>
      ) : null}
      {open && (
        <div className="px-3 pb-3 pt-1 space-y-2 border-t border-border/50">
          <div>
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">
              Arguments
            </div>
            <pre className="bg-background/60 rounded p-2 text-xs overflow-x-auto font-mono">
              {JSON.stringify(call.arguments, null, 2)}
            </pre>
          </div>
          {call.status !== "running" && (
            <div>
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">
                {call.error ? "Error" : "Result"}
              </div>
              <pre
                className={cn(
                  "rounded p-2 text-xs overflow-x-auto max-h-72 font-mono",
                  call.error ? "bg-destructive/10 text-destructive" : "bg-background/60",
                )}
              >
                {call.error ??
                  (typeof call.result === "string"
                    ? call.result
                    : JSON.stringify(call.result, null, 2))}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
