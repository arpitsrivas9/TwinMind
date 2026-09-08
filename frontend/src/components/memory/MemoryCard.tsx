"use client";

import React, { useState } from "react";
import { Memory, MemoryType } from "../../lib/api";

type MemoryCardProps = {
  memory: Memory;
  onEdit: (memory: Memory) => void;
  onToggleActive: (memory: Memory) => void;
  onDelete: (id: string) => void;
};

const TYPE_CONFIG: Record<
  MemoryType,
  { label: string; bg: string; text: string; border: string; icon: string }
> = {
  USER_PREFERENCE: {
    label: "Preference",
    bg: "bg-purple-500/10",
    text: "text-purple-300",
    border: "border-purple-500/30",
    icon: "★",
  },
  GOAL: {
    label: "Goal",
    bg: "bg-emerald-500/10",
    text: "text-emerald-300",
    border: "border-emerald-500/30",
    icon: "🎯",
  },
  PROJECT: {
    label: "Project",
    bg: "bg-cyan-500/10",
    text: "text-cyan-300",
    border: "border-cyan-500/30",
    icon: "◈",
  },
  EPISODIC: {
    label: "Biographical",
    bg: "bg-amber-500/10",
    text: "text-amber-300",
    border: "border-amber-500/30",
    icon: "⏱",
  },
  SEMANTIC: {
    label: "Factual Fact",
    bg: "bg-sky-500/10",
    text: "text-sky-300",
    border: "border-sky-500/30",
    icon: "ℹ",
  },
  CONVERSATION: {
    label: "Past Context",
    bg: "bg-slate-500/10",
    text: "text-slate-300",
    border: "border-slate-500/30",
    icon: "💬",
  },
};

export function MemoryCard({
  memory,
  onEdit,
  onToggleActive,
  onDelete,
}: MemoryCardProps) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const typeConfig = TYPE_CONFIG[memory.type] || {
    label: memory.type,
    bg: "bg-surface-3",
    text: "text-text-primary",
    border: "border-border-subtle",
    icon: "◌",
  };

  const formattedDate = new Date(memory.createdAt).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  const getImportanceBadge = (importance: number) => {
    if (importance >= 8) {
      return (
        <span className="inline-flex items-center gap-1 rounded bg-rose-500/10 px-2 py-0.5 text-[10px] font-semibold text-rose-300 border border-rose-500/20">
          High ({importance})
        </span>
      );
    }
    if (importance >= 5) {
      return (
        <span className="inline-flex items-center gap-1 rounded bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold text-amber-300 border border-amber-500/20">
          Med ({importance})
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 rounded bg-slate-500/10 px-2 py-0.5 text-[10px] font-semibold text-slate-300 border border-slate-500/20">
        Low ({importance})
      </span>
    );
  };

  return (
    <div
      className={`group relative flex flex-col justify-between rounded-xl border p-4 transition-all duration-200 ${
        memory.isActive
          ? "border-border-subtle bg-surface-2/60 hover:border-cyan-400/30 hover:bg-surface-2/80 hover:shadow-lg hover:shadow-cyan-950/20"
          : "border-border-subtle/50 bg-surface-1/40 opacity-60"
      }`}
    >
      <div>
        {/* Header Tags */}
        <div className="flex flex-wrap items-center justify-between gap-2 pb-3">
          <div className="flex items-center gap-2">
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium border ${typeConfig.bg} ${typeConfig.text} ${typeConfig.border}`}
            >
              <span>{typeConfig.icon}</span>
              <span>{typeConfig.label}</span>
            </span>

            {getImportanceBadge(memory.importance)}

            {!memory.isActive && (
              <span className="rounded bg-text-muted/10 px-1.5 py-0.5 text-[10px] font-medium text-text-muted border border-border-subtle">
                Archived
              </span>
            )}
          </div>

          <span className="text-[11px] text-text-muted">{formattedDate}</span>
        </div>

        {/* Title / Summary */}
        {memory.summary && (
          <h3 className="mb-1.5 text-sm font-semibold text-text-primary group-hover:text-cyan-200 transition-colors">
            {memory.summary}
          </h3>
        )}

        {/* Content */}
        <p className="text-xs leading-relaxed text-text-secondary whitespace-pre-wrap">
          {memory.content}
        </p>
      </div>

      {/* Footer Info & Actions */}
      <div className="mt-4 flex items-center justify-between border-t border-border-subtle/60 pt-3 text-[11px] text-text-muted">
        <div className="flex items-center gap-3">
          <span title="Extraction confidence">
            Confidence: {Math.round(memory.confidence * 100)}%
          </span>
          {memory.lastAccessedAt && (
            <span title="Last retrieved into AI context">
              Active in context
            </span>
          )}
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => onToggleActive(memory)}
            className="rounded px-2 py-1 text-[11px] text-text-muted hover:bg-surface-3 hover:text-text-primary transition-colors"
            title={memory.isActive ? "Deactivate / Archive memory" : "Activate memory"}
          >
            {memory.isActive ? "Archive" : "Activate"}
          </button>

          <button
            onClick={() => onEdit(memory)}
            className="rounded px-2 py-1 text-[11px] text-text-muted hover:bg-surface-3 hover:text-cyan-300 transition-colors"
            title="Edit memory"
          >
            Edit
          </button>

          {confirmDelete ? (
            <div className="flex items-center gap-1">
              <button
                onClick={() => {
                  onDelete(memory.id);
                  setConfirmDelete(false);
                }}
                className="rounded bg-rose-500/20 px-2 py-0.5 text-[10px] font-bold text-rose-300 hover:bg-rose-500/30 transition-colors"
              >
                Confirm
              </button>
              <button
                onClick={() => setConfirmDelete(false)}
                className="rounded px-1.5 py-0.5 text-[10px] text-text-muted hover:bg-surface-3"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              onClick={() => setConfirmDelete(true)}
              className="rounded px-2 py-1 text-[11px] text-text-muted hover:bg-surface-3 hover:text-rose-400 transition-colors"
              title="Delete memory"
            >
              Delete
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
