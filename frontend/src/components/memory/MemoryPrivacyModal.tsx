"use client";

import React, { useState } from "react";
import { MemorySettings } from "../../lib/api";
import { Button } from "../ui";

type MemoryPrivacyModalProps = {
  isOpen: boolean;
  onClose: () => void;
  settings: MemorySettings;
  onUpdateSettings: (settings: Partial<MemorySettings>) => Promise<void>;
  onClearAll: () => Promise<void>;
};

export function MemoryPrivacyModal({
  isOpen,
  onClose,
  settings,
  onUpdateSettings,
  onClearAll,
}: MemoryPrivacyModalProps) {
  const [enabled, setEnabled] = useState(settings.enabled);
  const [autoExtract, setAutoExtract] = useState(settings.autoExtract);
  const [requireReview, setRequireReview] = useState(settings.requireReview);
  const [saving, setSaving] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSaveSettings = async () => {
    setSaving(true);
    setError(null);
    try {
      await onUpdateSettings({ enabled, autoExtract, requireReview });
      setNotice("Privacy settings saved successfully.");
      setTimeout(() => setNotice(null), 3000);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to update settings";
      setError(msg);
    } finally {
      setSaving(false);
    }
  };

  const handleClearAll = async () => {
    if (confirmText !== "CLEAR") {
      setError('Please type "CLEAR" to confirm deletion.');
      return;
    }

    setClearing(true);
    setError(null);
    try {
      await onClearAll();
      setConfirmClear(false);
      setConfirmText("");
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to clear memories";
      setError(msg);
    } finally {
      setClearing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in">
      <div className="relative w-full max-w-lg rounded-2xl border border-border-subtle bg-surface-1 p-6 shadow-2xl">
        <div className="flex items-center justify-between border-b border-border-subtle pb-4">
          <div className="flex items-center gap-2">
            <span className="flex size-7 items-center justify-center rounded-lg bg-cyan-400/10 text-cyan-300">
              ⚙
            </span>
            <h2 className="text-lg font-semibold text-text-primary">
              TwinMemory™ Privacy Controls
            </h2>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-text-muted hover:bg-surface-2 hover:text-text-primary transition-colors"
          >
            ✕
          </button>
        </div>

        <div className="mt-4 space-y-5">
          {error && (
            <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-300">
              {error}
            </div>
          )}
          {notice && (
            <div className="rounded-lg border border-cyan-500/30 bg-cyan-500/10 p-3 text-xs text-cyan-300">
              {notice}
            </div>
          )}

          {/* Toggle 1: Memory Enabled */}
          <div className="flex items-start justify-between gap-4 rounded-xl border border-border-subtle bg-surface-2 p-3.5">
            <div>
              <p className="text-sm font-medium text-text-primary">Enable TwinMemory™</p>
              <p className="mt-0.5 text-xs text-text-muted">
                When enabled, TwinMind recalls your saved preferences and facts across chat sessions.
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={enabled}
              onClick={() => setEnabled(!enabled)}
              className={`relative inline-flex h-6 w-11 shrink-0 rounded-full border transition-colors ${
                enabled ? "border-cyan-300/50 bg-cyan-400/30" : "border-border-default bg-surface-3"
              }`}
            >
              <span
                className={`absolute top-0.5 size-4.5 rounded-full transition-transform ${
                  enabled ? "translate-x-5 bg-cyan-200 shadow-sm" : "translate-x-0.5 bg-text-muted"
                }`}
              />
            </button>
          </div>

          {/* Toggle 2: Automatic Memory Extraction */}
          <div className="flex items-start justify-between gap-4 rounded-xl border border-border-subtle bg-surface-2 p-3.5">
            <div>
              <p className="text-sm font-medium text-text-primary">Automatic Extraction</p>
              <p className="mt-0.5 text-xs text-text-muted">
                Allow TwinMind to automatically identify and extract durable preferences and goals during conversations.
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={autoExtract}
              disabled={!enabled}
              onClick={() => setAutoExtract(!autoExtract)}
              className={`relative inline-flex h-6 w-11 shrink-0 rounded-full border transition-colors ${
                autoExtract && enabled
                  ? "border-cyan-300/50 bg-cyan-400/30"
                  : "border-border-default bg-surface-3 opacity-50"
              }`}
            >
              <span
                className={`absolute top-0.5 size-4.5 rounded-full transition-transform ${
                  autoExtract && enabled
                    ? "translate-x-5 bg-cyan-200 shadow-sm"
                    : "translate-x-0.5 bg-text-muted"
                }`}
              />
            </button>
          </div>

          {/* Toggle 3: Require User Review */}
          <div className="flex items-start justify-between gap-4 rounded-xl border border-border-subtle bg-surface-2 p-3.5">
            <div>
              <p className="text-sm font-medium text-text-primary">Require Manual Review</p>
              <p className="mt-0.5 text-xs text-text-muted">
                Extracted memories are saved as inactive/archived until you review and activate them.
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={requireReview}
              disabled={!enabled}
              onClick={() => setRequireReview(!requireReview)}
              className={`relative inline-flex h-6 w-11 shrink-0 rounded-full border transition-colors ${
                requireReview && enabled
                  ? "border-cyan-300/50 bg-cyan-400/30"
                  : "border-border-default bg-surface-3 opacity-50"
              }`}
            >
              <span
                className={`absolute top-0.5 size-4.5 rounded-full transition-transform ${
                  requireReview && enabled
                    ? "translate-x-5 bg-cyan-200 shadow-sm"
                    : "translate-x-0.5 bg-text-muted"
                }`}
              />
            </button>
          </div>

          <div className="flex justify-end">
            <Button onClick={handleSaveSettings} disabled={saving}>
              {saving ? "Saving..." : "Save Preferences"}
            </Button>
          </div>

          {/* Danger Zone: Clear All Memories */}
          <div className="mt-6 rounded-xl border border-rose-500/30 bg-rose-500/5 p-4">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-rose-400">
              Danger Zone
            </h3>
            <p className="mt-1 text-xs text-text-muted">
              Permanently erase all stored memories belonging to your account. This action cannot be undone.
            </p>

            {confirmClear ? (
              <div className="mt-3 space-y-2">
                <p className="text-xs font-medium text-rose-300">
                  Type <span className="font-mono font-bold text-white">CLEAR</span> below to confirm:
                </p>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={confirmText}
                    onChange={(e) => setConfirmText(e.target.value)}
                    placeholder="CLEAR"
                    className="w-32 rounded-lg border border-rose-500/40 bg-surface-2 px-2.5 py-1.5 text-xs text-white focus:border-rose-400 focus:outline-none"
                  />
                  <button
                    onClick={handleClearAll}
                    disabled={clearing || confirmText !== "CLEAR"}
                    className="rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-rose-500 disabled:opacity-40 transition-colors"
                  >
                    {clearing ? "Erasing..." : "Permanently Erase All"}
                  </button>
                  <button
                    onClick={() => {
                      setConfirmClear(false);
                      setConfirmText("");
                    }}
                    className="rounded-lg px-2.5 py-1.5 text-xs text-text-muted hover:bg-surface-2"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className="mt-3">
                <button
                  onClick={() => setConfirmClear(true)}
                  className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-1.5 text-xs font-semibold text-rose-300 hover:bg-rose-500/20 transition-colors"
                >
                  Clear All Memories
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
