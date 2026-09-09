"use client";

import React, { useEffect, useRef } from "react";
import { Message } from "../../lib/api";
import { MessageBubble } from "./MessageBubble";
import { MarkdownContent } from "./MarkdownContent";

type ChatAreaProps = {
  messages: Message[];
  isStreaming: boolean;
  streamingContent: string;
  streamingModel?: string;
  error: string | null;
  onClearError: () => void;
  onRegenerate: () => void;
  onPromptClick: (prompt: string) => void;
  loadingMessages?: boolean;
};

const STARTER_PROMPTS = [
  "How should I structure a modular microservice architecture in Node?",
  "Explain how vector embeddings and cosine similarity enable semantic search.",
  "Write a TypeScript utility that safely batches concurrent async operations.",
  "What are the best practices for secure JWT authentication in full-stack apps?",
];

export function ChatArea({
  messages,
  isStreaming,
  streamingContent,
  streamingModel,
  error,
  onClearError,
  onRegenerate,
  onPromptClick,
  loadingMessages = false,
}: ChatAreaProps) {
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const userScrolledUpRef = useRef(false);

  // Detect if user scrolled up
  const handleScroll = () => {
    if (!scrollContainerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollContainerRef.current;
    const isAtBottom = scrollHeight - (scrollTop + clientHeight) < 80;
    userScrolledUpRef.current = !isAtBottom;
  };

  // Auto-scroll when messages update or streaming content updates, unless user scrolled up
  useEffect(() => {
    if (!userScrolledUpRef.current) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, streamingContent]);

  if (loadingMessages) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center p-8 text-center">
        <div className="size-8 animate-spin rounded-full border-2 border-accent-cyan border-t-transparent" />
        <p className="mt-4 text-xs text-text-muted">Loading messages…</p>
      </div>
    );
  }

  if (messages.length === 0 && !isStreaming) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center p-6 text-center">
        <div className="tm-core-breathe relative flex size-20 items-center justify-center rounded-full border border-cyan-300/25 bg-cyan-300/5 shadow-[0_0_60px_rgba(34,211,238,0.15)]">
          <div className="tm-core-pulse size-10 rounded-full border border-cyan-200/40 bg-cyan-200/10" />
          <span className="absolute size-2 rounded-full bg-cyan-100 shadow-[0_0_12px_rgba(165,243,252,0.9)]" />
        </div>

        <h2 className="mt-6 text-xl font-semibold tracking-tight text-text-primary">
          Your cognitive space is clear
        </h2>
        <p className="mt-2 max-w-md text-sm text-text-secondary leading-relaxed">
          Think with TwinMind. Start with a question, an idea, or choose a starter below.
        </p>

        <div className="mt-8 grid max-w-xl gap-2.5 sm:grid-cols-2 text-left">
          {STARTER_PROMPTS.map((prompt) => (
            <button
              key={prompt}
              type="button"
              onClick={() => onPromptClick(prompt)}
              className="rounded-lg border border-border-subtle bg-surface-2/60 p-3 text-xs text-text-secondary transition-colors hover:border-accent-cyan/40 hover:bg-surface-2 hover:text-text-primary text-left"
            >
              {prompt}
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div
      ref={scrollContainerRef}
      onScroll={handleScroll}
      className="flex-1 overflow-y-auto py-4 space-y-1"
    >

      {/* Message feed */}
      {messages.map((message, index) => {
        const isLatestAssistant =
          message.role === "ASSISTANT" &&
          (index === messages.length - 1 ||
            (index === messages.length - 2 && messages[messages.length - 1].role === "USER"));

        return (
          <MessageBubble
            key={message.id}
            message={message}
            isLatestAssistant={isLatestAssistant}
            onRegenerate={onRegenerate}
            disabledActions={isStreaming}
          />
        );
      })}

      {/* Active streaming bubble */}
      {isStreaming && (
        <div className="group flex w-full justify-start gap-3 px-4 py-3">
          <div className="relative mt-1 flex size-8 shrink-0 items-center justify-center rounded-full border border-cyan-400/30 bg-cyan-500/10 shadow-[0_0_12px_rgba(34,211,238,0.25)]">
            <span className="size-2 rounded-full bg-accent-cyan animate-pulse shadow-[0_0_8px_rgba(34,211,238,0.9)]" />
          </div>

          <div className="relative flex max-w-3xl flex-col rounded-xl border border-border-subtle bg-surface-1/90 px-4 py-3 shadow-sm text-text-primary">
            <div className="mb-1.5 flex items-center justify-between gap-3 text-xs text-text-muted">
              <div className="flex items-center gap-2">
                <span className="font-medium text-text-secondary">TwinMind</span>
                {streamingModel && (
                  <span className="rounded bg-surface-2 px-1.5 py-0.2 font-mono text-[10px] text-accent-cyan border border-border-subtle">
                    {streamingModel}
                  </span>
                )}
                <span className="flex items-center gap-1 text-[10px] text-accent-cyan">
                  <span className="size-1.5 rounded-full bg-accent-cyan animate-ping" />
                  Generating…
                </span>
              </div>
            </div>

            <div className="text-sm leading-relaxed">
              {streamingContent ? (
                <MarkdownContent content={streamingContent} />
              ) : (
                <div className="flex items-center gap-1.5 py-2 text-xs text-text-muted">
                  <span className="size-2 rounded-full bg-accent-cyan animate-bounce" />
                  <span className="size-2 rounded-full bg-accent-cyan animate-bounce [animation-delay:0.2s]" />
                  <span className="size-2 rounded-full bg-accent-cyan animate-bounce [animation-delay:0.4s]" />
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Sticky Bottom Error Toast */}
      {error && (
        <div className="sticky bottom-2 mx-4 z-20 flex items-center justify-between rounded-xl border border-rose-500/40 bg-surface-1/95 px-4 py-3 text-xs text-rose-300 shadow-xl backdrop-blur-md">
          <div className="flex items-center gap-2.5">
            <span className="text-sm">⚠️</span>
            <span className="font-medium">{error}</span>
          </div>
          <button
            type="button"
            onClick={onClearError}
            className="rounded-lg px-2.5 py-1 text-xs font-semibold text-rose-400 hover:bg-rose-500/20 transition-colors"
          >
            Dismiss
          </button>
        </div>
      )}

      <div ref={bottomRef} />
    </div>
  );
}

