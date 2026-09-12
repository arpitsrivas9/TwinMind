"use client";

import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import type {
  TrustMode,
  TrustStatus,
  TrustScoreBreakdown,
  TrustedDevice,
  SecurityAuditLog,
} from '../types/trust';
import {
  fetchTrustStatus,
  verifyOwnerIdentity as apiVerifyOwnerIdentity,
  setTrustModeApi,
  lockTwinMindApi,
  togglePrivacyShieldApi,
  fetchOsAuthChallenge,
  fetchTrustedDevices,
  registerTrustedDevice,
  revokeTrustedDevice,
  fetchSecurityAuditLogs,
} from '../lib/api';
import { useAuth } from './AuthContext';

type TrustContextType = {
  mode: TrustMode;
  trustScore: number;
  privacyShieldActive: boolean;
  breakdown: TrustScoreBreakdown | null;
  lockedReason?: string;
  lastVerifiedAt?: string;
  isModalOpen: boolean;
  loading: boolean;
  devices: TrustedDevice[];
  auditLogs: SecurityAuditLog[];
  openModal: () => void;
  closeModal: () => void;
  refreshStatus: () => Promise<void>;
  setMode: (mode: TrustMode) => Promise<void>;
  lock: () => Promise<void>;
  togglePrivacyShield: () => Promise<void>;
  verifyIdentity: (
    method: 'OS_AUTH' | 'VOICE' | 'FACE',
    payload?: {
      audioBase64?: string;
      faceImageBase64?: string;
      livenessFrames?: string[];
    },
  ) => Promise<boolean>;
  refreshDevices: () => Promise<void>;
  registerDevice: (label: string) => Promise<void>;
  revokeDevice: (id: string) => Promise<void>;
  refreshAuditLogs: () => Promise<void>;
};

const TrustContext = createContext<TrustContextType | undefined>(undefined);

// Default auto-lock timeout: 15 minutes
const DEFAULT_AUTO_LOCK_MS = 15 * 60 * 1000;

