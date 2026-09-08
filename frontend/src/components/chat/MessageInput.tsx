"use client";

import React, { useRef, useEffect, useState, KeyboardEvent } from "react";
import { ModelSelector } from "./ModelSelector";

type MessageInputProps = {
  onSend: (content: string, modelId: string) => void;
  onAbort?: () => void;
  isStreaming: boolean;
  selectedModel: string;
  onSelectModel: (modelId: string) => void;
  disabled?: boolean;
};

const MAX_CHARACTERS = 12000;

export function MessageInput({
  onSend,
  onAbort,
  isStreaming,
  selectedModel,
  onSelectModel,
  disabled = false,
}: MessageInputProps) {
  const [content, setContent] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // Auto-resize textarea height
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${Math.min(
        textareaRef.current.scrollHeight,
        200,
      )}px`;
    }
  }, [content]);

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleSubmit = () => {
    const trimmed = content.trim();
    if (!trimmed || isStreaming || disabled) return;
    onSend(trimmed, selectedModel);
    setContent("");
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  };

  const charCount = content.length;
  const isNearLimit = charCount > MAX_CHARACTERS * 0.9;
  const isOverLimit = charCount > MAX_CHARACTERS;

  return (
    <div className="border-t border-border-subtle bg-surface-1/95 p-4 backdrop-blur">
      <div className="mx-auto max-w-4xl">
        <div className="relative rounded-xl border border-border-default bg-surface-2/70 p-2 shadow-sm transition-colors focus-within:border-accent-cyan/80 focus-within:ring-1 focus-within:ring-accent-cyan/80">
          <textarea
            ref={textareaRef}
            rows={1}
            value={content}
            disabled={disabled || isStreaming}
            onChange={(e) => setContent(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              isStreaming
                ? "TwinMind is thinking…"
                : "Type a thought or question… (Enter to send, Shift+Enter for newline)"
            }
            className="w-full resize-none bg-transparent px-3 py-1.5 text-sm text-text-primary placeholder:text-text-muted focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
            style={{ maxHeight: "200px" }}
            aria-label="Message input"
          />

          <div className="mt-2 flex flex-wrap items-center justify-between gap-2 border-t border-border-subtle/50 pt-2 px-1">
            <div className="flex items-center gap-2">
              <ModelSelector
                selectedModel={selectedModel}
                onSelectModel={onSelectModel}
                disabled={disabled || isStreaming}
              />

              {charCount > 0 && (
                <span
                  className={`text-[11px] ${
                    isOverLimit
                      ? "text-rose-400 font-semibold"
                      : isNearLimit
                      ? "text-amber-400"
                      : "text-text-muted"
                  }`}
                >
                  {charCount.toLocaleString()} / {MAX_CHARACTERS.toLocaleString()}
                </span>
              )}
            </div>

            <div className="flex items-center gap-2">
              {isStreaming && onAbort ? (
                <button
                  type="button"
                  onClick={onAbort}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-rose-500/40 bg-rose-500/15 px-3 py-1.5 text-xs font-semibold text-rose-300 transition-colors hover:bg-rose-500/25 focus-visible:outline-2 focus-visible:outline-rose-400"
                >
                  <span className="size-2 rounded-sm bg-rose-400 animate-pulse" />
                  <span>Stop generating</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={!content.trim() || isOverLimit || disabled}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-accent-cyan px-3.5 py-1.5 text-xs font-semibold text-slate-950 transition-all hover:bg-accent-cyan-strong disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-cyan"
                >
                  <span>Send</span>
                  <span aria-hidden="true">↑</span>
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

