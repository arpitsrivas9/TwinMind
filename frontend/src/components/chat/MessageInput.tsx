"use client";

import React, { useRef, useEffect, useState, KeyboardEvent } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ModelSelector } from "./ModelSelector";
import { TwinMindHeartbeat } from "../motion/TwinMindHeartbeat";
import { useCognitiveActivity } from "../../context/CognitiveContext";
import { VoiceInputButton } from "../voice/VoiceInputButton";
import { VoiceTranscriptDrawer } from "../voice/VoiceTranscriptDrawer";

type MessageInputProps = {
  onSend: (content: string, modelId: string, attachmentFile?: File) => void;
  onAbort?: () => void;
  isStreaming: boolean;
  selectedModel: string;
  onSelectModel: (modelId: string) => void;
  disabled?: boolean;
};

const MAX_CHARACTERS = 12000;
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB

const ALLOWED_EXTENSIONS = [
  ".pdf",
  ".txt",
  ".md",
  ".json",
  ".csv",
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
];

export function MessageInput({
  onSend,
  onAbort,
  isStreaming,
  selectedModel,
  onSelectModel,
  disabled = false,
}: MessageInputProps) {
  const [content, setContent] = useState("");
  const [attachment, setAttachment] = useState<{
    file: File;
    name: string;
    size: number;
    previewUrl?: string;
  } | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const { triggerPulse } = useCognitiveActivity();

  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

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

  const processFile = (file: File) => {
    setFileError(null);
    const ext = file.name.slice(file.name.lastIndexOf(".")).toLowerCase();
    if (!ALLOWED_EXTENSIONS.includes(ext) && !file.type.startsWith("image/")) {
      setFileError("Unsupported file type. Allowed: PDF, TXT, MD, JSON, CSV, PNG, JPG, JPEG, WebP.");
      return;
    }

    if (file.size > MAX_FILE_SIZE_BYTES) {
      setFileError("File exceeds 10MB limit. Please choose a smaller file.");
      return;
    }

    let previewUrl: string | undefined;
    if (file.type.startsWith("image/")) {
      previewUrl = URL.createObjectURL(file);
    }

    setAttachment({
      file,
      name: file.name,
      size: file.size,
      previewUrl,
    });
    // Trigger cognitive processing signal for file ingestion
    triggerPulse("processing", 1400);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processFile(file);
    }
    // Reset file input value so same file can be selected again
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const removeAttachment = () => {
    if (attachment?.previewUrl) {
      URL.revokeObjectURL(attachment.previewUrl);
    }
    setAttachment(null);
    setFileError(null);
  };

  const handleSubmit = () => {
    const trimmed = content.trim();
    if ((!trimmed && !attachment) || isStreaming || disabled) return;

    onSend(trimmed, selectedModel, attachment?.file);
    setContent("");
    if (attachment?.previewUrl) {
      URL.revokeObjectURL(attachment.previewUrl);
    }
    setAttachment(null);
    setFileError(null);
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const charCount = content.length;
  const isNearLimit = charCount > MAX_CHARACTERS * 0.9;
  const isOverLimit = charCount > MAX_CHARACTERS;
  const canSend = (content.trim().length > 0 || !!attachment) && !isOverLimit && !disabled && !isStreaming;

  return (
    <div className="border-t border-border-subtle bg-surface-1/95 p-4 backdrop-blur">
      <div className="mx-auto max-w-4xl">
        {/* Hidden File Input */}
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          accept=".pdf,.txt,.md,.json,.csv,.png,.jpg,.jpeg,.webp,application/pdf,text/plain,text/markdown,application/json,text/csv,image/*"
          onChange={handleFileChange}
        />

        {/* File error toast */}
        <AnimatePresence>
          {fileError && (
            <motion.div
              initial={{ opacity: 0, y: -6, height: 0 }}
              animate={{ opacity: 1, y: 0, height: "auto" }}
              exit={{ opacity: 0, y: -6, height: 0 }}
              transition={{ duration: 0.18 }}
              className="mb-2 flex items-center justify-between rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-1.5 text-xs text-rose-300"
            >
              <span>⚠️ {fileError}</span>
              <button
                type="button"
                onClick={() => setFileError(null)}
                className="text-rose-400 hover:text-rose-200"
              >
                ✕
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        <div
          onDragOver={(e) => {
            e.preventDefault();
            setIsDraggingOver(true);
          }}
          onDragLeave={() => setIsDraggingOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setIsDraggingOver(false);
            const dropped = e.dataTransfer.files?.[0];
            if (dropped) processFile(dropped);
          }}
          className={`relative rounded-2xl border p-2.5 shadow-sm transition-all duration-300 backdrop-blur-md ${
            isDraggingOver
              ? "border-accent-cyan bg-cyan-950/30 ring-1 ring-accent-cyan shadow-[0_0_25px_rgba(6,182,212,0.25)]"
              : "border-border-default/70 bg-surface-2/80 focus-within:border-accent-cyan/80 focus-within:shadow-[0_0_25px_rgba(6,182,212,0.18)] focus-within:ring-1 focus-within:ring-accent-cyan/60"
          }`}
        >
          {/* Attachment Preview Chip */}
          <AnimatePresence>
            {attachment && (
              <motion.div
                initial={{ opacity: 0, scale: 0.96, y: -4 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.96, y: -4 }}
                transition={{ duration: 0.2, ease: "easeOut" }}
                className="mb-2 flex items-center gap-2.5 rounded-xl border border-cyan-500/30 bg-cyan-950/40 p-2 pr-3 shadow-[0_0_15px_rgba(6,182,212,0.1)]"
              >
                {attachment.previewUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={attachment.previewUrl}
                    alt={attachment.name}
                    className="size-8 rounded-lg object-cover border border-cyan-500/40"
                  />
                ) : (
                  <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-cyan-900/50 text-accent-cyan text-sm border border-cyan-500/30">
                    📄
                  </div>
                )}
                <div className="flex min-w-0 flex-1 flex-col">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate font-mono text-xs font-medium text-cyan-200">
                      {attachment.name}
                    </span>
                    <TwinMindHeartbeat size="xs" />
                  </div>
                  <span className="text-[10px] text-text-muted">
                    {formatFileSize(attachment.size)} • In Cognitive Buffer
                  </span>
                </div>
                <button
                  type="button"
                  onClick={removeAttachment}
                  className="rounded-lg p-1 text-text-muted hover:bg-surface-2 hover:text-rose-400 transition-colors"
                  title="Remove attachment"
                  aria-label="Remove attachment"
                >
                  ✕
                </button>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Inline Voice Dictation Drawer */}
          <VoiceTranscriptDrawer
            onApplyTranscript={(text) => {
              setContent((prev) => (prev ? prev + " " + text : text));
              if (textareaRef.current) {
                textareaRef.current.focus();
              }
            }}
          />

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
                : attachment
                ? "Ask a question about this file… (optional, Enter to send)"
                : "Type a thought or speak… (Enter to send, Shift+Enter for newline)"
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

              {/* Attach File Button */}
              <motion.button
                type="button"
                whileHover={{ y: -1 }}
                whileTap={{ scale: 0.96 }}
                disabled={disabled || isStreaming}
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border-subtle bg-surface-2 px-2.5 py-1 text-xs text-text-secondary transition-all hover:border-accent-cyan/50 hover:text-accent-cyan hover:shadow-[0_0_10px_rgba(6,182,212,0.15)] disabled:cursor-not-allowed disabled:opacity-50"
                title="Attach file (PDF, TXT, MD, JSON, CSV, PNG, JPG, JPEG, WebP - max 10MB)"
                aria-label="Attach file"
              >
                <span className="text-sm">📎</span>
                <span className="hidden sm:inline text-[11px]">Attach</span>
              </motion.button>

              {/* Inline Voice Input Button */}
              <VoiceInputButton disabled={disabled || isStreaming} />

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
              <AnimatePresence mode="wait">
                {isStreaming && onAbort ? (
                  <motion.button
                    key="stop"
                    initial={{ opacity: 0, scale: 0.92 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.92 }}
                    transition={{ duration: 0.15 }}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.97 }}
                    type="button"
                    onClick={onAbort}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-rose-500/40 bg-rose-500/15 px-3 py-1.5 text-xs font-semibold text-rose-300 transition-colors hover:bg-rose-500/25 focus-visible:outline-2 focus-visible:outline-rose-400"
                  >
                    <span className="size-2 rounded-sm bg-rose-400 animate-pulse" />
                    <span>Stop generating</span>
                  </motion.button>
                ) : (
                  <motion.button
                    key="send"
                    initial={{ opacity: 0, scale: 0.92 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.92 }}
                    transition={{ duration: 0.15 }}
                    whileHover={canSend ? { scale: 1.02 } : undefined}
                    whileTap={canSend ? { scale: 0.97 } : undefined}
                    type="button"
                    onClick={handleSubmit}
                    disabled={!canSend}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-cyan-400 to-teal-400 px-4 py-1.5 text-xs font-semibold text-slate-950 shadow-[0_0_15px_rgba(6,182,212,0.25)] transition-all hover:shadow-[0_0_22px_rgba(6,182,212,0.45)] hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-cyan"
                  >
                    <span>Send</span>
                    <span aria-hidden="true">↑</span>
                  </motion.button>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

