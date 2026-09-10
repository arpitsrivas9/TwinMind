"use client";

import React from "react";
import { useCognitiveActivity, type CognitiveState } from "../../context/CognitiveContext";
import { TwinMindHeartbeat } from "./TwinMindHeartbeat";

interface AIStateIndicatorProps {
  forceState?: CognitiveState;
  customLabel?: string;
  compact?: boolean;
  className?: string;
}

const STATE_LABELS: Record<CognitiveState, string> = {
  idle: "Cognitive Core Idle",
  thinking: "Synthesizing Thought",
  streaming: "Streaming Response",
  searching: "Searching Knowledge",
  remembering: "Accessing Memory",
  processing: "Processing Context",
  "agent-working": "Agent Working",
  waiting: "Awaiting Input",
  success: "Action Complete",
  error: "Cognitive Alert",
};

export function AIStateIndicator({
  forceState,
  customLabel,
  compact = false,
  className = "",
}: AIStateIndicatorProps) {
  const { state: activeState } = useCognitiveActivity();
  const state = forceState || activeState;
  const label = customLabel || STATE_LABELS[state];

  const badgeTheme =
    state === "thinking" || state === "streaming"
      ? "border-cyan-500/30 bg-cyan-500/10 text-accent-cyan"
      : state === "searching"
      ? "border-sky-500/30 bg-sky-500/10 text-sky-300"
      : state === "remembering"
      ? "border-violet-500/30 bg-violet-500/10 text-violet-300"
      : state === "agent-working"
      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
      : state === "success"
      ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-300"
      : state === "error"
      ? "border-rose-500/40 bg-rose-500/15 text-rose-300"
      : "border-border-subtle bg-surface-2 text-text-muted";

  return (
    <div
      className={`inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-xs font-medium transition-all duration-300 backdrop-blur-md ${badgeTheme} ${className}`}
      role="status"
    >
      <TwinMindHeartbeat size="xs" forceState={state} showRings={false} />
      {!compact && <span className="text-[11px] tracking-wide font-mono">{label}</span>}
    </div>
  );
}

