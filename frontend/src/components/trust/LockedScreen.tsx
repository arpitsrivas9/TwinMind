"use client";

import React, { useState } from 'react';
import { useTrust } from '../../context/TrustContext';
import { Lock, Fingerprint, UserCheck, ShieldAlert, ArrowRight } from './icons';

export function LockedScreen() {
  const { mode, lockedReason, verifyIdentity, setMode } = useTrust();
  const [unlocking, setUnlocking] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (mode !== 'LOCKED') return null;

  const handleUnlockWithOs = async () => {
    setUnlocking(true);
    setErrorMessage(null);
    try {
      const ok = await verifyIdentity('OS_AUTH');
      if (!ok) {
        setErrorMessage('Verification failed. Please try again or switch to Guest Mode.');
      }
    } catch {
      setErrorMessage('Could not complete biometric authentication.');
    } finally {
      setUnlocking(false);
    }
  };

  const handleGuestMode = async () => {
    setErrorMessage(null);
    await setMode('GUEST');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/90 backdrop-blur-xl p-4 animate-in fade-in duration-300">
      <div className="w-full max-w-md p-8 rounded-3xl bg-slate-900/90 border border-slate-750 shadow-[0_0_50px_rgba(0,0,0,0.8)] text-center space-y-6">
        {/* Pulsing Lock Icon */}
        <div className="relative mx-auto w-20 h-20 flex items-center justify-center">
          <div className="absolute inset-0 rounded-full bg-rose-500/20 animate-ping opacity-60" />
          <div className="relative w-16 h-16 rounded-full bg-rose-950/80 border border-rose-800/80 flex items-center justify-center text-rose-400 shadow-[0_0_25px_rgba(244,63,94,0.4)]">
            <Lock className="w-8 h-8" />
          </div>
        </div>

        {/* Title & Description */}
        <div className="space-y-2">
          <h2 className="text-2xl font-bold text-slate-100 tracking-tight">TwinMind is Locked</h2>
          <p className="text-xs text-slate-400 max-w-sm mx-auto leading-relaxed">
            {lockedReason || 'Your cognitive memory, private documents, and knowledge graph are restricted.'}
          </p>
        </div>

        {/* Error notification */}
        {errorMessage && (
          <div className="p-3 rounded-xl bg-rose-950/50 border border-rose-800/60 text-xs text-rose-300 flex items-center gap-2 text-left">
            <ShieldAlert className="w-4 h-4 text-rose-400 flex-shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Unlock Action Buttons */}
        <div className="space-y-3 pt-2">
          <button
            type="button"
            onClick={handleUnlockWithOs}
            disabled={unlocking}
            className="w-full py-3.5 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-sm flex items-center justify-center gap-2 shadow-lg shadow-indigo-600/25 transition disabled:opacity-50 cursor-pointer"
          >
            <Fingerprint className="w-5 h-5" />
            <span>{unlocking ? 'Verifying Identity...' : 'Unlock with Windows Hello / Touch ID'}</span>
          </button>

          <button
            type="button"
            onClick={handleGuestMode}
            disabled={unlocking}
            className="w-full py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-750 text-slate-300 font-medium text-xs flex items-center justify-center gap-2 border border-slate-700 transition cursor-pointer"
          >
            <UserCheck className="w-4 h-4 text-amber-400" />
            <span>Switch to Guest Mode</span>
            <ArrowRight className="w-3.5 h-3.5 opacity-60" />
          </button>
        </div>

        {/* Security watermark */}
        <div className="pt-4 border-t border-slate-800/60 text-[11px] text-slate-500 flex items-center justify-center gap-1.5">
          <span className="font-semibold text-slate-400">TwinTrust™</span>
          <span>Zero-Knowledge Boundary</span>
        </div>
      </div>
    </div>
  );
}