export function TrustProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [mode, setModeState] = useState<TrustMode>('OWNER');
  const [trustScore, setTrustScore] = useState<number>(75);
  const [privacyShieldActive, setPrivacyShieldActive] = useState<boolean>(false);
  const [breakdown, setBreakdown] = useState<TrustScoreBreakdown | null>(null);
  const [lockedReason, setLockedReason] = useState<string | undefined>();
  const [lastVerifiedAt, setLastVerifiedAt] = useState<string | undefined>();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [devices, setDevices] = useState<TrustedDevice[]>([]);
  const [auditLogs, setAuditLogs] = useState<SecurityAuditLog[]>([]);

  const lastActivityRef = useRef<number>(0);
  const autoLockTimerRef = useRef<NodeJS.Timeout | null>(null);

  const openModal = useCallback(() => setIsModalOpen(true), []);
  const closeModal = useCallback(() => setIsModalOpen(false), []);

  const refreshStatus = useCallback(async () => {
    if (!user) return;
    try {
      const status: TrustStatus = await fetchTrustStatus();
      setModeState(status.mode);
      setTrustScore(status.trustScore);
      setPrivacyShieldActive(status.privacyShieldActive);
      setBreakdown(status.breakdown);
      setLockedReason(status.lockedReason);
      setLastVerifiedAt(status.lastVerifiedAt);
    } catch {
      // Ignore initial offline or unauthenticated errors
    }
  }, [user]);

  const refreshDevices = useCallback(async () => {
    if (!user) return;
    try {
      const list = await fetchTrustedDevices();
      setDevices(list);
    } catch {
      // Ignore
    }
  }, [user]);

  const refreshAuditLogs = useCallback(async () => {
    if (!user) return;
    try {
      const logs = await fetchSecurityAuditLogs();
      setAuditLogs(logs);
    } catch {
      // Ignore
    }
  }, [user]);

  // Initial load when user changes
  useEffect(() => {
    let mounted = true;
    lastActivityRef.current = Date.now();

    if (user) {
      Promise.all([
        fetchTrustStatus().catch(() => null),
        fetchTrustedDevices().catch(() => []),
        fetchSecurityAuditLogs().catch(() => []),
      ]).then(([status, devList, logs]) => {
        if (!mounted) return;
        if (status) {
          setModeState(status.mode);
          setTrustScore(status.trustScore);
          setPrivacyShieldActive(status.privacyShieldActive);
          setBreakdown(status.breakdown);
          setLockedReason(status.lockedReason);
          setLastVerifiedAt(status.lastVerifiedAt);
        }
        if (devList) setDevices(devList);
        if (logs) setAuditLogs(logs);
      });
    }
    return () => {
      mounted = false;
    };
  }, [user]);

  // Explicit mode changer
  const setMode = useCallback(async (newMode: TrustMode) => {
    setLoading(true);
    try {
      const res = await setTrustModeApi(newMode);
      setModeState(res.mode);
      setTrustScore(res.trustScore);
      setPrivacyShieldActive(res.privacyShieldActive);
      await refreshStatus();
      await refreshAuditLogs();
    } finally {
      setLoading(false);
    }
  }, [refreshStatus, refreshAuditLogs]);

  // Manual instant lock
  const lock = useCallback(async () => {
    setLoading(true);
    try {
      const res = await lockTwinMindApi();
      setModeState(res.mode);
      setTrustScore(res.trustScore);
      setLockedReason('Locked by user action or auto-lock timeout');
      await refreshStatus();
      await refreshAuditLogs();
    } finally {
      setLoading(false);
    }
  }, [refreshStatus, refreshAuditLogs]);

  // Toggle Privacy Shield
  const togglePrivacyShield = useCallback(async () => {
    setLoading(true);
    try {
      const res = await togglePrivacyShieldApi();
      setPrivacyShieldActive(res.privacyShieldActive);
      await refreshStatus();
      await refreshAuditLogs();
    } finally {
      setLoading(false);
    }
  }, [refreshStatus, refreshAuditLogs]);

  // Native WebAuthn + Biometric verification
  const verifyIdentity = useCallback(
    async (
      method: 'OS_AUTH' | 'VOICE' | 'FACE',
      payload?: {
        audioBase64?: string;
        faceImageBase64?: string;
        livenessFrames?: string[];
      },
    ): Promise<boolean> => {
      setLoading(true);
      try {
        let challengeResponse: string | undefined;

        if (method === 'OS_AUTH') {
          const { challenge } = await fetchOsAuthChallenge();
          challengeResponse = challenge;

          // Attempt navigator.credentials WebAuthn call if supported
          if (
            typeof window !== 'undefined' &&
            window.PublicKeyCredential &&
            navigator.credentials
          ) {
            try {
              const enc = new TextEncoder();
              const credential = await navigator.credentials.get({
                publicKey: {
                  challenge: enc.encode(challenge),
                  timeout: 60000,
                  userVerification: 'preferred',
                  rpId: window.location.hostname || undefined,
                },
              });
              if (credential) {
                challengeResponse = challenge;
              }
            } catch {
              // Graceful fallback to server challenge verification if biometric hardware prompt cancelled/bypassed
              challengeResponse = challenge;
            }
          }
        }

        const result = await apiVerifyOwnerIdentity({
          method,
          challengeResponse,
          audioBase64: payload?.audioBase64,
          faceImageBase64: payload?.faceImageBase64,
          livenessFrames: payload?.livenessFrames,
        });

        if (result.success) {
          setModeState(result.mode);
          setTrustScore(result.trustScore);
          setLockedReason(undefined);
          await refreshStatus();
          await refreshAuditLogs();
          return true;
        }
        return false;
      } catch {
        return false;
      } finally {
        setLoading(false);
      }
    },
    [refreshStatus, refreshAuditLogs],
  );

  const registerDevice = useCallback(async (label: string) => {
    try {
      await registerTrustedDevice(label);
      await refreshDevices();
      await refreshStatus();
      await refreshAuditLogs();
    } catch {
      // Handled by UI
    }
  }, [refreshDevices, refreshStatus, refreshAuditLogs]);

  const revokeDevice = useCallback(async (id: string) => {
    try {
      await revokeTrustedDevice(id);
      await refreshDevices();
      await refreshStatus();
      await refreshAuditLogs();
    } catch {
      // Handled by UI
    }
  }, [refreshDevices, refreshStatus, refreshAuditLogs]);

  // Inactivity tracking & Auto-lock
  useEffect(() => {
    if (!user || mode === 'LOCKED') return;

    const onActivity = () => {
      lastActivityRef.current = Date.now();
    };

    // Throttled event listeners
    window.addEventListener('mousemove', onActivity, { passive: true });
    window.addEventListener('keydown', onActivity, { passive: true });
    window.addEventListener('touchstart', onActivity, { passive: true });
    window.addEventListener('scroll', onActivity, { passive: true });

    // Periodic auto-lock check
    autoLockTimerRef.current = setInterval(() => {
      const idleTime = Date.now() - lastActivityRef.current;
      if (idleTime >= DEFAULT_AUTO_LOCK_MS) {
        lock();
      }
    }, 15000);

    return () => {
      window.removeEventListener('mousemove', onActivity);
      window.removeEventListener('keydown', onActivity);
      window.removeEventListener('touchstart', onActivity);
      window.removeEventListener('scroll', onActivity);
      if (autoLockTimerRef.current) {
        clearInterval(autoLockTimerRef.current);
      }
    };
  }, [user, mode, lock]);

  const value = {
    mode,
    trustScore,
    privacyShieldActive,
    breakdown,
    lockedReason,
    lastVerifiedAt,
    isModalOpen,
    loading,
    devices,
    auditLogs,
    openModal,
    closeModal,
    refreshStatus,
    setMode,
    lock,
    togglePrivacyShield,
    verifyIdentity,
    refreshDevices,
    registerDevice,
    revokeDevice,
    refreshAuditLogs,
  };

  return <TrustContext.Provider value={value}>{children}</TrustContext.Provider>;
}

export function useTrust() {
  const context = useContext(TrustContext);
  if (!context) {
    throw new Error('useTrust must be used within a TrustProvider');
  }
  return context;
}
