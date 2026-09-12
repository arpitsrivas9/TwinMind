"use client";

import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useCognitiveActivity } from "../../context/CognitiveContext";
import { AIStateIndicator } from "../motion/AIStateIndicator";

export type AgentLifecycleState =
  | "IDLE"
  | "THINKING"
  | "PLANNING"
  | "USING_TOOLS"
  | "EXECUTING"
  | "WAITING"
  | "COMPLETED"
  | "FAILED";

export interface AgentWorker {
  id: string;
  name: string;
  role: string;
  icon: string;
  description: string;
  state: AgentLifecycleState;
  currentTask?: string;
  progress: number;
  tools: string[];
  lastAction?: string;
}

const INITIAL_AGENTS: AgentWorker[] = [
  {
    id: "coding",
    name: "Coding Agent",
    role: "Full-Stack Software Engineer",
    icon: "⚡",
    description: "Autonomous code refactoring, AST parsing, automated test runs, and architectural integrity validation.",
    state: "IDLE",
    progress: 0,
    tools: ["TypeScript Compiler", "Jest Runner", "AST Parser", "Git VCS"],
  },
  {
    id: "research",
    name: "Research Agent",
    role: "Cognitive Knowledge Synthesizer",
    icon: "🔬",
    description: "Multi-document synthesis, scientific paper extraction, cross-domain citation mapping, and semantic validation.",
    state: "IDLE",
    progress: 0,
    tools: ["Hybrid RAG", "Vector Search", "Citation Verifier", "Document Parser"],
  },
  {
    id: "productivity",
    name: "Productivity Agent",
    role: "Workflow & Execution Coordinator",
    icon: "⏱",
    description: "Action item extraction, meeting minutes summarization, calendar optimization, and priority task scheduling.",
    state: "IDLE",
    progress: 0,
    tools: ["Task Pipeline", "Calendar Sync", "Meeting Extractor", "Memory Recall"],
  },
  {
    id: "study",
    name: "Study Agent",
    role: "Socratic Mentor & Tutor",
    icon: "📚",
    description: "Concept decomposition, knowledge gap detection, active recall flashcards, and conceptual quizzes.",
    state: "IDLE",
    progress: 0,
    tools: ["Socratic Engine", "Concept Mapper", "Quiz Generator", "Memory Anchor"],
  },
];

