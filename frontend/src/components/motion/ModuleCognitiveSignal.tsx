"use client";

import React from "react";
import { useCognitiveActivity } from "../../context/CognitiveContext";
import type { WorkspaceTab } from "../../context/WorkspaceContext";

interface ModuleCognitiveSignalProps {
  moduleId: WorkspaceTab | string;
  isActive: boolean;
}

export function ModuleCognitiveSignal({ moduleId, isActive }: ModuleCognitiveSignalProps) {
  const { state } = useCognitiveActivity();

  // Determine signal behavior
  const isModuleActiveInState =
    (moduleId === "chat" && (state === "thinking" || state === "streaming")) ||
    (moduleId === "search" && (state === "searching" || state === "processing")) ||
    (moduleId === "memory" && state === "remembering") ||
    (moduleId === "agents" && state === "agent-working");

  if (isModuleActiveInState) {
    return (
      <span className="relative flex size-2 items-center justify-center shrink-0">
        <span className="absolute size-3 rounded-full bg-accent-cyan opacity-60 animate-ping" />
        <span className="size-2 rounded-full bg-accent-cyan shadow-[0_0_8px_rgba(34,211,238,0.9)]" />
      </span>
    );
  }

  if (isActive) {
    return (
      <span className="relative flex size-2 items-center justify-center shrink-0">
        <span className="size-1.5 rounded-full bg-accent-cyan tm-heartbeat-idle shadow-[0_0_6px_rgba(34,211,238,0.7)]" />
      </span>
    );
  }

  // Dormant cognitive signal node
  return (
    <span
      className="size-1.5 rounded-full bg-text-muted/40 transition-colors group-hover:bg-text-muted/70 shrink-0"
      aria-hidden="true"
    />
  );
}
