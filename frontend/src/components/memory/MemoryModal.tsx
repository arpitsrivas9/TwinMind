"use client";

import React, { useState } from "react";
import { Memory, MemoryType } from "../../lib/api";
import { Button } from "../ui";

type MemoryModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: {
    type: MemoryType;
    content: string;
    summary?: string;
    importance: number;
    isActive?: boolean;
  }) => Promise<void>;
  editingMemory?: Memory | null;
};

const MEMORY_TYPES: { value: MemoryType; label: string; desc: string }[] = [
  { value: "USER_PREFERENCE", label: "User Preference", desc: "Communication style, tools, formatting, environment" },
  { value: "GOAL", label: "Goal", desc: "Target milestones, career aspirations, objectives" },
  { value: "PROJECT", label: "Project", desc: "Software applications, codebases, systems being built" },
  { value: "EPISODIC", label: "Biographical Event", desc: "Completed experiences, job changes, interviews" },
  { value: "SEMANTIC", label: "Factual Background", desc: "Skills, languages, technologies, knowledge facts" },
  { value: "CONVERSATION", label: "Past Context", desc: "General durable insights remembered from conversations" },
];

function MemoryModalForm({
  onClose,
  onSave,
  editingMemory,
}: {
  onClose: () => void;
  onSave: MemoryModalProps["onSave"];
  editingMemory?: Memory | null;
}) {
  const [type, setType] = useState<MemoryType>(editingMemory?.type || "USER_PREFERENCE");
  const [content, setContent] = useState(editingMemory?.content || "");
  const [summary, setSummary] = useState(editingMemory?.summary || "");
  const [importance, setImportance] = useState(editingMemory?.importance ?? 7);
  const [isActive, setIsActive] = useState(editingMemory?.isActive ?? true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim()) {
      setError("Memory content is required.");
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      await onSave({
        type,
        content: content.trim(),
        summary: summary.trim() || undefined,
        importance,
        isActive,
      });
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to save memory";
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in">
      <div className="relative w-full max-w-lg rounded-2xl border border-border-subtle bg-surface-1 p-6 shadow-2xl">
        <div className="flex items-center justify-between border-b border-border-subtle pb-4">
          <div className="flex items-center gap-2">
            <span className="flex size-7 items-center justify-center rounded-lg bg-cyan-400/10 text-cyan-300">
              ◌
            </span>
            <h2 className="text-lg font-semibold text-text-primary">
              {editingMemory ? "Edit Memory" : "Create New Memory"}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-text-muted hover:bg-surface-2 hover:text-text-primary transition-colors"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          {error && (
            <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-300">
              {error}
            </div>
          )}

          {/* Memory Type */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-text-muted mb-1.5">
              Memory Taxonomy Type
            </label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value as MemoryType)}
              className="w-full rounded-lg border border-border-subtle bg-surface-2 px-3 py-2 text-sm text-text-primary focus:border-cyan-400 focus:outline-none"
            >
              {MEMORY_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label} — {t.desc}
                </option>
              ))}
            </select>
          </div>

          {/* Summary */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-text-muted mb-1.5">
              Headline / Summary (Optional)
            </label>
            <input
              type="text"
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              placeholder="e.g. Prefers concise bullet points"
              maxLength={255}
              className="w-full rounded-lg border border-border-subtle bg-surface-2 px-3 py-2 text-sm text-text-primary placeholder:text-text-muted/60 focus:border-cyan-400 focus:outline-none"
            />
          </div>

          {/* Content */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-text-muted mb-1.5">
              Durable Memory Content *
            </label>
            <textarea
              rows={4}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="e.g. User prefers concise, direct answers formatted in bullet points without excessive pleasantries."
              className="w-full resize-none rounded-lg border border-border-subtle bg-surface-2 px-3 py-2 text-sm text-text-primary placeholder:text-text-muted/60 focus:border-cyan-400 focus:outline-none"
            />
            <p className="mt-1 text-[11px] text-text-muted">
              State facts cleanly. Never include passwords, API keys, or private tokens.
            </p>
          </div>

          {/* Importance Slider */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-semibold uppercase tracking-wider text-text-muted">
                Importance Ranking
              </label>
              <span className="text-xs font-mono font-bold text-cyan-300">
                {importance} / 10
              </span>
            </div>
            <input
              type="range"
              min={1}
              max={10}
              value={importance}
              onChange={(e) => setImportance(Number(e.target.value))}
              className="w-full accent-cyan-400 cursor-pointer"
            />
            <div className="flex justify-between text-[10px] text-text-muted mt-0.5">
              <span>Low (Contextual)</span>
              <span>Medium (Active)</span>
              <span>High (Lifetime Core)</span>
            </div>
          </div>

          {/* Active status toggle (if editing) */}
          {editingMemory && (
            <div className="flex items-center justify-between rounded-lg border border-border-subtle bg-surface-2 p-3">
              <div>
                <p className="text-xs font-medium text-text-primary">Active Memory</p>
                <p className="text-[11px] text-text-muted">
                  Deactivated memories are kept in history but not injected into AI context.
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={isActive}
                onClick={() => setIsActive(!isActive)}
                className={`relative inline-flex h-6 w-11 shrink-0 rounded-full border transition-colors ${
                  isActive ? "border-cyan-300/50 bg-cyan-400/30" : "border-border-default bg-surface-3"
                }`}
              >
                <span
                  className={`absolute top-0.5 size-4.5 rounded-full transition-transform ${
                    isActive ? "translate-x-5 bg-cyan-200 shadow-sm" : "translate-x-0.5 bg-text-muted"
                  }`}
                />
              </button>
            </div>
          )}

          {/* Footer Actions */}
          <div className="flex items-center justify-end gap-2.5 pt-4 border-t border-border-subtle">
            <Button variant="secondary" onClick={onClose} type="button" disabled={submitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? "Saving..." : editingMemory ? "Update Memory" : "Create Memory"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function MemoryModal(props: MemoryModalProps) {
  if (!props.isOpen) return null;
  return (
    <MemoryModalForm
      key={props.editingMemory?.id || "new-memory-dialog"}
      {...props}
    />
  );
}