export function AgentsDashboard() {
  const { startAgentWorking, setIdle, triggerSuccess } = useCognitiveActivity();
  const [agents, setAgents] = useState<AgentWorker[]>(INITIAL_AGENTS);
  const [activeAgentId, setActiveAgentId] = useState<string | null>(null);
  const [executionLog, setExecutionLog] = useState<Array<{ id: string; timestamp: string; message: string; type: "info" | "tool" | "success" }>>([]);

  const runAgentTask = (agentId: string) => {
    setActiveAgentId(agentId);
    startAgentWorking();

    const timestamp = new Date().toLocaleTimeString();
    setExecutionLog((prev) => [
      { id: String(Date.now()), timestamp, message: `Dispatched cognitive task to ${agents.find((a) => a.id === agentId)?.name}`, type: "info" },
      ...prev,
    ]);

    // Simulated multi-phase execution loop
    const phases: Array<{ state: AgentLifecycleState; progress: number; task: string; log: string; tool?: string }> = [
      { state: "THINKING", progress: 20, task: "Analyzing requirements and scope…", log: "Parsing contextual intent & constraints" },
      { state: "PLANNING", progress: 45, task: "Generating cognitive execution graph…", log: "Constructed 4-stage dependency plan" },
      { state: "USING_TOOLS", progress: 70, task: "Executing tool calls…", log: "Invoked tool: Knowledge Retrieval Engine", tool: "RAG" },
      { state: "EXECUTING", progress: 90, task: "Synthesizing result payload…", log: "Validated generated artifacts" },
      { state: "COMPLETED", progress: 100, task: "Task completed successfully", log: "Execution complete. System settling." },
    ];

    let currentPhase = 0;
    const interval = setInterval(() => {
      if (currentPhase < phases.length) {
        const p = phases[currentPhase];
        setAgents((prev) =>
          prev.map((a) =>
            a.id === agentId
              ? { ...a, state: p.state, progress: p.progress, currentTask: p.task, lastAction: p.log }
              : a,
          ),
        );

        setExecutionLog((prev) => [
          {
            id: `${Date.now()}-${currentPhase}`,
            timestamp: new Date().toLocaleTimeString(),
            message: `[${p.state}] ${p.log}`,
            type: p.state === "USING_TOOLS" ? "tool" : p.state === "COMPLETED" ? "success" : "info",
          },
          ...prev,
        ]);

        if (p.state === "COMPLETED") {
          triggerSuccess();
          setTimeout(() => {
            setAgents((prev) =>
              prev.map((a) => (a.id === agentId ? { ...a, state: "IDLE", progress: 0, currentTask: undefined } : a)),
            );
            setActiveAgentId(null);
            setIdle();
          }, 3500);
        }

        currentPhase++;
      } else {
        clearInterval(interval);
      }
    }, 1200);
  };

  return (
    <div className="flex flex-col gap-8 w-full">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border-subtle pb-6">
        <div>
          <div className="flex items-center gap-3">
            <span className="flex size-9 items-center justify-center rounded-xl border border-emerald-400/30 bg-emerald-400/10 text-emerald-300 font-bold shadow-[0_0_16px_rgba(52,211,153,0.15)]">
              ⚡
            </span>
            <h2 className="text-2xl font-bold tracking-tight text-text-primary">
              TwinAgents™ Worker Core
            </h2>
            <AIStateIndicator forceState={activeAgentId ? "agent-working" : "idle"} />
          </div>
          <p className="mt-1 text-sm text-text-muted max-w-2xl">
            Autonomous cognitive worker nodes capable of planning, tool dispatching, code generation, and multi-step execution.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1.5 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-400">
            <span className="size-1.5 rounded-full bg-emerald-400 animate-pulse" />
            Phase 6 Active Core
          </span>
        </div>
      </div>

      {/* Agents Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {agents.map((agent) => {
          const isBusy = agent.state !== "IDLE";
          const stateColor =
            agent.state === "COMPLETED"
              ? "text-emerald-400 border-emerald-500/30 bg-emerald-500/10"
              : agent.state === "FAILED"
              ? "text-rose-400 border-rose-500/30 bg-rose-500/10"
              : isBusy
              ? "text-cyan-300 border-cyan-400/30 bg-cyan-400/10"
              : "text-text-muted border-border-subtle bg-surface-2";

          return (
            <div
              key={agent.id}
              className={`group relative rounded-2xl border p-5 transition-all duration-300 backdrop-blur-md ${
                isBusy
                  ? "border-emerald-500/40 bg-surface-1/90 shadow-[0_0_24px_rgba(52,211,153,0.15)] tm-glass-obsidian"
                  : "border-border-subtle bg-surface-1/60 hover:border-border-strong hover:bg-surface-1/80"
              }`}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div
                    className={`flex size-11 items-center justify-center rounded-xl border text-xl transition-transform duration-300 ${
                      isBusy
                        ? "border-emerald-400/40 bg-emerald-400/15 text-emerald-300 tm-heartbeat-agent scale-105"
                        : "border-border-subtle bg-surface-2 text-text-secondary group-hover:scale-105"
                    }`}
                  >
                    {agent.icon}
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-text-primary flex items-center gap-2">
                      {agent.name}
                    </h3>
                    <p className="text-[11px] text-text-muted">{agent.role}</p>
                  </div>
                </div>

                <span
                  className={`rounded-full border px-2.5 py-0.5 text-[10px] font-mono font-semibold tracking-wider uppercase transition-colors ${stateColor}`}
                >
                  {agent.state}
                </span>
              </div>

              <p className="mt-3 text-xs leading-relaxed text-text-secondary line-clamp-2">
                {agent.description}
              </p>

              {/* Progress bar if active */}
              {isBusy && (
                <div className="mt-4 space-y-1.5">
                  <div className="flex items-center justify-between text-[10px] font-mono text-text-muted">
                    <span className="truncate max-w-[80%] text-accent-cyan">{agent.currentTask}</span>
                    <span>{agent.progress}%</span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-2 border border-border-subtle">
                    <div
                      className="h-full bg-gradient-to-r from-cyan-400 to-emerald-400 transition-all duration-500 shadow-[0_0_10px_rgba(52,211,153,0.8)]"
                      style={{ width: `${agent.progress}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Tool tags */}
              <div className="mt-4 flex flex-wrap items-center gap-1.5">
                {agent.tools.map((tool) => (
                  <span
                    key={tool}
                    className="rounded-md border border-border-subtle bg-surface-2 px-2 py-0.5 text-[10px] font-medium text-text-muted transition-colors group-hover:border-border-default"
                  >
                    {tool}
                  </span>
                ))}
              </div>

              {/* Dispatch Action */}
              <div className="mt-5 pt-3 border-t border-border-subtle flex items-center justify-between">
                <span className="text-[10px] font-mono text-text-muted">
                  {agent.lastAction || "Awaiting instruction"}
                </span>

                <motion.button
                  whileHover={!isBusy ? { scale: 1.02 } : undefined}
                  whileTap={!isBusy ? { scale: 0.98 } : undefined}
                  type="button"
                  disabled={isBusy}
                  onClick={() => runAgentTask(agent.id)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
                    isBusy
                      ? "opacity-50 cursor-not-allowed bg-surface-2 text-text-muted"
                      : "bg-accent-cyan/15 border border-accent-cyan/30 text-accent-cyan-strong hover:bg-accent-cyan/25 hover:border-accent-cyan/50 shadow-xs"
                  }`}
                >
                  {isBusy ? "Running…" : "Dispatch Agent"}
                </motion.button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Live Cognitive Log */}
      {executionLog.length > 0 && (
        <div className="rounded-2xl border border-border-subtle bg-surface-1/70 p-5 backdrop-blur-md">
          <div className="flex items-center justify-between pb-3 border-b border-border-subtle">
            <div className="flex items-center gap-2">
              <span className="size-2 rounded-full bg-accent-cyan animate-pulse" />
              <h4 className="text-xs font-semibold tracking-wider text-text-primary uppercase">
                Cognitive Execution Stream
              </h4>
            </div>
            <button
              type="button"
              onClick={() => setExecutionLog([])}
              className="text-[10px] text-text-muted hover:text-text-primary transition-colors"
            >
              Clear Log
            </button>
          </div>

          <div className="mt-3 max-h-48 overflow-y-auto font-mono text-xs space-y-1.5">
            <AnimatePresence initial={false}>
              {executionLog.map((entry) => (
                <motion.div
                  key={entry.id}
                  layout
                  initial={{ opacity: 0, x: -6 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.18 }}
                  className="flex items-start gap-2.5 py-0.5 text-text-muted hover:text-text-secondary"
                >
                  <span className="text-[10px] text-text-muted/60 shrink-0">{entry.timestamp}</span>
                  <span
                    className={`leading-relaxed ${
                      entry.type === "success"
                        ? "text-emerald-400 font-semibold"
                        : entry.type === "tool"
                        ? "text-accent-cyan"
                        : "text-text-secondary"
                    }`}
                  >
                    {entry.message}
                  </span>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </div>
      )}
    </div>
  );
}

