"use client";

import React, { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import Prism from "prismjs";

// Load common language support in Prism
import "prismjs/components/prism-javascript";
import "prismjs/components/prism-typescript";
import "prismjs/components/prism-jsx";
import "prismjs/components/prism-tsx";
import "prismjs/components/prism-python";
import "prismjs/components/prism-bash";
import "prismjs/components/prism-json";
import "prismjs/components/prism-sql";
import "prismjs/components/prism-markdown";
import "prismjs/components/prism-css";

const CodeBlock = React.memo(function CodeBlock({
  language,
  code,
}: {
  language: string;
  code: string;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Ignore copy error
    }
  };

  const cleanLang = (language || "").toLowerCase().trim();
  let highlightedHtml = "";

  if (cleanLang && Prism.languages[cleanLang]) {
    try {
      highlightedHtml = Prism.highlight(code, Prism.languages[cleanLang], cleanLang);
    } catch {
      highlightedHtml = "";
    }
  }

  return (
    <div className="group relative my-3 overflow-hidden rounded-lg border border-border-subtle bg-surface-2 text-sm font-mono">
      <div className="flex items-center justify-between border-b border-border-subtle bg-surface-1/70 px-4 py-1.5 text-xs text-text-muted">
        <span className="font-semibold uppercase tracking-wider text-accent-cyan">
          {cleanLang || "code"}
        </span>
        <button
          type="button"
          onClick={handleCopy}
          className="flex items-center gap-1.5 rounded px-2 py-0.5 text-xs font-medium text-text-secondary transition-colors hover:bg-surface-3 hover:text-text-primary focus-visible:outline-2 focus-visible:outline-accent-cyan"
          aria-label="Copy code block"
        >
          {copied ? (
            <>
              <span className="text-emerald-400">✓</span>
              <span className="text-emerald-300">Copied</span>
            </>
          ) : (
            <>
              <span>📋</span>
              <span>Copy</span>
            </>
          )}
        </button>
      </div>

      <div className="overflow-x-auto p-4 leading-relaxed text-text-primary">
        {highlightedHtml ? (
          <pre className="m-0 bg-transparent p-0">
            <code
              className={`language-${cleanLang}`}
              dangerouslySetInnerHTML={{ __html: highlightedHtml }}
            />
          </pre>
        ) : (
          <pre className="m-0 bg-transparent p-0">
            <code>{code}</code>
          </pre>
        )}
      </div>
    </div>
  );
});

export const MarkdownContent = React.memo(function MarkdownContent({ content }: { content: string }) {
  return (
    <div className="prose prose-invert max-w-none text-text-primary leading-relaxed break-words">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }) => (
            <h1 className="mt-4 mb-2 text-2xl font-bold tracking-tight text-text-primary border-b border-border-subtle pb-1">
              {children}
            </h1>
          ),
          h2: ({ children }) => (
            <h2 className="mt-3 mb-2 text-xl font-semibold tracking-tight text-text-primary">
              {children}
            </h2>
          ),
          h3: ({ children }) => (
            <h3 className="mt-3 mb-1.5 text-lg font-medium text-text-primary">
              {children}
            </h3>
          ),
          h4: ({ children }) => (
            <h4 className="mt-2 mb-1 text-base font-medium text-text-primary">
              {children}
            </h4>
          ),
          p: ({ children }) => <p className="my-2 leading-7">{children}</p>,
          ul: ({ children }) => <ul className="my-2 ml-5 list-disc space-y-1">{children}</ul>,
          ol: ({ children }) => <ol className="my-2 ml-5 list-decimal space-y-1">{children}</ol>,
          li: ({ children }) => <li className="leading-relaxed">{children}</li>,
          blockquote: ({ children }) => (
            <blockquote className="my-3 border-l-4 border-accent-cyan/60 bg-surface-2/40 px-4 py-2 italic text-text-secondary rounded-r">
              {children}
            </blockquote>
          ),
          a: ({ href, children }) => (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-accent-cyan underline decoration-accent-cyan/40 underline-offset-2 transition-colors hover:text-accent-cyan-strong hover:decoration-accent-cyan"
            >
              {children}
            </a>
          ),
          table: ({ children }) => (
            <div className="my-3 overflow-x-auto rounded-lg border border-border-subtle">
              <table className="min-w-full divide-y divide-border-subtle text-left text-sm">
                {children}
              </table>
            </div>
          ),
          thead: ({ children }) => <thead className="bg-surface-2">{children}</thead>,
          th: ({ children }) => (
            <th className="px-3.5 py-2 font-semibold text-text-primary">{children}</th>
          ),
          td: ({ children }) => (
            <td className="border-t border-border-subtle px-3.5 py-2 text-text-secondary">{children}</td>
          ),
          code({ className, children, ...props }) {
            const match = /language-(\w+)/.exec(className || "");
            const codeString = String(children).replace(/\n$/, "");
            const isInline = !match && !codeString.includes("\n");

            if (isInline) {
              return (
                <code
                  className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-xs text-accent-cyan-strong border border-border-subtle"
                  {...props}
                >
                  {children}
                </code>
              );
            }

            return <CodeBlock language={match ? match[1] : ""} code={codeString} />;
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
});


