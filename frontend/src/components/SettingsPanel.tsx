"use client";

import React, { useState, useEffect } from "react";
import { Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui";
import { WorkspacePageHeader } from "./WorkspacePageHeader";
import { useTheme, Theme } from "../context/ThemeContext";
import { useWorkspace } from "../context/WorkspaceContext";
import { useCognitiveActivity } from "../context/CognitiveContext";
import { TwinMindHeartbeat } from "./motion/TwinMindHeartbeat";
import { safeStorage, STORAGE_KEYS } from "../lib/storage";

type SettingsValues = {
  appearance: Theme;
  proactive: boolean;
  weeklyReview: boolean;
  privateWorkspace: boolean;
};

const defaultSettings: SettingsValues = {
  appearance: "dark",
  proactive: true,
  weeklyReview: false,
  privateWorkspace: true,
};

function Toggle({
  checked,
  label,
  onChange,
}: {
  checked: boolean;
  label: string;
  onChange: () => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={onChange}
      className={`relative inline-flex h-6 w-11 shrink-0 rounded-full border transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring ${
        checked ? "border-cyan-400/50 bg-cyan-500/30" : "border-border-default bg-surface-3"
      }`}
    >
      <span
        aria-hidden="true"
        className={`absolute top-0.5 size-4.5 rounded-full transition-transform ${
          checked
            ? "translate-x-5 bg-accent-cyan shadow-[0_0_12px_rgba(34,211,238,0.7)]"
            : "translate-x-0.5 bg-text-muted"
        }`}
      />
    </button>
  );
}

function SettingRow({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-start justify-between gap-3 border-b border-border-subtle py-4 last:border-b-0 last:pb-0 first:pt-0 sm:flex-row sm:items-center sm:gap-5">
      <div className="min-w-0">
        <p className="text-sm font-medium text-text-primary">{title}</p>
        <p className="mt-1 max-w-xl text-xs leading-5 text-text-muted">{description}</p>
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

export function SettingsPanel() {
  const { theme, setTheme } = useTheme();
  const { switchTab } = useWorkspace();
  const { triggerSuccess } = useCognitiveActivity();

  const [savedSettings, setSavedSettings] = useState<SettingsValues>(() => {
    const stored = safeStorage.get<Partial<SettingsValues>>(STORAGE_KEYS.UI_PREFERENCES, {});
    return { ...defaultSettings, ...stored, appearance: theme };
  });

  const [draftSettings, setDraftSettings] = useState<SettingsValues>(savedSettings);
  const [savedNotice, setSavedNotice] = useState(false);

  // Sync draft appearance when global theme changes
  useEffect(() => {
    setDraftSettings((prev) => ({ ...prev, appearance: theme }));
    setSavedSettings((prev) => ({ ...prev, appearance: theme }));
  }, [theme]);

  const hasChanges = JSON.stringify(savedSettings) !== JSON.stringify(draftSettings);

  const updateDraft = <Key extends keyof SettingsValues>(key: Key, value: SettingsValues[Key]) => {
    setDraftSettings((current) => ({ ...current, [key]: value }));
    setSavedNotice(false);

    // Apply theme immediately for visual preview
    if (key === "appearance") {
      setTheme(value as Theme);
    }
  };

  const saveSettings = () => {
    safeStorage.set(STORAGE_KEYS.UI_PREFERENCES, draftSettings);
    setSavedSettings(draftSettings);
    setTheme(draftSettings.appearance);
    setSavedNotice(true);
    triggerSuccess();
    setTimeout(() => setSavedNotice(false), 3000);
  };

  const resetSettings = () => {
    setDraftSettings(savedSettings);
    setTheme(savedSettings.appearance);
    setSavedNotice(false);
  };

  return (
    <div className="w-full max-w-5xl">
      <WorkspacePageHeader
        eyebrow="System preferences"
        title="Settings"
        description="Configure your appearance, workspace behavior, and intelligence preferences."
        status={
          <span className="inline-flex items-center gap-1.5 rounded-full border border-cyan-500/30 bg-cyan-950/60 px-2.5 py-0.5 text-xs font-mono text-cyan-300 shadow-[0_0_12px_rgba(6,182,212,0.15)]">
            <TwinMindHeartbeat size="xs" />
            Core Connected
          </span>
        }
        actions={
          <div className="flex items-center gap-2">
            {hasChanges ? <Badge variant="warning">Unsaved changes</Badge> : null}
            <Button variant="secondary" disabled={!hasChanges} onClick={resetSettings}>
              Reset
            </Button>
            <Button disabled={!hasChanges} onClick={saveSettings}>
              Save changes
            </Button>
          </div>
        }
      />

      {savedNotice ? (
        <div
          role="status"
          aria-live="polite"
          className="mt-5 rounded-md border border-emerald-400/30 bg-emerald-500/10 px-3 py-2.5 text-sm text-emerald-300"
        >
          ✓ Preferences saved successfully.
        </div>
      ) : null}

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card className="bg-surface-1/85">
          <CardHeader>
            <CardTitle>Account</CardTitle>
            <CardDescription>Your identity and workspace profile.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="divide-y divide-border-subtle">
              <SettingRow
                title="Profile identity"
                description="Update the name and email TwinMind associates with your cognitive system."
              >
                <button
                  type="button"
                  onClick={() => switchTab("profile")}
                  className="inline-flex items-center rounded-full border border-border-default bg-surface-2 px-3 py-1.5 text-xs font-medium tracking-wide text-text-primary transition-colors hover:border-border-strong hover:bg-surface-3 focus-visible:outline-2 focus-visible:outline-focus-ring"
                >
                  View profile →
                </button>
              </SettingRow>
              <SettingRow
                title="Authentication & Sessions"
                description="Your account is authenticated via cryptographic JWT tokens."
              >
                <Badge variant="success">Active</Badge>
              </SettingRow>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-surface-1/85">
          <CardHeader>
            <CardTitle>Appearance</CardTitle>
            <CardDescription>Choose the visual environment for your TwinMind OS.</CardDescription>
          </CardHeader>
          <CardContent>
            <fieldset>
              <legend className="sr-only">Appearance mode</legend>
              <div className="grid gap-2 sm:grid-cols-3">
                {(
                  [
                    { id: "dark", label: "Dark Obsidian", icon: "☾" },
                    { id: "light", label: "Light Kinetic", icon: "☼" },
                    { id: "system", label: "System Sync", icon: "⚙" },
                  ] as const
                ).map((mode) => (
                  <label
                    key={mode.id}
                    className={`flex cursor-pointer items-center gap-2.5 rounded-lg border p-3 text-xs font-medium transition-all ${
                      draftSettings.appearance === mode.id
                        ? "border-cyan-400/50 bg-cyan-400/10 text-accent-cyan shadow-xs"
                        : "border-border-default bg-surface-2 text-text-secondary hover:border-border-strong hover:text-text-primary"
                    }`}
                  >
                    <input
                      type="radio"
                      name="appearance"
                      value={mode.id}
                      checked={draftSettings.appearance === mode.id}
                      onChange={() => updateDraft("appearance", mode.id)}
                      className="sr-only"
                    />
                    <span aria-hidden="true" className="text-sm">{mode.icon}</span>
                    <span>{mode.label}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          </CardContent>
        </Card>

        <Card className="bg-surface-1/85">
          <CardHeader>
            <CardTitle>Intelligence preferences</CardTitle>
            <CardDescription>Shape how proactive TwinMind feels during assistance.</CardDescription>
          </CardHeader>
          <CardContent>
            <SettingRow
              title="Proactive suggestions"
              description="Allow TwinMind to surface relevant memories and graph connections."
            >
              <Toggle
                checked={draftSettings.proactive}
                label="Toggle proactive suggestions"
                onChange={() => updateDraft("proactive", !draftSettings.proactive)}
              />
            </SettingRow>

            <SettingRow
              title="Weekly cognitive digest"
              description="Compile insights and memory summaries automatically."
            >
              <Toggle
                checked={draftSettings.weeklyReview}
                label="Toggle weekly review"
                onChange={() => updateDraft("weeklyReview", !draftSettings.weeklyReview)}
              />
            </SettingRow>

            <SettingRow
              title="Strict private workspace"
              description="Enforce user isolation and prevent data cross-contamination."
            >
              <Toggle
                checked={draftSettings.privateWorkspace}
                label="Toggle private workspace"
                onChange={() => updateDraft("privateWorkspace", !draftSettings.privateWorkspace)}
              />
            </SettingRow>
          </CardContent>
        </Card>

        <Card className="bg-surface-1/85">
          <CardHeader>
            <CardTitle>Storage & Privacy</CardTitle>
            <CardDescription>Manage local preferences and security isolation.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-xs text-text-muted leading-relaxed">
              All credentials and encryption keys are strictly held on the server. Local browser storage is only used for non-sensitive UI theme and layout settings.
            </p>
            <div className="pt-2">
              <Badge variant="cyan">Zero Client Secret Guarantee</Badge>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
