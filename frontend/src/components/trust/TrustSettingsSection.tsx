"use client";

import React, { useState } from 'react';
import { useTrust } from '../../context/TrustContext';
import { AudioRecorder } from '../../lib/voice/speechToText';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  Badge,
  Button,
} from '../ui';
import {
  Shield,
  ShieldCheck,
  Lock,
  Eye,
  EyeOff,
  Laptop,
  Trash2,
  Plus,
  Activity,
  Mic,
} from './icons';

export function TrustSettingsSection() {
  const {
    mode,
    trustScore,
    privacyShieldActive,
    devices,
    auditLogs,
    loading,
    voiceEnrolled,
    lock,
    togglePrivacyShield,
    openModal,
    registerDevice,
    revokeDevice,
    enrollVoice,
    revokeVoice,
  } = useTrust();

  const [newDeviceLabel, setNewDeviceLabel] = useState('');
  const [showAddDevice, setShowAddDevice] = useState(false);
  const [isRecordingVoice, setIsRecordingVoice] = useState(false);
  const [voiceFeedback, setVoiceFeedback] = useState<string | null>(null);

  const handleEnrollVoice = async () => {
    setVoiceFeedback(null);
    setIsRecordingVoice(true);
    try {
      const recorder = new AudioRecorder();
      await recorder.start();
      await new Promise((resolve) => setTimeout(resolve, 3500));
      const blob = await recorder.stop();
      const ok = await enrollVoice(blob);
      if (ok) {
        setVoiceFeedback('Owner voice biometric enrolled successfully! Acoustic profile active.');
      } else {
        setVoiceFeedback('Voice enrollment failed. Strong owner authentication required.');
      }
    } catch {
      setVoiceFeedback('Microphone permission denied or recording failed.');
    } finally {
      setIsRecordingVoice(false);
    }
  };

  const handleRevokeVoice = async () => {
    if (!confirm('Are you sure you want to revoke the enrolled voice biometric profile?')) {
      return;
    }
    setVoiceFeedback(null);
    const ok = await revokeVoice();
    if (ok) {
      setVoiceFeedback('Voice biometric enrollment revoked.');
    } else {
      setVoiceFeedback('Failed to revoke voice biometric profile.');
    }
  };

  const handleAddDevice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDeviceLabel.trim()) return;
    await registerDevice(newDeviceLabel.trim());
    setNewDeviceLabel('');
    setShowAddDevice(false);
  };

  return (
    <Card className="bg-surface-1/85 border border-border-subtle">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <ShieldCheck className="w-5 h-5 text-accent-cyan" />
            <div>
              <CardTitle>TwinTrust™ Security & Identity</CardTitle>
              <CardDescription>
                Zero-knowledge biometric trust verification, modes, and device authorization.
              </CardDescription>
            </div>
          </div>
          <Badge variant={mode === 'OWNER' ? 'success' : mode === 'GUEST' ? 'warning' : 'neutral'}>
            {mode} ({trustScore}%)
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Trust Mode & Quick Actions */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-4 rounded-xl bg-surface-2 border border-border-subtle">
          <div>
            <span className="text-xs font-semibold text-text-primary">Current Mode: {mode}</span>
            <p className="text-xs text-text-muted mt-0.5">
              {mode === 'OWNER'
                ? 'Full cognitive access to private memories, documents, and graph.'
                : mode === 'GUEST'
                ? 'Guest Mode active. Private personal context is strictly withheld.'
                : 'TwinMind is locked. Identity verification is required.'}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button
              variant="secondary"
              onClick={openModal}
              className="text-xs min-h-0 py-1.5 px-3 flex items-center gap-1.5"
            >
              <Shield className="w-3.5 h-3.5" />
              Verify / Switch
            </Button>
            <Button
              variant="danger"
              onClick={lock}
              disabled={loading || mode === 'LOCKED'}
              className="text-xs min-h-0 py-1.5 px-3 flex items-center gap-1.5"
            >
              <Lock className="w-3.5 h-3.5" />
              Lock Now
            </Button>
          </div>
        </div>

        {/* Privacy Shield Toggle */}
        <div className="flex items-center justify-between p-4 rounded-xl bg-surface-2 border border-border-subtle">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-text-primary">Privacy Shield</span>
              {privacyShieldActive ? (
                <Badge variant="violet">Active</Badge>
              ) : (
                <Badge variant="neutral">Inactive</Badge>
              )}
            </div>
            <p className="text-xs text-text-muted mt-0.5 max-w-lg">
              Redacts sensitive names, locations, and personal identifiers from preview cards and background notifications.
            </p>
          </div>
          <Button
            variant="secondary"
            onClick={togglePrivacyShield}
            disabled={loading}
            className="text-xs min-h-0 py-1.5 px-3 flex items-center gap-1.5"
          >
            {privacyShieldActive ? (
              <>
                <EyeOff className="w-3.5 h-3.5 text-violet-400" />
                Disable
              </>
            ) : (
              <>
                <Eye className="w-3.5 h-3.5" />
                Enable
              </>
            )}
          </Button>
        </div>

        {/* Voice Biometrics Identity Section */}
        <div className="p-4 rounded-xl bg-surface-2 border border-border-subtle space-y-3">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-text-primary">Owner Voice Identity</span>
                {voiceEnrolled ? (
                  <Badge variant="success">Enrolled & Active</Badge>
                ) : (
                  <Badge variant="neutral">Not Enrolled</Badge>
                )}
              </div>
              <p className="text-xs text-text-muted mt-0.5 max-w-lg">
                {voiceEnrolled
                  ? 'Acoustic speaker verification is active. Unrecognized speakers will be automatically demoted to Guest Mode to protect private data.'
                  : 'Enroll your voice so TwinMind recognizes you naturally and locks private information when another person speaks.'}
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Button
                variant="secondary"
                onClick={handleEnrollVoice}
                disabled={loading || isRecordingVoice || mode !== 'OWNER'}
                title={mode !== 'OWNER' ? 'Owner Mode required to enroll voice' : undefined}
                className="text-xs min-h-0 py-1.5 px-3 flex items-center gap-1.5 disabled:opacity-50"
              >
                <Mic className="w-3.5 h-3.5" />
                {isRecordingVoice ? 'Recording (3.5s)...' : voiceEnrolled ? 'Re-enroll' : 'Enroll Voice'}
              </Button>
              {voiceEnrolled && (
                <Button
                  variant="danger"
                  onClick={handleRevokeVoice}
                  disabled={loading || isRecordingVoice || mode !== 'OWNER'}
                  title={mode !== 'OWNER' ? 'Owner Mode required to revoke voice' : undefined}
                  className="text-xs min-h-0 py-1.5 px-3 flex items-center gap-1.5 disabled:opacity-50"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Revoke
                </Button>
              )}
            </div>
          </div>
          {voiceFeedback && (
            <div className="text-xs font-medium text-accent-cyan pt-1 border-t border-border-subtle">
              {voiceFeedback}
            </div>
          )}
        </div>

        {/* Trusted Devices */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-text-primary uppercase tracking-wider">
              Authorized Trusted Devices ({devices.length})
            </span>
            <Button
              variant="ghost"
              onClick={() => setShowAddDevice(!showAddDevice)}
              className="text-xs min-h-0 py-1 px-2.5 flex items-center gap-1 text-accent-cyan"
            >
              <Plus className="w-3.5 h-3.5" />
              Register Device
            </Button>
          </div>

          {showAddDevice && (
            <form onSubmit={handleAddDevice} className="flex gap-2 p-3 rounded-xl bg-surface-3 border border-border-subtle">
              <input
                type="text"
                placeholder="e.g. Work MacBook, Home PC"
                value={newDeviceLabel}
                onChange={(e) => setNewDeviceLabel(e.target.value)}
                className="flex-1 bg-surface-1 border border-border-subtle rounded-lg px-3 py-1.5 text-xs text-text-primary focus:outline-none focus:border-accent-cyan"
              />
              <Button type="submit" variant="primary" className="text-xs min-h-0 py-1.5 px-3">
                Save
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setShowAddDevice(false)}
                className="text-xs min-h-0 py-1.5 px-3"
              >
                Cancel
              </Button>
            </form>
          )}

          <div className="space-y-2">
            {devices.map((device) => (
              <div
                key={device.id}
                className="flex items-center justify-between p-3 rounded-xl bg-surface-2 border border-border-subtle text-xs"
              >
                <div className="flex items-center gap-3">
                  <Laptop className="w-4 h-4 text-text-muted" />
                  <div>
                    <div className="font-semibold text-text-primary flex items-center gap-2">
                      <span>{device.label}</span>
                      {device.isTrusted && (
                        <span className="text-[10px] px-1.5 py-0.2 rounded bg-emerald-950/60 text-emerald-300 border border-emerald-800/40">
                          Trusted
                        </span>
                      )}
                    </div>
                    <div className="text-[10px] text-text-muted font-mono">
                      Last used: {new Date(device.lastUsedAt).toLocaleString()}
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => revokeDevice(device.id)}
                  title="Revoke device authorization"
                  className="p-1.5 rounded-lg text-rose-400 hover:bg-rose-500/10 transition"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
            {devices.length === 0 && (
              <p className="text-xs text-text-muted italic">No registered devices found.</p>
            )}
          </div>
        </div>

        {/* Security Audit Logs */}
        <div className="space-y-3 pt-2 border-t border-border-subtle">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-text-primary uppercase tracking-wider flex items-center gap-1.5">
              <Activity className="w-3.5 h-3.5 text-accent-cyan" />
              Security Audit Trail (Last 10 Actions)
            </span>
          </div>
          <div className="max-h-48 overflow-y-auto space-y-1.5 text-[11px] font-mono">
            {auditLogs.slice(0, 10).map((log) => (
              <div
                key={log.id}
                className="flex items-center justify-between p-2 rounded-lg bg-surface-2/60 border border-border-subtle/60"
              >
                <div className="flex items-center gap-2">
                  <span
                    className={`size-1.5 rounded-full ${
                      log.status === 'SUCCESS' ? 'bg-emerald-400' : 'bg-rose-400'
                    }`}
                  />
                  <span className="font-semibold text-text-primary">{log.action}</span>
                  <span className="text-text-muted">({log.status})</span>
                </div>
                <div className="flex items-center gap-3 text-text-muted">
                  <span>Score: {log.trustScore}</span>
                  <span>{new Date(log.createdAt).toLocaleTimeString()}</span>
                </div>
              </div>
            ))}
            {auditLogs.length === 0 && (
              <p className="text-xs text-text-muted italic">No audit records recorded yet.</p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
