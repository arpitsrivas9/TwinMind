"use client";

import React, { useState } from "react";
import Link from "next/link";
import { TwinMindHeartbeat } from "../components/motion/TwinMindHeartbeat";

export default function HomePage() {
  const [activeModule, setActiveModule] = useState<string>("core");

  const capabilities = [
    {
      id: "core",
      title: "Twin Core™",
      tag: "Cognitive Engine",
      desc: "Instant multi-modal streaming dialogue powered by Gemini 2.5, persistent message context, and neural real-time comprehension.",
      status: "Neural Stream Online",
      color: "from-cyan-500/20 to-teal-500/5",
      border: "border-cyan-500/30",
    },
    {
      id: "memory",
      title: "TwinMemory™",
      tag: "Persistent Nexus",
      desc: "Cross-session autonomous biographical recall, semantic preferences, project tracking, and private long-term memory synthesis.",
      status: "Durable Recall Primed",
      color: "from-purple-500/20 to-indigo-500/5",
      border: "border-purple-500/30",
    },
    {
      id: "search",
      title: "TwinSearch™ + RAG",
      tag: "Multi-Modal Ingestion",
      desc: "Deep semantic vector retrieval across PDFs, DOCX, presentation slides, OCR images, and walkthrough video transcripts.",
      status: "Vector Embeddings Active",
      color: "from-sky-500/20 to-cyan-500/5",
      border: "border-sky-500/30",
    },
    {
      id: "graph",
      title: "TwinGraph™",
      tag: "Knowledge Topology",
      desc: "Relational knowledge network connecting owners, projects, tasks, goals, meetings, and topics into an interconnected mind map.",
      status: "Knowledge Graph Active",
      color: "from-teal-500/20 to-emerald-500/5",
      border: "border-teal-500/30",
    },
    {
      id: "agents",
      title: "TwinAgents™",
      tag: "Autonomous Workforce",
      desc: "Multi-agent cognitive orchestrator for Coding, Deep Research, Productivity, and Study missions with live tool introspection.",
      status: "Autonomous Fleet Ready",
      color: "from-amber-500/20 to-orange-500/5",
      border: "border-amber-500/30",
    },
  ];

  return (
    <main className="relative min-h-screen overflow-hidden bg-background/90 text-text-primary">
      {/* Subtle top ambient radial lighting */}
      <div className="pointer-events-none absolute -top-40 left-1/2 h-[500px] w-[800px] -translate-x-1/2 rounded-full bg-cyan-500/10 blur-[120px]" />

      <section className="relative mx-auto flex max-w-6xl flex-col items-center gap-16 px-6 py-20 lg:py-28 lg:px-8">
        {/* Living Cognitive Core Hero */}
        <div className="flex flex-col items-center text-center">
          <div className="relative mb-8 flex items-center justify-center">
            <TwinMindHeartbeat size="hero" showRings={true} />
            <div className="absolute -bottom-3 rounded-full border border-cyan-400/40 bg-slate-950/90 px-3.5 py-1 text-[11px] font-mono tracking-wider text-cyan-300 shadow-[0_0_15px_rgba(6,182,212,0.3)]">
              LIVING AI OPERATING SYSTEM
            </div>
          </div>

          <div className="mt-4 inline-flex items-center gap-2 rounded-full border border-cyan-400/20 bg-cyan-400/5 px-4 py-1 text-xs font-medium tracking-[0.25em] text-cyan-300 uppercase backdrop-blur-md">
            <span className="size-1.5 rounded-full bg-cyan-400 animate-pulse" />
            <span>Autonomous Intelligence Fabric</span>
          </div>

          <h1 className="mt-6 max-w-4xl text-4xl font-extrabold tracking-tight text-text-primary sm:text-6xl lg:text-7xl">
            The Living AI Operating System for your{" "}
            <span className="bg-gradient-to-r from-cyan-300 via-teal-200 to-emerald-300 bg-clip-text text-transparent">
              mind & workflows.
            </span>
          </h1>

          <p className="mt-6 max-w-2xl text-base text-text-secondary sm:text-lg">
            TwinMind turns fragmented memory, documents, relationships, and agentic workflows into a singular, self-evolving personal intelligence.
          </p>

          {/* Action CTAs */}
          <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
            <Link
              href="/signup"
              className="group relative inline-flex items-center gap-2 overflow-hidden rounded-xl bg-gradient-to-r from-cyan-400 via-teal-400 to-cyan-300 px-7 py-3.5 text-sm font-semibold text-slate-950 shadow-[0_0_25px_rgba(6,182,212,0.35)] transition-all duration-300 hover:scale-[1.02] hover:shadow-[0_0_35px_rgba(6,182,212,0.6)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-cyan"
            >
              <span>Initialize TwinMind</span>
              <span className="transition-transform duration-200 group-hover:translate-x-0.5">→</span>
            </Link>
            <Link
              href="/login"
              className="rounded-xl border border-border-default/80 bg-surface-2/80 px-7 py-3.5 text-sm font-medium text-text-primary backdrop-blur-md transition-all duration-300 hover:border-cyan-500/40 hover:bg-surface-2 hover:shadow-[0_0_20px_rgba(6,182,212,0.15)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
            >
              Sign In to Workspace
            </Link>
          </div>
        </div>

        {/* Interactive Capability Nexus */}
        <div className="w-full max-w-4xl">
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 border-b border-border-subtle pb-4">
            {capabilities.map((cap) => {
              const active = activeModule === cap.id;
              return (
                <button
                  key={cap.id}
                  onClick={() => setActiveModule(cap.id)}
                  className={`flex flex-col items-center justify-center rounded-xl p-2.5 transition-all text-center ${
                    active
                      ? "border border-cyan-400/40 bg-cyan-950/40 shadow-[0_0_15px_rgba(6,182,212,0.15)] text-cyan-200"
                      : "border border-transparent text-text-muted hover:text-text-primary hover:bg-surface-2/40"
                  }`}
                >
                  <span className="text-xs font-semibold">{cap.title}</span>
                  <span className="text-[10px] opacity-75">{cap.tag}</span>
                </button>
              );
            })}
          </div>

          {/* Active capability showcase card */}
          {(() => {
            const current = capabilities.find((c) => c.id === activeModule) || capabilities[0];
            return (
              <div
                key={current.id}
                className={`mt-4 rounded-2xl border ${current.border} bg-gradient-to-br ${current.color} p-6 shadow-2xl backdrop-blur-xl animate-fade-in`}
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border-subtle/40 pb-4">
                  <div>
                    <h3 className="text-lg font-bold text-text-primary">{current.title}</h3>
                    <p className="text-xs text-text-muted">{current.tag}</p>
                  </div>
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-cyan-400/30 bg-cyan-950/60 px-3 py-1 text-xs font-mono text-cyan-300">
                    <span className="size-1.5 rounded-full bg-cyan-400 animate-pulse" />
                    {current.status}
                  </span>
                </div>
                <p className="mt-4 text-sm text-text-secondary leading-relaxed">
                  {current.desc}
                </p>
                <div className="mt-6 flex items-center justify-between text-xs">
                  <span className="font-mono text-text-muted text-[11px]">System Status: Optimal</span>
                  <Link
                    href="/login"
                    className="font-medium text-cyan-300 hover:text-cyan-200 hover:underline"
                  >
                    Launch Module &rarr;
                  </Link>
                </div>
              </div>
            );
          })()}
        </div>
      </section>
    </main>
  );
}
