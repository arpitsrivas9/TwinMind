"use client";

import React from "react";
import { useTwinVoice } from "../../context/VoiceContext";

export function WakeWordToggle() {
  const { isWakeWordEnabled, toggleWakeWord, isWakeWordListening } = useTwinVoice();

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-border-subtle bg-surface-2 p-3.5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-base">🎙️</span>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-text-primary">
                Wake Word Activation (&ldquo;Hey Buddy&rdquo;)
              </span>
              {isWakeWordEnabled && (
                <span className="flex items-center gap-1 rounded-full bg-emerald-950/60 border border-emerald-500/40 px-2 py-0.5 text-[10px] font-mono text-emerald-300">
                  <span className="size-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  <span>{isWakeWordListening ? "Armed" : "Standby"}</span>
                </span>
              )}
            </div>
            <p className="text-[11px] text-text-muted mt-0.5">
              100% on-device speech detection. Zero audio is transmitted to cloud servers while waiting.
            </p>
          </div>
        </div>

        <button
          type="button"
          role="switch"
          aria-checked={isWakeWordEnabled}
          onClick={toggleWakeWord}
          className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-accent-cyan ${
            isWakeWordEnabled ? "bg-accent-cyan" : "bg-slate-700"
          }`}
        >
          <span
            className={`pointer-events-none inline-block size-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
              isWakeWordEnabled ? "translate-x-5" : "translate-x-0"
            }`}
          />
        </button>
      </div>
    </div>
  );
}

