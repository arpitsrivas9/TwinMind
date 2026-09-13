"use client";

import React from "react";
import { motion } from "framer-motion";
import { useTwinVoice } from "../../context/VoiceContext";

interface VoiceInputButtonProps {
  disabled?: boolean;
  className?: string;
}

export function VoiceInputButton({ disabled = false, className = "" }: VoiceInputButtonProps) {
  const { voiceState, startListening, stopListening, openVoiceModal } = useTwinVoice();
  const isListening = voiceState === "LISTENING";

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    if (disabled) return;

    if (isListening) {
      stopListening();
    } else {
      startListening();
    }
  };

  const handleDoubleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    openVoiceModal();
  };

  return (
    <div className="relative inline-flex items-center shrink-0">
      <motion.button
        type="button"
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.94 }}
        onClick={handleClick}
        onDoubleClick={handleDoubleClick}
        disabled={disabled}
        className={`relative inline-flex items-center justify-center rounded-lg border px-2 sm:px-2.5 py-1 text-xs font-medium transition-all shrink-0 ${
          isListening
            ? "border-cyan-400 bg-cyan-950/70 text-accent-cyan shadow-[0_0_18px_rgba(6,182,212,0.4)] ring-1 ring-accent-cyan"
            : "border-border-subtle bg-surface-2 text-text-secondary hover:border-accent-cyan/50 hover:text-accent-cyan hover:shadow-[0_0_12px_rgba(6,182,212,0.2)]"
        } disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
        title={
          isListening
            ? "Listening... Click to finish or stop"
            : "Click to speak (Speech-to-Text), double-click for full TwinVoice™ HUD"
        }
        aria-label={isListening ? "Stop listening" : "Start voice input"}
        aria-pressed={isListening}
      >
        {isListening ? (
          <span className="relative flex size-2 mr-1 sm:mr-1.5 shrink-0">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-cyan-400 opacity-75" />
            <span className="relative inline-flex size-2 rounded-full bg-accent-cyan" />
          </span>
        ) : (
          <span className="mr-0 sm:mr-1 text-sm shrink-0">🎙️</span>
        )}
        <span className="text-[11px] font-mono hidden sm:inline">
          {isListening ? "Listening…" : "Voice"}
        </span>
      </motion.button>
    </div>
  );
}

