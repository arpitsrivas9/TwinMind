"use client";

import React, { useMemo } from "react";
import { useCognitiveActivity, type CognitiveState } from "../../context/CognitiveContext";

type HeartbeatSize = "xs" | "sm" | "md" | "lg" | "hero";

interface TwinMindHeartbeatProps {
  size?: HeartbeatSize;
  forceState?: CognitiveState;
  showRings?: boolean;
  interactive?: boolean;
  className?: string;
}

const SIZE_CONFIG: Record<
  HeartbeatSize,
  {
    container: string;
    core: string;
    glyphSize: string;
    ring1: string;
    ring2: string;
    ring3: string;
  }
> = {
  xs: {
    container: "size-4",
    core: "size-2.5",
    glyphSize: "text-[8px]",
    ring1: "size-3.5",
    ring2: "size-4",
    ring3: "size-5",
  },
  sm: {
    container: "size-6",
    core: "size-3.5",
    glyphSize: "text-[10px]",
    ring1: "size-5",
    ring2: "size-6",
    ring3: "size-7",
  },
  md: {
    container: "size-10",
    core: "size-6",
    glyphSize: "text-xs",
    ring1: "size-8",
    ring2: "size-10",
    ring3: "size-12",
  },
  lg: {
    container: "size-16",
    core: "size-10",
    glyphSize: "text-lg",
    ring1: "size-14",
    ring2: "size-18",
    ring3: "size-22",
  },
  hero: {
    container: "size-48 md:size-64",
    core: "size-24 md:size-32",
    glyphSize: "text-3xl md:text-4xl",
    ring1: "size-36 md:size-48",
    ring2: "size-48 md:size-64",
    ring3: "size-60 md:size-80",
  },
};

export function TwinMindHeartbeat({
  size = "md",
  forceState,
  showRings = true,
  interactive = false,
  className = "",
}: TwinMindHeartbeatProps) {
  const { state: activeState } = useCognitiveActivity();
  const state = forceState || activeState;
  const cfg = SIZE_CONFIG[size];

  // Map state to animation class and aura color
  const stateVisuals = useMemo(() => {
    switch (state) {
      case "thinking":
        return {
          animationClass: "tm-heartbeat-thinking",
          glowColor: "rgba(34, 211, 238, 0.7)",
          coreBg: "bg-cyan-400",
          ringColor: "border-cyan-400/40",
          shadow: "shadow-[0_0_24px_rgba(34,211,238,0.6)]",
        };
      case "streaming":
        return {
          animationClass: "tm-heartbeat-streaming",
          glowColor: "rgba(103, 232, 249, 0.65)",
          coreBg: "bg-cyan-300",
          ringColor: "border-cyan-300/35",
          shadow: "shadow-[0_0_28px_rgba(34,211,238,0.7)]",
        };
      case "searching":
        return {
          animationClass: "tm-heartbeat-searching",
          glowColor: "rgba(56, 189, 248, 0.6)",
          coreBg: "bg-sky-400",
          ringColor: "border-sky-400/40",
          shadow: "shadow-[0_0_20px_rgba(56,189,248,0.5)]",
        };
      case "remembering":
        return {
          animationClass: "tm-heartbeat-remembering",
          glowColor: "rgba(167, 139, 250, 0.7)",
          coreBg: "bg-violet-400",
          ringColor: "border-violet-400/40",
          shadow: "shadow-[0_0_22px_rgba(167,139,250,0.6)]",
        };
      case "agent-working":
        return {
          animationClass: "tm-heartbeat-agent",
          glowColor: "rgba(52, 211, 153, 0.7)",
          coreBg: "bg-emerald-400",
          ringColor: "border-emerald-400/40",
          shadow: "shadow-[0_0_24px_rgba(52,211,153,0.6)]",
        };
      case "processing":
        return {
          animationClass: "tm-heartbeat-thinking",
          glowColor: "rgba(192, 132, 252, 0.65)",
          coreBg: "bg-purple-400",
          ringColor: "border-purple-400/40",
          shadow: "shadow-[0_0_20px_rgba(192,132,252,0.55)]",
        };
      case "success":
        return {
          animationClass: "tm-pulse-success",
          glowColor: "rgba(52, 211, 153, 0.8)",
          coreBg: "bg-emerald-300",
          ringColor: "border-emerald-400/50",
          shadow: "shadow-[0_0_28px_rgba(52,211,153,0.8)]",
        };
      case "error":
        return {
          animationClass: "tm-pulse-error",
          glowColor: "rgba(251, 113, 133, 0.8)",
          coreBg: "bg-rose-400",
          ringColor: "border-rose-400/50",
          shadow: "shadow-[0_0_24px_rgba(251,113,133,0.7)]",
        };
      case "waiting":
        return {
          animationClass: "tm-heartbeat-idle opacity-80",
          glowColor: "rgba(148, 163, 184, 0.4)",
          coreBg: "bg-slate-300",
          ringColor: "border-slate-400/25",
          shadow: "shadow-[0_0_12px_rgba(148,163,184,0.3)]",
        };
      case "idle":
      default:
        return {
          animationClass: "tm-heartbeat-idle",
          glowColor: "rgba(34, 211, 238, 0.4)",
          coreBg: "bg-accent-cyan",
          ringColor: "border-cyan-400/25",
          shadow: "shadow-[0_0_18px_rgba(34,211,238,0.4)]",
        };
    }
  }, [state]);

  return (
    <div
      className={`relative inline-flex items-center justify-center select-none ${cfg.container} ${interactive ? "cursor-pointer transition-transform hover:scale-110 active:scale-95" : ""} ${className}`}
      aria-label={`TwinMind Heartbeat: ${state}`}
    >
      {/* Outer ambient wave rings (only shown on md, lg, hero) */}
      {showRings && (size === "md" || size === "lg" || size === "hero") && (
        <>
          <div
            className={`absolute rounded-full border ${cfg.ring3} ${stateVisuals.ringColor} opacity-20 tm-node-drift pointer-events-none`}
            style={{ animationDuration: "7.2s" }}
          />
          <div
            className={`absolute rounded-full border ${cfg.ring2} ${stateVisuals.ringColor} opacity-40 pointer-events-none transition-all duration-700`}
          />
          <div
            className={`absolute rounded-full border ${cfg.ring1} ${stateVisuals.ringColor} opacity-60 pointer-events-none transition-all duration-500`}
          />
        </>
      )}

      {/* Living Cognitive Core */}
      <div
        className={`relative flex items-center justify-center rounded-full transition-all duration-500 ${cfg.core} ${stateVisuals.animationClass} ${stateVisuals.shadow}`}
      >
        <div
          className={`absolute inset-0 rounded-full ${stateVisuals.coreBg} opacity-85 blur-[2px]`}
        />
        <div className={`relative z-10 font-bold text-slate-950 dark:text-slate-950 ${cfg.glyphSize}`}>
          ◈
        </div>
      </div>
    </div>
  );
}

