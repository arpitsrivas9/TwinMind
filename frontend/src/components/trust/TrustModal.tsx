"use client";

import React, { useState } from 'react';
import { useTrust } from '../../context/TrustContext';
import { AudioRecorder } from '../../lib/voice/speechToText';
import {
  Shield,
  ShieldCheck,
  Lock,
  UserCheck,
  Eye,
  EyeOff,
  Fingerprint,
  Mic,
  Camera,
  X,
  CheckCircle2,
  AlertTriangle,
  Info,
} from './icons';

export function TrustModal() {
  const {
    mode,
    trustScore,
    privacyShieldActive,
    breakdown,
    isModalOpen,
    loading,
    voiceEnrolled,
    closeModal,
    setMode,
    lock,
    togglePrivacyShield,
    verifyIdentity,
    enrollVoice,
  } = useTrust();

  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(
    null,
  );
  const [verifyingMethod, setVerifyingMethod] = useState<string | null>(null);
  const [isEnrollingVoice, setIsEnrollingVoice] = useState(false);

  if (!isModalOpen) return null;

  const handleVerify = async (method: 'OS_AUTH' | 'VOICE' | 'FACE') => {
    setFeedback(null);
    if (method === 'VOICE' && !voiceEnrolled) {
      setFeedback({
        type: 'error',
        message: 'Owner voice is not enrolled yet. Please click "Enroll Voice" below to register your voice.',
      });
      return;
    }

    setVerifyingMethod(method);
    try {
      const ok = await verifyIdentity(method);
      if (ok) {
        setFeedback({
          type: 'success',
          message:
            method === 'OS_AUTH'
              ? 'OS Biometrics verified successfully! Owner Mode active.'
              : method === 'VOICE'
              ? 'Voice biometrics matched! Owner Mode elevated.'
              : 'Face verification passed! Owner Mode elevated.',
        });
      } else {
        setFeedback({
          type: 'error',
          message:
            method === 'VOICE'
              ? 'Voice biometric did not match owner profile. Guest Mode enforced.'
              : 'Verification challenge could not be validated. Please try again.',
        });
      }
    } catch {
      setFeedback({
        type: 'error',
        message: 'Verification failed. Please check device permissions.',
      });
    } finally {
      setVerifyingMethod(null);
    }
  };

  const handleEnrollVoiceModal = async () => {
    setFeedback(null);
    setIsEnrollingVoice(true);
    try {
      const recorder = new AudioRecorder();
      await recorder.start();
      await new Promise((resolve) => setTimeout(resolve, 3500));
      const blob = await recorder.stop();
      const ok = await enrollVoice(blob);
      if (ok) {
        setFeedback({
          type: 'success',
          message: 'Owner voice enrolled successfully! Acoustic profile active.',
        });
      } else {
        setFeedback({
          type: 'error',
          message: 'Voice enrollment failed. Active Owner Mode is required to enroll.',
        });
      }
    } catch {
      setFeedback({
        type: 'error',
        message: 'Microphone access denied or recording failed.',
      });
    } finally {
      setIsEnrollingVoice(false);
    }
  };

  const handleModeSwitch = async (newMode: 'OWNER' | 'GUEST') => {
    setFeedback(null);
    try {
      await setMode(newMode);
      setFeedback({
        type: 'success',
        message:
          newMode === 'OWNER'
            ? 'Switched to Owner Mode. Full cognitive access granted.'
            : 'Switched to Guest Mode. Private memories and documents are strictly hidden.',
      });
    } catch {
      setFeedback({ type: 'error', message: 'Failed to switch mode.' });
    }
  };

  const handleLock = async () => {
    setFeedback(null);
    await lock();
    closeModal();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-md p-4 animate-in fade-in duration-200">
      <div className="relative w-full max-w-xl bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-900/90">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-indigo-950/60 border border-indigo-800/50 text-indigo-400">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-slate-100 flex items-center gap-2">
                TwinTrust™ Security & Identity
              </h2>
              <p className="text-xs text-slate-400">
                Deterministic trust layer protecting personal cognitive data
              </p>
            </div>
          </div>
          <button
            onClick={closeModal}
            type="button"
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="p-6 overflow-y-auto space-y-6 text-sm text-slate-300">
          {/* Feedback banner */}
          {feedback && (
            <div
              className={`p-3 rounded-xl flex items-center gap-2.5 text-xs font-medium border ${
                feedback.type === 'success'
                  ? 'bg-emerald-950/50 border-emerald-800/60 text-emerald-300'
                  : 'bg-rose-950/50 border-rose-800/60 text-rose-300'
              }`}
            >
              {feedback.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
              ) : (
                <AlertTriangle className="w-4 h-4 text-rose-400 flex-shrink-0" />
              )}
              <span>{feedback.message}</span>
            </div>
          )}

          {/* Current Mode & Trust Score Meter */}
          <div className="p-4 rounded-xl bg-slate-800/50 border border-slate-750 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-xs font-mono text-slate-400 uppercase tracking-wider">
                  Current State
                </span>
                <div className="text-base font-bold text-slate-100 flex items-center gap-2 mt-0.5">
                  {mode === 'OWNER' && (
                    <>
                      <Shield className="w-4 h-4 text-emerald-400" />
                      <span className="text-emerald-400">Owner Mode (Full Cognitive Access)</span>
                    </>
                  )}
                  {mode === 'GUEST' && (
                    <>
                      <UserCheck className="w-4 h-4 text-amber-400" />
                      <span className="text-amber-400">Guest Mode (Memory Sandboxed)</span>
                    </>
                  )}
                  {mode === 'LOCKED' && (
                    <>
                      <Lock className="w-4 h-4 text-rose-400" />
                      <span className="text-rose-400">TwinMind Locked</span>
                    </>
                  )}
                </div>
              </div>
              <div className="text-right">
                <span className="text-xs font-mono text-slate-400 uppercase tracking-wider">
                  Trust Score
                </span>
                <div className="text-2xl font-black text-slate-100 font-mono">
                  {trustScore}
                  <span className="text-xs text-slate-400 font-normal">/100</span>
                </div>
              </div>
            </div>

            {/* Score progress bar */}
            <div className="w-full bg-slate-900 rounded-full h-2.5 overflow-hidden border border-slate-700/50">
              <div
                className={`h-full transition-all duration-500 rounded-full ${
                  trustScore >= 70
                    ? 'bg-gradient-to-r from-emerald-500 to-teal-400'
                    : trustScore >= 40
                    ? 'bg-gradient-to-r from-amber-500 to-yellow-400'
                    : 'bg-gradient-to-r from-rose-500 to-red-400'
                }`}
                style={{ width: `${Math.max(5, trustScore)}%` }}
              />
            </div>

            {/* Explainable Signals */}
            {breakdown?.reasons && breakdown.reasons.length > 0 && (
              <div className="pt-2 border-t border-slate-700/50 space-y-1">
                <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">
                  Explainable Trust Signals:
                </span>
                <ul className="space-y-1 text-xs text-slate-400">
                  {breakdown.reasons.map((reason, idx) => (
                    <li key={idx} className="flex items-center gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                      <span>{reason}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {/* Verification Actions */}
          <div className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Verify Identity & Elevate Trust
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              {/* OS Auth / Passkey */}
              <button
                type="button"
                onClick={() => handleVerify('OS_AUTH')}
                disabled={loading}
                className="p-3 rounded-xl bg-slate-800/80 hover:bg-slate-750 border border-slate-700 text-left transition flex flex-col justify-between gap-2 group disabled:opacity-50"
              >
                <div className="flex items-center justify-between w-full">
                  <Fingerprint className="w-5 h-5 text-indigo-400 group-hover:scale-110 transition" />
                  <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-indigo-950 text-indigo-300 border border-indigo-800/40">
                    Passkey
                  </span>
                </div>
                <div>
                  <div className="font-semibold text-slate-200 text-xs">OS Biometrics</div>
                  <div className="text-[11px] text-slate-400">Windows Hello / Touch ID</div>
                </div>
              </button>

              {/* Voice Biometrics */}
              <button
                type="button"
                onClick={() => handleVerify('VOICE')}
                disabled={loading || isEnrollingVoice}
                className="p-3 rounded-xl bg-slate-800/80 hover:bg-slate-750 border border-slate-700 text-left transition flex flex-col justify-between gap-2 group disabled:opacity-50"
              >
                <div className="flex items-center justify-between w-full">
                  <Mic className="w-5 h-5 text-cyan-400 group-hover:scale-110 transition" />
                  <span
                    className={`text-[10px] uppercase font-mono px-1.5 py-0.5 rounded border ${
                      voiceEnrolled
                        ? 'bg-emerald-950 text-emerald-300 border-emerald-800/40'
                        : 'bg-cyan-950 text-cyan-300 border-cyan-800/40'
                    }`}
                  >
                    {voiceEnrolled ? 'Active' : 'Not Enrolled'}
                  </span>
                </div>
                <div>
                  <div className="font-semibold text-slate-200 text-xs">TwinVoice™ Match</div>
                  <div className="text-[11px] text-slate-400">
                    {voiceEnrolled ? 'Verify acoustic profile' : 'Enroll voice to activate'}
                  </div>
                </div>
              </button>

              {/* Face Biometrics */}
              <button
                type="button"
                onClick={() => handleVerify('FACE')}
                disabled={loading || isEnrollingVoice}
                className="p-3 rounded-xl bg-slate-800/80 hover:bg-slate-750 border border-slate-700 text-left transition flex flex-col justify-between gap-2 group disabled:opacity-50"
              >
                <div className="flex items-center justify-between w-full">
                  <Camera className="w-5 h-5 text-purple-400 group-hover:scale-110 transition" />
                  <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-purple-950 text-purple-300 border border-purple-800/40">
                    Face
                  </span>
                </div>
                <div>
                  <div className="font-semibold text-slate-200 text-xs">Face & Liveness</div>
                  <div className="text-[11px] text-slate-400">Local visual verification</div>
                </div>
              </button>
            </div>
            {verifyingMethod && (
              <p className="text-xs text-indigo-400 animate-pulse mt-1">
                {verifyingMethod === 'VOICE'
                  ? 'Listening to your voice... Speak naturally (2.5s)'
                  : `Verifying with ${verifyingMethod}...`}
              </p>
            )}

            {/* Voice Enrollment Banner if not enrolled and Owner mode is active */}
            {!voiceEnrolled && mode === 'OWNER' && (
              <div className="p-3 rounded-xl bg-cyan-950/40 border border-cyan-800/40 flex items-center justify-between gap-3 text-xs mt-2">
                <div>
                  <div className="font-semibold text-cyan-300">Enroll Owner Voice Biometric</div>
                  <div className="text-slate-400 text-[11px]">
                    Teach TwinMind your vocal timbre for seamless verification
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleEnrollVoiceModal}
                  disabled={isEnrollingVoice || loading}
                  className="px-3 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white font-medium text-xs transition flex items-center gap-1.5 shrink-0 disabled:opacity-50"
                >
                  <Mic className="w-3.5 h-3.5" />
                  {isEnrollingVoice ? 'Listening (3.5s)...' : 'Enroll Voice'}
                </button>
              </div>
            )}
          </div>

          {/* Mode Switcher & Lock Controls */}
          <div className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Trust Mode Management
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => handleModeSwitch('OWNER')}
                disabled={loading || mode === 'OWNER'}
                className={`p-3 rounded-xl border text-left transition flex items-start gap-3 ${
                  mode === 'OWNER'
                    ? 'bg-emerald-950/30 border-emerald-700/60 text-emerald-300'
                    : 'bg-slate-800/60 border-slate-700 hover:bg-slate-800 text-slate-300'
                }`}
              >
                <Shield className="w-4 h-4 mt-0.5 text-emerald-400 flex-shrink-0" />
                <div>
                  <div className="font-semibold text-xs text-slate-200">Owner Mode</div>
                  <div className="text-[11px] text-slate-400">Full personal cognitive memory & graph</div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => handleModeSwitch('GUEST')}
                disabled={loading || mode === 'GUEST'}
                className={`p-3 rounded-xl border text-left transition flex items-start gap-3 ${
                  mode === 'GUEST'
                    ? 'bg-amber-950/30 border-amber-700/60 text-amber-300'
                    : 'bg-slate-800/60 border-slate-700 hover:bg-slate-800 text-slate-300'
                }`}
              >
                <UserCheck className="w-4 h-4 mt-0.5 text-amber-400 flex-shrink-0" />
                <div>
                  <div className="font-semibold text-xs text-slate-200">Guest Mode</div>
                  <div className="text-[11px] text-slate-400">Safe for visitors / demos; memory hidden</div>
                </div>
              </button>
            </div>
          </div>

          {/* Privacy Shield & Quick Lock */}
          <div className="pt-2 border-t border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3">
            <button
              type="button"
              onClick={togglePrivacyShield}
              disabled={loading}
              className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium border transition w-full sm:w-auto justify-center ${
                privacyShieldActive
                  ? 'bg-purple-950/50 border-purple-700 text-purple-200'
                  : 'bg-slate-800 border-slate-700 hover:bg-slate-750 text-slate-300'
              }`}
            >
              {privacyShieldActive ? (
                <>
                  <EyeOff className="w-4 h-4 text-purple-400" />
                  <span>Privacy Shield: ON</span>
                </>
              ) : (
                <>
                  <Eye className="w-4 h-4 text-slate-400" />
                  <span>Enable Privacy Shield</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={handleLock}
              disabled={loading}
              className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium bg-rose-950/40 border border-rose-800/60 hover:bg-rose-950/80 text-rose-300 transition w-full sm:w-auto justify-center"
            >
              <Lock className="w-4 h-4 text-rose-400" />
              <span>Lock TwinMind Now</span>
            </button>
          </div>
        </div>

        {/* Footer info */}
        <div className="px-6 py-3 border-t border-slate-800 bg-slate-950 text-[11px] text-slate-500 flex items-center justify-between">
          <span className="flex items-center gap-1">
            <Info className="w-3 h-3" />
            Auto-lock active (15 min inactivity)
          </span>
          <span className="font-mono">Server-Enforced</span>
        </div>
      </div>
    </div>
  );
}
