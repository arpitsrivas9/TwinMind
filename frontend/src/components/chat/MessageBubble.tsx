"use client";

import React, { useState } from "react";
import { Message } from "../../lib/api";
import { MarkdownContent } from "./MarkdownContent";

type MessageBubbleProps = {
  message: Message;
  isLatestAssistant?: boolean;
  onRegenerate?: () => void;
  disabledActions?: boolean;
};

export function MessageBubble({
  message,
  isLatestAssistant = false,
  onRegenerate,
  disabledActions = false,
}: MessageBubbleProps) {
  const [copied, setCopied] = useState(false);
  const isUser = message.role === "USER";
  const isFailed = message.status === "FAILED";

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Ignore copy error
    }
  };

  const formattedTime = new Date(message.createdAt).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <div
      className={`group flex w-full gap-3 px-4 py-3 transition-colors ${
        isUser ? "justify-end" : "justify-start"
      }`}
    >
      {!isUser && (
        <div className="relative mt-1 flex size-8 shrink-0 items-center justify-center rounded-full border border-cyan-400/30 bg-cyan-500/10 shadow-[0_0_12px_rgba(34,211,238,0.25)]">
          <span className="size-2 rounded-full bg-accent-cyan shadow-[0_0_8px_rgba(34,211,238,0.9)]" />
        </div>
      )}

      <div
        className={`relative flex max-w-3xl flex-col rounded-xl px-4 py-3 shadow-sm ${
          isUser
            ? "border border-cyan-500/20 bg-cyan-950/20 text-text-primary"
            : isFailed
            ? "border border-rose-500/30 bg-rose-950/20 text-rose-200"
            : "border border-border-subtle bg-surface-1/90 text-text-primary"
        }`}
      >
        <div className="mb-1.5 flex items-center justify-between gap-3 text-xs text-text-muted">
          <div className="flex items-center gap-2">
            <span className="font-medium text-text-secondary">
              {isUser ? "You" : "TwinMind"}
            </span>
            {!isUser && message.model && (
              <span className="rounded bg-surface-2 px-1.5 py-0.2 font-mono text-[10px] text-accent-cyan border border-border-subtle">
                {message.model}
              </span>
            )}
            {isFailed && (
              <span className="rounded bg-rose-500/20 px-1.5 py-0.2 text-[10px] text-rose-300">
                Failed
              </span>
            )}
          </div>
          <time dateTime={message.createdAt} className="text-[11px]">
            {formattedTime}
          </time>
        </div>

        <div className="text-sm leading-relaxed">
          {isUser ? (
            <p className="whitespace-pre-wrap">{message.content}</p>
          ) : (
            <MarkdownContent content={message.content} />
          )}
        </div>

        {/* Message action buttons */}
        <div className="mt-2 flex items-center justify-end gap-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
          <button
            type="button"
            onClick={handleCopy}
            disabled={disabledActions}
            className="flex items-center gap-1 rounded px-2 py-0.5 text-xs text-text-muted transition-colors hover:bg-surface-2 hover:text-text-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent-cyan"
            aria-label="Copy message content"
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

          {!isUser && isLatestAssistant && onRegenerate && (
            <button
              type="button"
              onClick={onRegenerate}
              disabled={disabledActions}
              className="flex items-center gap-1 rounded px-2 py-0.5 text-xs text-text-muted transition-colors hover:bg-surface-2 hover:text-text-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent-cyan disabled:opacity-50"
              aria-label="Regenerate assistant response"
            >
              <span>↺</span>
              <span>Regenerate</span>
            </button>
          )}
        </div>
      </div>

      {isUser && (
        <div className="mt-1 flex size-8 shrink-0 items-center justify-center rounded-full border border-border-default bg-surface-2 text-xs font-semibold text-text-secondary">
          U
        </div>
      )}
    </div>
  );
}

