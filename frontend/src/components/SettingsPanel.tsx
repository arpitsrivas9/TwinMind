"use client";

import Link from "next/link";
import { useState } from "react";

import { Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui";
import { WorkspacePageHeader } from "./WorkspacePageHeader";

type SettingsValues = {
  appearance: "system" | "dark";
  proactive: boolean;
  weeklyReview: boolean;
  privateWorkspace: boolean;
};

const initialSettings: SettingsValues = {
  appearance: "dark",
  proactive: true,
  weeklyReview: false,
  privateWorkspace: true,
};

function Toggle({ checked, label, onChange }: { checked: boolean; label: string; onChange: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={onChange}
      className={`relative inline-flex h-6 w-11 shrink-0 rounded-full border transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring ${
        checked ? "border-cyan-300/50 bg-cyan-300/30" : "border-border-default bg-surface-3"
      }`}
    >
      <span
        aria-hidden="true"
        className={`absolute top-0.5 size-4.5 rounded-full transition-transform ${
          checked ? "translate-x-5 bg-cyan-100 shadow-[0_0_12px_rgb(165_243_252/70%)]" : "translate-x-0.5 bg-text-muted"
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
  const [savedSettings, setSavedSettings] = useState(initialSettings);
  const [draftSettings, setDraftSettings] = useState(initialSettings);
  const [savedNotice, setSavedNotice] = useState(false);

  const hasChanges = JSON.stringify(savedSettings) !== JSON.stringify(draftSettings);

  const updateDraft = <Key extends keyof SettingsValues>(key: Key, value: SettingsValues[Key]) => {
    setDraftSettings((current) => ({ ...current, [key]: value }));
    setSavedNotice(false);
  };

  const saveSettings = () => {
    setSavedSettings(draftSettings);
    setSavedNotice(true);
  };

  const resetSettings = () => {
    setDraftSettings(savedSettings);
    setSavedNotice(false);
  };

  return (
    <div className="w-full max-w-5xl">
      <WorkspacePageHeader
        eyebrow="System preferences"
        title="Settings"
        description="Tune how TwinMind will eventually understand, remember, and surface information."
        status={<Badge variant="cyan">Local preview</Badge>}
        actions={
          <>
          {hasChanges ? <Badge variant="warning">Unsaved changes</Badge> : null}
          <Button variant="secondary" disabled={!hasChanges} onClick={resetSettings}>Reset</Button>
          <Button disabled={!hasChanges} onClick={saveSettings}>Save changes</Button>
          </>
        }
      />

      {savedNotice ? (
        <div role="status" aria-live="polite" className="mt-5 rounded-md border border-emerald-300/25 bg-emerald-300/10 px-3 py-2.5 text-sm text-emerald-200">
          Preferences saved locally for this preview. Persistence will be connected in a later phase.
        </div>
      ) : null}

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card className="bg-surface-1/85">
          <CardHeader>
            <CardTitle>Account</CardTitle>
            <CardDescription>Your identity and future workspace access.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="divide-y divide-border-subtle">
              <SettingRow title="Profile identity" description="Update the name and email TwinMind associates with your cognitive system.">
                <Link
                  href="/profile"
                  className="inline-flex items-center rounded-full border border-border-default bg-white/4 px-2.5 py-1 text-xs font-medium tracking-wide text-text-secondary transition-colors hover:border-border-strong hover:text-text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
                >
                  Profile
                </Link>
              </SettingRow>
              <SettingRow title="Authentication" description="Password, sessions, and sign-in protection will be managed here later.">
                <Badge variant="violet">Planned</Badge>
              </SettingRow>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-surface-1/85">
          <CardHeader>
            <CardTitle>Appearance</CardTitle>
            <CardDescription>Choose the visual environment for your workspace.</CardDescription>
          </CardHeader>
          <CardContent>
            <fieldset>
              <legend className="sr-only">Appearance mode</legend>
              <div className="grid gap-2 sm:grid-cols-2">
                {(["dark", "system"] as const).map((mode) => (
                  <label
                    key={mode}
                    className={`flex cursor-pointer items-center gap-3 rounded-md border px-3 py-3 text-sm transition-colors ${
                      draftSettings.appearance === mode ? "border-cyan-300/40 bg-cyan-300/10 text-cyan-100" : "border-border-default bg-background/40 text-text-secondary hover:border-border-strong"
                    }`}
                  >
                    <input
                      type="radio"
                      name="appearance"
                      value={mode}
                      checked={draftSettings.appearance === mode}
                      onChange={() => updateDraft("appearance", mode)}
                      className="accent-cyan-300"
                    />
                    <span>{mode === "dark" ? "Deep space" : "System default"}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          </CardContent>
        </Card>

        <Card className="bg-surface-1/85">
          <CardHeader>
            <CardTitle>Intelligence preferences</CardTitle>
            <CardDescription>Shape how proactive TwinMind should eventually feel.</CardDescription>
          </CardHeader>
          <CardContent>
            <SettingRow title="Proactive suggestions" description="Allow TwinMind to surface relevant context when it detects a useful connection.">
              <Toggle checked={draftSettings.proactive} label="Toggle proactive suggestions" onChange={() => updateDraft("proactive", !draftSettings.proactive)} />
            </SettingRow>
            <SettingRow title="Weekly reflection" description="Prepare a future review of patterns, unfinished thoughts, and meaningful connections.">
              <Toggle checked={draftSettings.weeklyReview} label="Toggle weekly reflection" onChange={() => updateDraft("weeklyReview", !draftSettings.weeklyReview)} />
            </SettingRow>
          </CardContent>
        </Card>

        <Card className="bg-surface-1/85">
          <CardHeader>
            <CardTitle>Privacy</CardTitle>
            <CardDescription>Establish the trust boundary around your personal information.</CardDescription>
          </CardHeader>
          <CardContent>
            <SettingRow title="Private workspace" description="Keep your future memories and context isolated to your TwinMind identity.">
              <Toggle checked={draftSettings.privateWorkspace} label="Toggle private workspace" onChange={() => updateDraft("privateWorkspace", !draftSettings.privateWorkspace)} />
            </SettingRow>
            <SettingRow title="Data controls" description="Export, retention, and deletion controls will appear when data features are connected.">
              <Badge variant="violet">Planned</Badge>
            </SettingRow>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
