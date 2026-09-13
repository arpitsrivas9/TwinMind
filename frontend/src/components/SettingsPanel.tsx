"use client";

import React, { useState, useMemo, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui";
import { WorkspacePageHeader } from "./WorkspacePageHeader";
import { useTheme, Theme } from "../context/ThemeContext";
import { useWorkspace } from "../context/WorkspaceContext";
import { useCognitiveActivity } from "../context/CognitiveContext";
import { TwinMindHeartbeat } from "./motion/TwinMindHeartbeat";
import { safeStorage, STORAGE_KEYS } from "../lib/storage";
import { useTwinVoice } from "../context/VoiceContext";
import { VoiceLanguagePreference, VoiceSpeakingStyle, VoiceSettings } from "../types/voice";
import { TrustSettingsSection } from "./trust/TrustSettingsSection";

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
      <motion.span
        layout
        transition={{ type: "spring", stiffness: 500, damping: 30 }}
        aria-hidden="true"
        className={`absolute top-0.5 size-4.5 rounded-full ${
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

  const {
    settings: voiceSettings,
    updateSettings: updateVoiceSettings,
    availableVoices,
    previewVoice,
    stopPreview,
    isPreviewPlaying,
  } = useTwinVoice();

  const [savedSettings, setSavedSettings] = useState<SettingsValues>(() => {
    const stored = safeStorage.get<Partial<SettingsValues>>(STORAGE_KEYS.UI_PREFERENCES, {});
    return { ...defaultSettings, ...stored, appearance: theme };
  });

  const [draftSettings, setDraftSettings] = useState<SettingsValues>(savedSettings);
  const [savedVoiceSettings, setSavedVoiceSettings] = useState<VoiceSettings>(() => voiceSettings);
  const [draftVoiceSettings, setDraftVoiceSettings] = useState<VoiceSettings>(() => voiceSettings);
  const [savedNotice, setSavedNotice] = useState(false);
  const [prevTheme, setPrevTheme] = useState(theme);
  const voiceInitializedRef = useRef(false);

  // Sync saved voice settings when loaded from context or storage initially
  useEffect(() => {
    if (!voiceInitializedRef.current && (voiceSettings.voiceUri || availableVoices.length > 0)) {
      voiceInitializedRef.current = true;
      setSavedVoiceSettings(voiceSettings);
      setDraftVoiceSettings(voiceSettings);
    }
  }, [voiceSettings, availableVoices]);

  // Sync draft appearance when global theme changes
  if (prevTheme !== theme) {
    setPrevTheme(theme);
    setDraftSettings((prev) => ({ ...prev, appearance: theme }));
    setSavedSettings((prev) => ({ ...prev, appearance: theme }));
  }

  const hasSettingsChanges = JSON.stringify(savedSettings) !== JSON.stringify(draftSettings);
  const hasVoiceChanges = JSON.stringify(savedVoiceSettings) !== JSON.stringify(draftVoiceSettings);
  const hasChanges = hasSettingsChanges || hasVoiceChanges;

  const updateDraft = <Key extends keyof SettingsValues>(key: Key, value: SettingsValues[Key]) => {
    setDraftSettings((current) => ({ ...current, [key]: value }));
    setSavedNotice(false);

    // Apply theme immediately for visual preview
    if (key === "appearance") {
      setTheme(value as Theme);
    }
  };

  const updateDraftVoice = (patch: Partial<VoiceSettings>) => {
    setDraftVoiceSettings((prev) => ({ ...prev, ...patch }));
    setSavedNotice(false);
  };

  const draftSelectedVoiceMetadata = useMemo(() => {
    if (!draftVoiceSettings.voiceUri) return availableVoices[0] || null;
    return (
      availableVoices.find((v) => v.id === draftVoiceSettings.voiceUri) ||
      availableVoices[0] ||
      null
    );
  }, [availableVoices, draftVoiceSettings.voiceUri]);

  const saveSettings = () => {
    if (hasSettingsChanges) {
      safeStorage.set(STORAGE_KEYS.UI_PREFERENCES, draftSettings);
      setSavedSettings(draftSettings);
      setTheme(draftSettings.appearance);
    }
    if (hasVoiceChanges) {
      safeStorage.set(STORAGE_KEYS.VOICE_SETTINGS, draftVoiceSettings);
      updateVoiceSettings(draftVoiceSettings);
      setSavedVoiceSettings(draftVoiceSettings);
    }
    setSavedNotice(true);
    triggerSuccess();
    setTimeout(() => setSavedNotice(false), 3000);
  };

  const resetSettings = () => {
    setDraftSettings(savedSettings);
    setTheme(savedSettings.appearance);
    setDraftVoiceSettings(savedVoiceSettings);
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

      <AnimatePresence>
        {savedNotice && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.2 }}
            role="status"
            aria-live="polite"
            className="mt-5 rounded-md border border-emerald-400/30 bg-emerald-500/10 px-3 py-2.5 text-sm text-emerald-300"
          >
            ✓ Preferences saved successfully.
          </motion.div>
        )}
      </AnimatePresence>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        {/* TWINVOICE™ OS Personalization Card */}
        <Card className="bg-surface-1/85 lg:col-span-2 border-cyan-500/30 shadow-[0_0_30px_rgba(6,182,212,0.08)]">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <span className="flex size-2.5 rounded-full bg-cyan-400 animate-pulse" />
                <CardTitle className="tracking-wide">TWINVOICE™ Personalization</CardTitle>
              </div>
              <Badge variant="cyan">Voice-First OS</Badge>
            </div>
            <CardDescription>
              Shape your assistant voice, conversational language (English, Hindi, natural Hinglish), speaking style, and hands-free behavior.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid gap-6 md:grid-cols-2">
              {/* Assistant Voice Selector */}
              <div className="space-y-2">
                <label className="text-xs font-mono font-semibold uppercase tracking-wider text-text-secondary flex items-center justify-between">
                  <span>Assistant Voice</span>
                  {draftSelectedVoiceMetadata && (
                    <span className="text-[10px] text-cyan-400 font-normal">
                      {draftSelectedVoiceMetadata.style || "Natural"}
                    </span>
                  )}
                </label>
                <div className="flex gap-2">
                  <select
                    value={draftVoiceSettings.voiceUri || ""}
                    onChange={(e) => updateDraftVoice({ voiceUri: e.target.value || null })}
                    className="w-full rounded-lg border border-border-default bg-surface-2 px-3 py-2 text-xs text-text-primary focus:border-cyan-400 focus:outline-hidden"
                  >
                    {availableVoices.length === 0 ? (
                      <option value="">Default System Voice</option>
                    ) : (
                      availableVoices.map((v) => (
                        <option key={v.id} value={v.id}>
                          {v.displayName} ({v.languageLabel}) {v.style ? `— ${v.style}` : ""}
                        </option>
                      ))
                    )}
                  </select>

                  {/* Preview Button */}
                  <button
                    type="button"
                    onClick={() => {
                      if (isPreviewPlaying) {
                        stopPreview();
                      } else {
                        previewVoice(draftVoiceSettings.voiceUri || undefined);
                      }
                    }}
                    className={`shrink-0 inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-medium transition-all ${
                      isPreviewPlaying
                        ? "border border-teal-500/50 bg-teal-950/60 text-teal-300 shadow-[0_0_15px_rgba(20,184,166,0.3)]"
                        : "border border-border-default bg-surface-2 text-text-primary hover:bg-surface-3 hover:border-border-strong"
                    }`}
                    title="Preview selected voice sample"
                  >
                    {isPreviewPlaying ? (
                      <>
                        <span className="size-2 rounded-xs bg-teal-400 animate-pulse" />
                        <span>Playing…</span>
                      </>
                    ) : (
                      <>
                        <span>▶</span>
                        <span>Preview</span>
                      </>
                    )}
                  </button>
                </div>
                {draftSelectedVoiceMetadata && (
                  <p className="text-[11px] text-text-muted leading-relaxed italic">
                    {draftSelectedVoiceMetadata.description}
                  </p>
                )}
              </div>

              {/* Response Language Selector */}
              <div className="space-y-2">
                <label className="text-xs font-mono font-semibold uppercase tracking-wider text-text-secondary">
                  Response Language
                </label>
                <select
                  value={draftVoiceSettings.language}
                  onChange={(e) => updateDraftVoice({ language: e.target.value as VoiceLanguagePreference })}
                  className="w-full rounded-lg border border-border-default bg-surface-2 px-3 py-2 text-xs text-text-primary focus:border-cyan-400 focus:outline-hidden"
                >
                  <option value="auto">Auto Detect (English / Hindi / Hinglish)</option>
                  <option value="en">English (Natural English)</option>
                  <option value="hi">Hindi (हिन्दी — Devanagari)</option>
                  <option value="hinglish">Hinglish (Natural Indian Conversational — Roman Script)</option>
                </select>
                <p className="text-[11px] text-text-muted leading-relaxed">
                  {draftVoiceSettings.language === "auto"
                    ? "Infers your conversational language and script automatically from your prompts."
                    : draftVoiceSettings.language === "hinglish"
                    ? "Responds in contemporary Roman Hinglish with natural Indian conversational phrasing."
                    : draftVoiceSettings.language === "hi"
                    ? "Responds in modern, fluent Hindi script (Devanagari)."
                    : "Responds in fluent, standard English."}
                </p>
              </div>

              {/* Speaking Style Selector */}
              <div className="space-y-2">
                <label className="text-xs font-mono font-semibold uppercase tracking-wider text-text-secondary">
                  Speaking Style
                </label>
                <select
                  value={draftVoiceSettings.speakingStyle}
                  onChange={(e) => updateDraftVoice({ speakingStyle: e.target.value as VoiceSpeakingStyle })}
                  className="w-full rounded-lg border border-border-default bg-surface-2 px-3 py-2 text-xs text-text-primary focus:border-cyan-400 focus:outline-hidden"
                >
                  <option value="conversational">Conversational (Warm, engaging, natural)</option>
                  <option value="professional">Professional (Clear, structured, focused)</option>
                  <option value="concise">Concise (Direct, succinct, zero filler)</option>
                  <option value="friendly">Friendly (Upbeat, encouraging, collaborative)</option>
                </select>
                <p className="text-[11px] text-text-muted leading-relaxed">
                  Shapes the pacing, density, and conversational cadence of TwinMind&apos;s responses.
                </p>
              </div>

              {/* Speech Delivery Sliders */}
              <div className="space-y-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-mono text-text-secondary">Speech Rate</span>
                  <span className="font-mono text-cyan-400">{draftVoiceSettings.speechRate.toFixed(1)}x</span>
                </div>
                <input
                  type="range"
                  min="0.8"
                  max="1.4"
                  step="0.1"
                  value={draftVoiceSettings.speechRate}
                  onChange={(e) => updateDraftVoice({ speechRate: parseFloat(e.target.value) })}
                  className="w-full accent-cyan-400 cursor-pointer"
                />

                <div className="flex items-center justify-between text-xs pt-1">
                  <span className="font-mono text-text-secondary">Speech Pitch</span>
                  <span className="font-mono text-cyan-400">{draftVoiceSettings.speechPitch.toFixed(1)}</span>
                </div>
                <input
                  type="range"
                  min="0.8"
                  max="1.2"
                  step="0.1"
                  value={draftVoiceSettings.speechPitch}
                  onChange={(e) => updateDraftVoice({ speechPitch: parseFloat(e.target.value) })}
                  className="w-full accent-cyan-400 cursor-pointer"
                />
              </div>
            </div>

            {/* Voice Behavior Toggles */}
            <div className="border-t border-border-subtle pt-4 divide-y divide-border-subtle">
              <SettingRow
                title="Voice audio response"
                description="Speak TwinMind's answers aloud in real time using the selected assistant voice."
              >
                <Toggle
                  checked={draftVoiceSettings.voiceResponseEnabled}
                  label="Toggle voice audio response"
                  onChange={() => updateDraftVoice({ voiceResponseEnabled: !draftVoiceSettings.voiceResponseEnabled })}
                />
              </SettingRow>

              <SettingRow
                title="Hands-free continuous conversation"
                description="Automatically resume listening after TwinMind finishes speaking so you can continue talking uninterrupted."
              >
                <Toggle
                  checked={draftVoiceSettings.continuousConversation}
                  label="Toggle continuous hands-free conversation"
                  onChange={() => updateDraftVoice({ continuousConversation: !draftVoiceSettings.continuousConversation })}
                />
              </SettingRow>

              <SettingRow
                title='Wake word detection ("Hey Buddy")'
                description="Listen locally in background for the hands-free wake word without sending background audio to servers."
              >
                <Toggle
                  checked={draftVoiceSettings.wakeWordEnabled}
                  label="Toggle wake word detection"
                  onChange={() => updateDraftVoice({ wakeWordEnabled: !draftVoiceSettings.wakeWordEnabled })}
                />
              </SettingRow>

              <SettingRow
                title="Acoustic sound effects & cues"
                description="Harmonic Web Audio chimes for wake-word activation, listening state, and barge-in interruptions."
              >
                <Toggle
                  checked={draftVoiceSettings.soundEffectsEnabled}
                  label="Toggle acoustic cues"
                  onChange={() => updateDraftVoice({ soundEffectsEnabled: !draftVoiceSettings.soundEffectsEnabled })}
                />
              </SettingRow>
            </div>
          </CardContent>
        </Card>

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

        <TrustSettingsSection />

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
