"use client";

import React from "react";
import { motion, useReducedMotion } from "framer-motion";
import { useCognitiveActivity, type CognitiveState } from "../../context/CognitiveContext";

interface CognitivePulseProps {
  forceState?: CognitiveState;
  size?: "xs" | "sm" | "md";
  showLabel?: boolean;
  className?: string;
}

const PULSE_COLORS: Record<CognitiveState, { dot: string; glow: string; label: string }> = {
  idle: { dot: "bg-accent-cyan", glow: "rgba(34, 211, 238, 0.4)", label: "Idle" },
  thinking: { dot: "bg-cyan-300", glow: "rgba(103, 232, 249, 0.8)", label: "Thinking" },
  streaming: { dot: "bg-cyan-400", glow: "rgba(34, 211, 238, 0.9)", label: "Streaming" },
  searching: { dot: "bg-sky-400", glow: "rgba(56, 189, 248, 0.7)", label: "Searching" },
  remembering: { dot: "bg-violet-400", glow: "rgba(167, 139, 250, 0.8)", label: "Remembering" },
  processing: { dot: "bg-purple-400", glow: "rgba(192, 132, 252, 0.8)", label: "Processing" },
  "agent-working": { dot: "bg-emerald-400", glow: "rgba(52, 211, 153, 0.8)", label: "Executing" },
  waiting: { dot: "bg-slate-400", glow: "rgba(148, 163, 184, 0.4)", label: "Waiting" },
  success: { dot: "bg-emerald-300", glow: "rgba(52, 211, 153, 0.9)", label: "Ready" },
  error: { dot: "bg-rose-400", glow: "rgba(251, 113, 133, 0.9)", label: "Alert" },
  listening: { dot: "bg-cyan-300", glow: "rgba(34, 211, 238, 0.95)", label: "Listening" },
  speaking: { dot: "bg-teal-300", glow: "rgba(45, 212, 191, 0.95)", label: "Speaking" },
  interrupted: { dot: "bg-amber-400", glow: "rgba(251, 146, 60, 0.9)", label: "Interrupted" },
};

const SIZE_MAP = {
  xs: { dot: "size-2", ping: "size-3.5", text: "text-[10px]" },
  sm: { dot: "size-2.5", ping: "size-4.5", text: "text-xs" },
  md: { dot: "size-3.5", ping: "size-6", text: "text-sm" },
};

export function CognitivePulse({
  forceState,
  size = "sm",
  showLabel = false,
  className = "",
}: CognitivePulseProps) {
  const { state: liveState } = useCognitiveActivity();
  const state = forceState || liveState;
  const shouldReduceMotion = useReducedMotion();
  const cfg = PULSE_COLORS[state] || PULSE_COLORS.idle;
  const sizeCfg = SIZE_MAP[size] || SIZE_MAP.sm;

  const pulseDuration =
    state === "thinking"
      ? 1.2
      : state === "streaming"
      ? 1.5
      : state === "searching"
      ? 1.8
      : state === "remembering"
      ? 2.0
      : 3.5;

  return (
    <div className={`inline-flex items-center gap-2 select-none ${className}`}>
      <span className="relative flex items-center justify-center shrink-0">
        {!shouldReduceMotion && (
          <motion.span
            animate={{
              scale: [1, 1.8, 1],
              opacity: [0.6, 0, 0.6],
            }}
            transition={{
              duration: pulseDuration,
              repeat: Infinity,
              ease: "easeInOut",
            }}
            style={{ backgroundColor: cfg.glow }}
            className={`absolute rounded-full ${sizeCfg.ping} pointer-events-none`}
          />
        )}
        <span
          className={`relative rounded-full ${sizeCfg.dot} ${cfg.dot} shadow-[0_0_10px_${cfg.glow}]`}
        />
      </span>
      {showLabel && (
        <span className={`font-mono text-text-muted ${sizeCfg.text}`}>
          {cfg.label}
        </span>
      )}
    </div>
  );
}
