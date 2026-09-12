"use client";

import React, { useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
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
  const shouldReduceMotion = useReducedMotion();
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

  let attachmentName: string | null = null;
  let userText = message.content;
  if (isUser) {
    const match = message.content.match(/^\[Attachment:\s*(.+?)\](?:\n\n)?([\s\S]*)$/);
    if (match) {
      attachmentName = match[1];
      userText = match[2];
    }
  }

  const initialMotion = shouldReduceMotion
    ? { opacity: 0 }
    : { opacity: 0, y: 6, x: isUser ? 8 : -8 };

  const animateMotion = shouldReduceMotion
    ? { opacity: 1 }
    : { opacity: 1, y: 0, x: 0 };

  return (
    <motion.div
      initial={initialMotion}
      animate={animateMotion}
      transition={{ duration: 0.22, ease: [0.215, 0.61, 0.355, 1] }}
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
            <div>
              {attachmentName && (
                <div className="mb-2 inline-flex items-center gap-2 rounded-lg border border-cyan-500/30 bg-cyan-950/50 px-2.5 py-1 text-xs text-cyan-200 shadow-sm">
                  <span className="text-accent-cyan text-sm">📎</span>
                  <span className="font-mono text-[11px] font-medium truncate max-w-xs">{attachmentName}</span>
                </div>
              )}
              {userText && <p className="whitespace-pre-wrap">{userText}</p>}
            </div>
          ) : (
            <MarkdownContent content={message.content} />
          )}
        </div>

        {/* Source Citations for Assistant Responses */}
        {!isUser && message.citations && message.citations.length > 0 && (
          <div className="mt-3 border-t border-border-subtle/60 pt-2.5">
            <div className="flex items-center gap-1.5 text-[11px] font-medium text-text-muted">
              <span>📚</span>
              <span>Sources ({message.citations.length}):</span>
            </div>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {message.citations.map((citation, idx) => {
                let badgeText = citation.documentTitle;
                if (citation.pageNumber) badgeText += ` · p.${citation.pageNumber}`;
                else if (citation.slideNumber) badgeText += ` · slide ${citation.slideNumber}`;
                else if (citation.timestamp) badgeText += ` · ${citation.timestamp}`;

                return (
                  <details
                    key={citation.id || idx}
                    className="group/citation rounded-md border border-cyan-500/20 bg-cyan-950/30 text-[11px] transition-colors hover:border-cyan-400/40"
                  >
                    <summary className="flex cursor-pointer items-center gap-1.5 px-2.5 py-1 font-mono text-cyan-200 select-none">
                      <span className="text-[10px] text-accent-cyan">◈</span>
                      <span className="font-sans font-medium">{badgeText}</span>
                      {citation.score !== undefined && citation.score !== null && (
                        <span className="text-[10px] text-text-muted">
                          ({Math.round(citation.score * 100)}%)
                        </span>
                      )}
                    </summary>
                    <div className="border-t border-cyan-500/20 bg-surface-2/90 px-2.5 py-2 text-xs text-text-secondary leading-normal">
                      <p className="font-semibold text-[11px] text-cyan-300 mb-1">{citation.documentTitle}</p>
                      <p className="italic text-text-muted text-[11px] line-clamp-4">{citation.snippet}</p>
                    </div>
                  </details>
                );
              })}
            </div>
          </div>
        )}

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
    </motion.div>
  );
}

