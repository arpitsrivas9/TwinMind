"use client";

import React, { useEffect, useState } from "react";
import { AiModel, listAiModels } from "../../lib/api";

type ModelSelectorProps = {
  selectedModel: string;
  onSelectModel: (modelId: string) => void;
  disabled?: boolean;
};

export function ModelSelector({
  selectedModel,
  onSelectModel,
  disabled = false,
}: ModelSelectorProps) {
  const [models, setModels] = useState<AiModel[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    async function loadModels() {
      try {
        const fetched = await listAiModels();
        if (mounted) {
          setModels(fetched);
          if (fetched.length > 0) {
            // Check if selectedModel is valid among fetched
            const exists = fetched.some((m) => m.id === selectedModel);
            if (!exists) {
              onSelectModel(fetched[0].id);
            }
          }
        }
      } catch {
        // Fallback models if offline or unauthenticated
        if (mounted) {
          setModels([]);
        }
      } finally {
        if (mounted) setLoading(false);
      }
    }
    loadModels();
    return () => {
      mounted = false;
    };
  }, [selectedModel, onSelectModel]);

  if (loading) {
    return (
      <div className="flex items-center gap-1.5 rounded-md border border-border-subtle bg-surface-2 px-3 py-1.5 text-xs text-text-muted">
        <span className="size-2 animate-pulse rounded-full bg-accent-cyan" />
        <span>Loading models…</span>
      </div>
    );
  }

  if (models.length === 0) {
    return (
      <div className="flex items-center gap-1.5 rounded-md border border-amber-500/20 bg-amber-500/10 px-2.5 py-1 text-xs text-amber-300">
        <span className="size-1.5 rounded-full bg-amber-400" />
        <span>No models configured (set API key in backend)</span>
      </div>
    );
  }

  return (
    <div className="relative inline-flex items-center shrink-0 max-w-[115px] min-[380px]:max-w-[145px] sm:max-w-[220px]">
      <label htmlFor="model-select" className="sr-only">
        Select AI Model
      </label>
      <select
        id="model-select"
        value={selectedModel}
        disabled={disabled}
        onChange={(e) => onSelectModel(e.target.value)}
        className="w-full truncate cursor-pointer appearance-none rounded-lg border border-border-subtle bg-surface-2 py-1 pl-2 sm:pl-2.5 pr-5 sm:pr-6 text-xs font-medium text-text-primary transition-colors hover:border-border-strong focus-visible:border-accent-cyan focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
      >
        {models.map((model) => (
          <option key={model.id} value={model.id} className="bg-surface-1 text-text-primary">
            {model.displayName} ({model.provider})
          </option>
        ))}
      </select>
      <span className="pointer-events-none absolute right-1.5 sm:right-2 text-[9px] text-text-muted">
        ▼
      </span>
    </div>
  );
}

