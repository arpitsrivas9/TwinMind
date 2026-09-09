"use client";

import React from "react";
import { useTheme, Theme } from "../../context/ThemeContext";

interface ThemeToggleProps {
  compact?: boolean;
  className?: string;
}

export function ThemeToggle({ compact = false, className = "" }: ThemeToggleProps) {
  const { theme, resolvedTheme, setTheme } = useTheme();

  const modes: { id: Theme; label: string; icon: string }[] = [
    { id: "dark", label: "Dark", icon: "☾" },
    { id: "light", label: "Light", icon: "☼" },
    { id: "system", label: "System", icon: "⚙" },
  ];

  if (compact) {
    return (
      <div
        className={`inline-flex items-center gap-0.5 rounded-lg border border-border-default bg-surface-2 p-0.5 text-xs ${className}`}
        role="group"
        aria-label="Select theme"
      >
        {modes.map((mode) => {
          const isActive = theme === mode.id;
          return (
            <button
              key={mode.id}
              type="button"
              onClick={() => setTheme(mode.id)}
              className={`flex size-7 items-center justify-center rounded-md text-xs transition-colors ${
                isActive
                  ? "bg-accent-cyan/15 text-accent-cyan-strong border border-accent-cyan/30 shadow-xs"
                  : "text-text-muted hover:text-text-primary hover:bg-surface-3"
              }`}
              title={`${mode.label} mode`}
              aria-label={`${mode.label} mode`}
              aria-pressed={isActive}
            >
              <span aria-hidden="true">{mode.icon}</span>
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div
      className={`grid grid-cols-3 gap-1 rounded-xl border border-border-default bg-surface-2/60 p-1 text-xs ${className}`}
      role="group"
      aria-label="Appearance selection"
    >
      {modes.map((mode) => {
        const isActive = theme === mode.id;
        return (
          <button
            key={mode.id}
            type="button"
            onClick={() => setTheme(mode.id)}
            className={`flex items-center justify-center gap-1.5 rounded-lg py-1.5 px-2 text-xs font-medium transition-all ${
              isActive
                ? "border border-cyan-400/40 bg-cyan-400/10 text-accent-cyan shadow-xs"
                : "text-text-secondary hover:text-text-primary hover:bg-surface-3"
            }`}
            aria-pressed={isActive}
          >
            <span aria-hidden="true" className="text-sm">{mode.icon}</span>
            <span>{mode.label}</span>
          </button>
        );
      })}
    </div>
  );
}
