"use client";

import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useTwinVoice } from "../../context/VoiceContext";
import { TwinMindHeartbeat } from "../motion/TwinMindHeartbeat";

interface VoiceTranscriptDrawerProps {
  onApplyTranscript?: (text: string) => void;
}

export function VoiceTranscriptDrawer({ onApplyTranscript }: VoiceTranscriptDrawerProps) {
  const {
    voiceState,
    interimTranscript,
    transcript,
    stopListening,
    cancelListening,
    startListening,
    processSpokenUtterance,
    error,
  } = useTwinVoice();

  const isListening = voiceState === "LISTENING";
  const isTranscribing = voiceState === "TRANSCRIBING";
  const activeTranscript = interimTranscript || transcript;

  if (!isListening && !isTranscribing && !error) {
    return null;
  }

  const handleSendNow = () => {
    if (activeTranscript) {
      stopListening();
      processSpokenUtterance(activeTranscript);
    }
  };

  const handleInsertIntoComposer = () => {
    if (activeTranscript && onApplyTranscript) {
      onApplyTranscript(activeTranscript);
      cancelListening();
    }
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 8, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 8, scale: 0.98 }}
        transition={{ duration: 0.2 }}
        className="mb-3 overflow-hidden rounded-xl border border-cyan-500/40 bg-surface-1/95 p-3 shadow-[0_0_25px_rgba(6,182,212,0.18)] backdrop-blur-md"
      >
        <div className="flex items-center justify-between border-b border-border-subtle/60 pb-2">
          <div className="flex items-center gap-2">
            <TwinMindHeartbeat size="xs" forceState={isListening ? "listening" : "thinking"} />
            <span className="font-mono text-xs font-semibold text-cyan-300">
              {isListening ? "TwinVoice™ Listening…" : isTranscribing ? "Processing Speech…" : "Voice Status"}
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            {isListening && (
              <button
                type="button"
                onClick={stopListening}
                className="rounded px-2 py-0.5 text-[11px] font-medium text-text-secondary hover:bg-surface-2 hover:text-text-primary transition-colors"
              >
                Done Speaking
              </button>
            )}
            <button
              type="button"
              onClick={cancelListening}
              className="rounded p-1 text-text-muted hover:bg-surface-2 hover:text-rose-400 transition-colors"
              title="Cancel voice input"
              aria-label="Cancel voice input"
            >
              ✕
            </button>
          </div>
        </div>

        {error ? (
          <div className="mt-2 text-xs text-rose-300 flex items-center justify-between">
            <span>⚠️ {error.message}</span>
            <button
              type="button"
              onClick={() => startListening()}
              className="underline hover:text-rose-200 ml-2 text-[11px]"
            >
              Retry
            </button>
          </div>
        ) : (
          <div className="mt-2.5">
            <p className="min-h-[36px] max-h-[120px] overflow-y-auto text-sm text-text-primary italic leading-relaxed">
              {activeTranscript ? (
                <span>&ldquo;{activeTranscript}&rdquo;</span>
              ) : (
                <span className="text-text-muted text-xs not-italic">
                  Speak now… your thoughts will appear in real time.
                </span>
              )}
            </p>

            {/* Equalizer audio wave animation while listening */}
            {isListening && (
              <div className="mt-2 flex items-center gap-1">
                {[40, 75, 55, 90, 60, 85, 45, 70, 95, 50].map((h, i) => (
                  <motion.div
                    key={i}
                    animate={{
                      height: [6, (h / 100) * 16 + 4, 6],
                      opacity: [0.4, 0.9, 0.4],
                    }}
                    transition={{
                      repeat: Infinity,
                      duration: 0.6 + (i % 4) * 0.15,
                      ease: "easeInOut",
                    }}
                    className="w-1 rounded-full bg-cyan-400"
                    style={{ height: 6 }}
                  />
                ))}
                <span className="ml-2 font-mono text-[10px] text-cyan-400/80">Audio Stream Active</span>
              </div>
            )}

            {/* Action Buttons */}
            {activeTranscript && (
              <div className="mt-2.5 flex items-center justify-end gap-2 border-t border-border-subtle/40 pt-2">
                <button
                  type="button"
                  onClick={handleInsertIntoComposer}
                  className="rounded-lg border border-border-subtle bg-surface-2 px-2.5 py-1 text-xs text-text-secondary hover:text-text-primary transition-colors"
                >
                  Edit in Composer
                </button>
                <button
                  type="button"
                  onClick={handleSendNow}
                  className="rounded-lg bg-gradient-to-r from-cyan-500 to-teal-500 px-3 py-1 text-xs font-semibold text-slate-950 hover:brightness-110 shadow-[0_0_12px_rgba(6,182,212,0.3)] transition-all"
                >
                  Send Thought ↑
                </button>
              </div>
            )}
          </div>
        )}
      </motion.div>
    </AnimatePresence>
  );
}

