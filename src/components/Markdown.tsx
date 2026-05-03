import React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Components } from "react-markdown";
import { MarkdownChart } from "@/components/MarkdownChart";
import { parseChartSpec } from "@/lib/chart-spec";

function isChartWrapper(el: unknown): boolean {
  return (
    React.isValidElement(el) &&
    typeof el.props === "object" &&
    el.props !== null &&
    "data-md-viz" in el.props &&
    (el.props as { "data-md-viz"?: string })["data-md-viz"] === "chart"
  );
}

const markdownComponents: Components = {
  pre({ children }) {
    const first = React.Children.toArray(children)[0];
    if (isChartWrapper(first)) {
      return <>{children}</>;
    }
    return <pre>{children}</pre>;
  },
  code(props) {
    const { className, children, ...rest } = props as typeof props & { inline?: boolean };
    const inline = Boolean((props as { inline?: boolean }).inline);
    const text = String(children).replace(/\n$/, "");
    if (!inline && /language-chart\b/.test(className ?? "")) {
      const parsed = parseChartSpec(text);
      if (parsed.ok) {
        return (
          <div className="not-prose" data-md-viz="chart">
            <MarkdownChart spec={parsed.spec} />
          </div>
        );
      }
      return (
        <div
          className="not-prose my-2 rounded border border-destructive/30 bg-destructive/10 p-2 text-xs text-destructive"
          data-md-viz="chart"
        >
          {parsed.error}
        </div>
      );
    }
    return (
      <code className={className} {...rest}>
        {children}
      </code>
    );
  },
};

export function Markdown({ children }: { children: string }) {
  return (
    <div className="prose-msg w-full min-w-0 text-sm">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
        {children}
      </ReactMarkdown>
    </div>
  );
}
