"use client";

import React, { useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useTwinVoice } from "../../context/VoiceContext";
import { TwinMindHeartbeat } from "../motion/TwinMindHeartbeat";
import { voiceOverlayVariants, modalBackdropVariants } from "../../lib/motion";
import { CognitiveState } from "../../context/CognitiveContext";

export function VoiceConversationModal() {
  const {
    voiceState,
    transcript,
    interimTranscript,
    isVoiceModalOpen,
    closeVoiceModal,
    startListening,
    stopListening,
    interrupt,
    isWakeWordEnabled,
    toggleWakeWord,
    settings,
    updateSettings,
    error,
  } = useTwinVoice();

  // Escape key to close
  useEffect(() => {
    if (!isVoiceModalOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        closeVoiceModal();
      } else if (e.key === " " && (voiceState === "SPEAKING" || voiceState === "THINKING")) {
        // Spacebar to interrupt
        e.preventDefault();
        interrupt();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isVoiceModalOpen, voiceState, closeVoiceModal, interrupt]);

  // Map VoiceState to CognitiveState for the central Heartbeat
  const mappedCognitiveState: CognitiveState = useMemo(() => {
    switch (voiceState) {
      case "LISTENING":
        return "listening";
      case "THINKING":
      case "TRANSCRIBING":
        return "thinking";
      case "SPEAKING":
        return "speaking";
      case "INTERRUPTED":
        return "interrupted";
      case "ERROR":
        return "error";
      case "IDLE":
      default:
        return "idle";
    }
  }, [voiceState]);

  // Status title & subtitle
  const stateInfo = useMemo(() => {
    switch (voiceState) {
      case "LISTENING":
        return {
          title: "LISTENING",
          subtitle: "TwinMind is listening to your voice…",
          accentColor: "text-cyan-400",
          glowBg: "bg-cyan-500/15",
          borderColor: "border-cyan-500/40",
        };
      case "TRANSCRIBING":
        return {
          title: "TRANSCRIBING",
          subtitle: "Assembling your thought…",
          accentColor: "text-sky-400",
          glowBg: "bg-sky-500/15",
          borderColor: "border-sky-500/40",
        };
      case "THINKING":
        return {
          title: "THINKING",
          subtitle: "Synthesizing neural response…",
          accentColor: "text-cyan-300",
          glowBg: "bg-cyan-400/20",
          borderColor: "border-cyan-400/50",
        };
      case "SPEAKING":
        return {
          title: "SPEAKING",
          subtitle: "Responding naturally (speak to interrupt)…",
          accentColor: "text-teal-300",
          glowBg: "bg-teal-500/20",
          borderColor: "border-teal-500/50",
        };
      case "INTERRUPTED":
        return {
          title: "INTERRUPTED",
          subtitle: "Immediate barge-in acknowledged. Listening…",
          accentColor: "text-amber-400",
          glowBg: "bg-amber-500/20",
          borderColor: "border-amber-500/50",
        };
      case "ERROR":
        return {
          title: "ERROR",
          subtitle: error?.message || "Voice system encountered an issue.",
          accentColor: "text-rose-400",
          glowBg: "bg-rose-500/20",
          borderColor: "border-rose-500/50",
        };
      case "IDLE":
      default:
        return {
          title: "STANDBY",
          subtitle: isWakeWordEnabled
            ? 'Say "Hey TwinMind" or tap the core to speak.'
            : "Tap the core to begin speaking.",
          accentColor: "text-slate-400",
          glowBg: "bg-slate-500/10",
          borderColor: "border-slate-500/30",
        };
    }
  }, [voiceState, error, isWakeWordEnabled]);

  if (!isVoiceModalOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 md:p-8 overflow-hidden">
        {/* Backdrop blur */}
        <motion.div
          variants={modalBackdropVariants}
          initial="initial"
          animate="animate"
          exit="exit"
          onClick={closeVoiceModal}
          className="fixed inset-0 bg-slate-950/80 backdrop-blur-xl"
          aria-hidden="true"
        />

        {/* Ambient Radial Spotlight */}
        <div
          className={`absolute pointer-events-none transition-all duration-700 size-[500px] md:size-[700px] rounded-full blur-[120px] opacity-40 ${
            voiceState === "LISTENING"
              ? "bg-cyan-500/30"
              : voiceState === "SPEAKING"
              ? "bg-teal-500/30"
              : voiceState === "THINKING"
              ? "bg-cyan-400/30"
              : voiceState === "INTERRUPTED"
              ? "bg-amber-500/30"
              : "bg-cyan-900/20"
          }`}
        />

        {/* HUD Modal Card */}
        <motion.div
          variants={voiceOverlayVariants}
          initial="initial"
          animate="animate"
          exit="exit"
          className="relative z-10 flex flex-col items-center justify-between w-full max-w-2xl min-h-[580px] max-h-[90vh] rounded-3xl border border-white/10 bg-surface-1/90 p-6 md:p-10 shadow-[0_0_80px_rgba(0,0,0,0.8)] backdrop-blur-2xl overflow-hidden"
          role="dialog"
          aria-modal="true"
          aria-label="TwinVoice Conversation Mode"
        >
          {/* Top Status Bar */}
          <div className="w-full flex items-center justify-between border-b border-white/10 pb-4">
            <div className="flex items-center gap-2.5">
              <span className="flex size-2 rounded-full bg-cyan-400 animate-pulse" />
              <span className="font-mono text-xs font-semibold tracking-wider text-cyan-300">
                TWINVOICE™ OS
              </span>
              <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[10px] font-mono text-text-muted border border-border-subtle">
                Living Audio Core
              </span>
            </div>

            <div className="flex items-center gap-3">
              {/* Wake Word Pill */}
              <button
                type="button"
                onClick={toggleWakeWord}
                className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-mono transition-all border ${
                  isWakeWordEnabled
                    ? "border-emerald-500/40 bg-emerald-950/40 text-emerald-300 shadow-[0_0_12px_rgba(52,211,153,0.2)]"
                    : "border-border-subtle bg-surface-2 text-text-muted hover:text-text-secondary"
                }`}
                title="Toggle on-device wake word listening ('Hey TwinMind')"
              >
                <span className={`size-1.5 rounded-full ${isWakeWordEnabled ? "bg-emerald-400" : "bg-slate-500"}`} />
                <span>Wake: &ldquo;Hey TwinMind&rdquo;</span>
                <span className="text-[10px] text-text-muted">{isWakeWordEnabled ? "ON" : "OFF"}</span>
              </button>

              {/* Close Button */}
              <button
                type="button"
                onClick={closeVoiceModal}
                className="rounded-full p-1.5 text-text-muted hover:bg-surface-2 hover:text-text-primary transition-colors"
                title="Exit Voice Mode (Esc)"
                aria-label="Exit Voice Mode"
              >
                ✕
              </button>
            </div>
          </div>

          {/* Central Living AI Heartbeat */}
          <div className="my-auto flex flex-col items-center justify-center py-6 text-center">
            {/* Interactive Heartbeat Core */}
            <div
              onClick={() => {
                if (voiceState === "SPEAKING") {
                  interrupt();
                } else if (voiceState === "LISTENING") {
                  stopListening();
                } else {
                  startListening();
                }
              }}
              className="cursor-pointer group relative flex items-center justify-center p-4"
              title="Click to speak or interrupt"
            >
              <TwinMindHeartbeat
                size="hero"
                forceState={mappedCognitiveState}
                showRings={true}
                interactive={true}
              />
            </div>

            {/* Cognitive State Badge */}
            <div className="mt-8 flex flex-col items-center">
              <div
                className={`flex items-center gap-2 rounded-full border px-4 py-1.5 shadow-sm transition-all duration-500 ${stateInfo.glowBg} ${stateInfo.borderColor}`}
              >
                <span className={`font-mono text-xs font-bold tracking-widest ${stateInfo.accentColor}`}>
                  {stateInfo.title}
                </span>
              </div>
              <p className="mt-2 text-xs text-text-secondary font-mono">
                {stateInfo.subtitle}
              </p>
              {voiceState === "ERROR" && (
                <button
                  type="button"
                  onClick={() => startListening()}
                  className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-rose-500/40 bg-rose-950/40 px-3.5 py-1 text-xs font-mono text-rose-300 hover:bg-rose-900/50 hover:border-rose-400 transition-all shadow-[0_0_12px_rgba(244,63,94,0.25)]"
                >
                  <span>↺</span>
                  <span>Retry Listening</span>
                </button>
              )}
            </div>

            {/* Spoken Captions Box */}
            <div className="mt-6 w-full max-w-lg min-h-[64px] max-h-[140px] overflow-y-auto px-4 py-3 rounded-2xl bg-surface-2/60 border border-border-subtle/50 text-center">
              {interimTranscript || transcript ? (
                <p className="text-sm md:text-base text-text-primary font-medium italic leading-relaxed">
                  &ldquo;{interimTranscript || transcript}&rdquo;
                </p>
              ) : (
                <p className="text-xs text-text-muted italic">
                  {voiceState === "SPEAKING"
                    ? "Audio response stream active…"
                    : voiceState === "LISTENING"
                    ? "Listening for your voice input…"
                    : "No voice activity yet. Speak to TwinMind."}
                </p>
              )}
            </div>

            {/* Dynamic Animated Audio Waveform */}
            <div className="mt-6 flex items-center justify-center gap-1.5 h-8">
              {[35, 60, 85, 45, 95, 70, 50, 90, 65, 40, 80, 55].map((val, idx) => {
                const isWaveActive = voiceState === "LISTENING" || voiceState === "SPEAKING";
                return (
                  <motion.div
                    key={idx}
                    animate={
                      isWaveActive
                        ? {
                            height: [4, (val / 100) * 28 + 4, 4],
                            opacity: [0.3, 0.95, 0.3],
                          }
                        : { height: 4, opacity: 0.2 }
                    }
                    transition={{
                      repeat: isWaveActive ? Infinity : 0,
                      duration: voiceState === "SPEAKING" ? 0.6 + (idx % 3) * 0.1 : 0.9 + (idx % 4) * 0.12,
                      ease: "easeInOut",
                    }}
                    className={`w-1 rounded-full ${
                      voiceState === "SPEAKING"
                        ? "bg-teal-400"
                        : voiceState === "INTERRUPTED"
                        ? "bg-amber-400"
                        : "bg-cyan-400"
                    }`}
                    style={{ height: 4 }}
                  />
                );
              })}
            </div>
          </div>

          {/* Bottom Controls */}
          <div className="w-full flex flex-wrap items-center justify-between gap-4 border-t border-white/10 pt-4">
            <div className="flex items-center gap-2">
              <label className="flex items-center gap-2 cursor-pointer select-none text-xs text-text-secondary">
                <input
                  type="checkbox"
                  checked={settings.continuousConversation}
                  onChange={(e) => updateSettings({ continuousConversation: e.target.checked })}
                  className="rounded border-border-default bg-surface-2 text-accent-cyan focus:ring-accent-cyan"
                />
                <span className="font-mono text-[11px]">Continuous Hands-Free Mode</span>
              </label>
            </div>

            <div className="flex items-center gap-3">
              {/* Primary Action Button */}
              {voiceState === "SPEAKING" ? (
                <motion.button
                  whileHover={{ scale: 1.04 }}
                  whileTap={{ scale: 0.96 }}
                  type="button"
                  onClick={interrupt}
                  className="flex items-center gap-2 rounded-xl border border-rose-500/50 bg-rose-500/20 px-5 py-2 text-xs font-semibold text-rose-300 shadow-[0_0_20px_rgba(244,63,94,0.3)] hover:bg-rose-500/30 transition-all"
                >
                  <span className="size-2 rounded-sm bg-rose-400 animate-pulse" />
                  <span>Interrupt & Speak (Space)</span>
                </motion.button>
              ) : voiceState === "LISTENING" ? (
                <motion.button
                  whileHover={{ scale: 1.04 }}
                  whileTap={{ scale: 0.96 }}
                  type="button"
                  onClick={stopListening}
                  className="flex items-center gap-2 rounded-xl border border-cyan-500/50 bg-cyan-950/60 px-5 py-2 text-xs font-semibold text-cyan-300 shadow-[0_0_20px_rgba(6,182,212,0.3)] hover:bg-cyan-900/60 transition-all"
                >
                  <span className="size-2 rounded-full bg-cyan-400 animate-ping" />
                  <span>Done Speaking ↑</span>
                </motion.button>
              ) : voiceState === "ERROR" ? (
                <motion.button
                  whileHover={{ scale: 1.04 }}
                  whileTap={{ scale: 0.96 }}
                  type="button"
                  onClick={() => startListening()}
                  className="flex items-center gap-2 rounded-xl border border-rose-500/50 bg-rose-950/70 px-5 py-2 text-xs font-semibold text-rose-300 shadow-[0_0_20px_rgba(244,63,94,0.3)] hover:bg-rose-900/80 transition-all"
                >
                  <span>↺</span>
                  <span>Retry Voice Input</span>
                </motion.button>
              ) : (
                <motion.button
                  whileHover={{ scale: 1.04 }}
                  whileTap={{ scale: 0.96 }}
                  type="button"
                  onClick={() => startListening()}
                  className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-cyan-400 to-teal-400 px-5 py-2 text-xs font-semibold text-slate-950 shadow-[0_0_25px_rgba(6,182,212,0.35)] hover:brightness-110 transition-all"
                >
                  <span>🎙️</span>
                  <span>Tap to Speak</span>
                </motion.button>
              )}

              <button
                type="button"
                onClick={closeVoiceModal}
                className="rounded-xl border border-border-subtle bg-surface-2 px-3.5 py-2 text-xs text-text-secondary hover:text-text-primary transition-colors"
              >
                Exit HUD
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}

