"use client";

import React from 'react';
import { useTrust } from '../../context/TrustContext';
import { Shield, ShieldAlert, Lock, UserCheck, EyeOff } from './icons';

export function TrustBadge({ compact = false }: { compact?: boolean } = {}) {
  const { mode, trustScore, privacyShieldActive, openModal } = useTrust();

  const getBadgeConfig = () => {
    switch (mode) {
      case 'OWNER':
        return {
          icon: <Shield className="w-3.5 h-3.5 text-emerald-400 shrink-0" />,
          label: 'Owner Mode',
          subLabel: `${trustScore}% Trust`,
          bg: 'bg-emerald-950/40 border-emerald-800/50 hover:border-emerald-700/80 text-emerald-300',
          dotBg: 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.6)]',
        };
      case 'GUEST':
        return {
          icon: <UserCheck className="w-3.5 h-3.5 text-amber-400 shrink-0" />,
          label: 'Guest Mode',
          subLabel: 'Sandboxed',
          bg: 'bg-amber-950/40 border-amber-800/50 hover:border-amber-700/80 text-amber-300',
          dotBg: 'bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.6)]',
        };
      case 'LOCKED':
        return {
          icon: <Lock className="w-3.5 h-3.5 text-rose-400 shrink-0" />,
          label: 'Locked',
          subLabel: 'Verify to Unlock',
          bg: 'bg-rose-950/50 border-rose-800/60 hover:border-rose-700 text-rose-300',
          dotBg: 'bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.7)]',
        };
      default:
        return {
          icon: <ShieldAlert className="w-3.5 h-3.5 text-slate-400 shrink-0" />,
          label: 'Unknown',
          subLabel: '',
          bg: 'bg-slate-900 border-slate-700 text-slate-300',
          dotBg: 'bg-slate-500',
        };
    }
  };

  const config = getBadgeConfig();

  return (
    <div className="flex items-center gap-1.5 shrink-0">
      <button
        onClick={openModal}
        type="button"
        title="TwinTrust™ Security & Identity Layer — Click to inspect or change trust mode"
        className={`flex items-center gap-1.5 px-2 sm:px-2.5 py-0.5 sm:py-1 rounded-full text-xs font-medium border transition-all duration-200 backdrop-blur-md cursor-pointer shrink-0 ${config.bg}`}
      >
        <span className="relative flex h-2 w-2 shrink-0">
          <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${config.dotBg}`} />
          <span className={`relative inline-flex rounded-full h-2 w-2 ${config.dotBg}`} />
        </span>
        {config.icon}
        <span className={`font-semibold ${compact ? "hidden min-[480px]:inline" : "hidden min-[380px]:inline"}`}>
          {config.label}
        </span>
        {config.subLabel && (
          <span className="hidden sm:inline-block opacity-75 font-mono text-[11px] border-l border-white/10 pl-1.5 ml-0.5">
            {config.subLabel}
          </span>
        )}
      </button>

      {privacyShieldActive && (
        <span
          title="Privacy Shield Active: Private sensitive data masked in preview"
          className="flex items-center gap-1 px-1.5 sm:px-2 py-0.5 rounded-full text-[11px] font-medium bg-purple-950/50 border border-purple-800/50 text-purple-300 shrink-0"
        >
          <EyeOff className="w-3 h-3 text-purple-400" />
          <span className="hidden sm:inline">Shielded</span>
        </span>
      )}
    </div>
  );
}
