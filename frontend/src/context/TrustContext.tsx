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
  fetchVoiceBiometricStatus,
  enrollOwnerVoiceApi,
  revokeOwnerVoiceApi,
} from '../lib/api';
import { AudioRecorder } from '../lib/voice/speechToText';
import { useAuth } from './AuthContext';

export const DEFAULT_AUTO_LOCK_MS = 15 * 60 * 1000; // 15 minutes

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
  voiceEnrolled: boolean;
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
  refreshVoiceStatus: () => Promise<void>;
  enrollVoice: (audioBlob: Blob) => Promise<boolean>;
  revokeVoice: () => Promise<boolean>;
};

const TrustContext = createContext<TrustContextType | undefined>(undefined);

// Helper to convert ArrayBuffer to Base64 in browser without Node Buffer dependencies
function bufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64.replace(/-/g, '+').replace(/_/g, '/'));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

export function TrustProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [mode, setModeState] = useState<TrustMode>('GUEST');
  const [trustScore, setTrustScore] = useState<number>(50);
  const [privacyShieldActive, setPrivacyShieldActive] = useState<boolean>(false);
  const [breakdown, setBreakdown] = useState<TrustScoreBreakdown | null>(null);
  const [lockedReason, setLockedReason] = useState<string | undefined>();
  const [lastVerifiedAt, setLastVerifiedAt] = useState<string | undefined>();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [devices, setDevices] = useState<TrustedDevice[]>([]);
  const [auditLogs, setAuditLogs] = useState<SecurityAuditLog[]>([]);
  const [voiceEnrolled, setVoiceEnrolled] = useState<boolean>(false);

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

  const refreshVoiceStatus = useCallback(async () => {
    if (!user) return;
    try {
      const status = await fetchVoiceBiometricStatus();
      setVoiceEnrolled(status.enrolled);
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
        fetchVoiceBiometricStatus().catch(() => ({ enrolled: false })),
      ]).then(([status, devList, logs, voiceStat]) => {
        if (!mounted) return;
        if (status) {
          setModeState(status.mode);
          setTrustScore(status.trustScore);
          setPrivacyShieldActive(status.privacyShieldActive);
          setBreakdown(status.breakdown);
          setLockedReason(status.lockedReason);
          setLastVerifiedAt(status.lastVerifiedAt);
        }
        setDevices(devList);
        setAuditLogs(logs);
        if (voiceStat) {
          setVoiceEnrolled(voiceStat.enrolled);
        }
      });
    } else {
      queueMicrotask(() => {
        if (!mounted) return;
        setModeState('GUEST');
        setTrustScore(50);
        setPrivacyShieldActive(false);
        setBreakdown(null);
        setDevices([]);
        setAuditLogs([]);
        setVoiceEnrolled(false);
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

          if (
            typeof window === 'undefined' ||
            !window.PublicKeyCredential ||
            !navigator.credentials
          ) {
            return false;
          }

          const enc = new TextEncoder();
          const challengeBuffer = enc.encode(challenge);

          let assertionResult: {
            clientDataJSON: string;
            credentialId?: string;
            signature?: string;
            authenticatorData?: string;
          } | null = null;

          const savedCredentialId =
            typeof window !== 'undefined'
              ? localStorage.getItem('twinmind_platform_credential_id')
              : null;

          // Helper to register/enroll Windows Hello on this PC directly
          const createPlatformPasskey = async () => {
            const newCredential = (await navigator.credentials.create({
              publicKey: {
                challenge: challengeBuffer,
                rp: {
                  name: 'TwinMind AI',
                  id: window.location.hostname || undefined,
                },
                user: {
                  id: enc.encode(user?.id || 'current_user'),
                  name: user?.email || 'user@twinmind.local',
                  displayName: user?.name || 'TwinMind Owner',
                },
                pubKeyCredParams: [
                  { alg: -7, type: 'public-key' },
                  { alg: -257, type: 'public-key' },
                ],
                authenticatorSelection: {
                  authenticatorAttachment: 'platform', // Strictly platform (Windows Hello on this PC)
                  userVerification: 'required',
                  residentKey: 'preferred',
                },
                timeout: 60000,
              },
            })) as PublicKeyCredential | null;

            if (newCredential && newCredential.response) {
              const response = newCredential.response as AuthenticatorAttestationResponse;
              if (typeof window !== 'undefined' && newCredential.id) {
                localStorage.setItem('twinmind_platform_credential_id', newCredential.id);
              }
              return {
                credentialId: newCredential.id,
                clientDataJSON: bufferToBase64(response.clientDataJSON),
              };
            }
            return null;
          };

          // If a platform credential exists, try get() with transports: ['internal']
          if (savedCredentialId) {
            try {
              const credential = (await navigator.credentials.get({
                publicKey: {
                  challenge: challengeBuffer,
                  timeout: 60000,
                  userVerification: 'required',
                  rpId: window.location.hostname || undefined,
                  allowCredentials: [
                    {
                      id: base64ToBuffer(savedCredentialId),
                      type: 'public-key',
                      transports: ['internal'], // Forces local Windows Hello, prevents phone QR code
                    },
                  ],
                },
              })) as PublicKeyCredential | null;

              if (credential && credential.response) {
                const response = credential.response as AuthenticatorAssertionResponse;
                assertionResult = {
                  credentialId: credential.id,
                  clientDataJSON: bufferToBase64(response.clientDataJSON),
                  authenticatorData: response.authenticatorData
                    ? bufferToBase64(response.authenticatorData)
                    : undefined,
                  signature: response.signature
                    ? bufferToBase64(response.signature)
                    : undefined,
                };
              }
            } catch {
              assertionResult = null;
            }
          }

          // If no credential existed or get() failed, register Windows Hello directly on this device
          if (!assertionResult) {
            try {
              assertionResult = await createPlatformPasskey();
            } catch {
              return false;
            }
          }

          if (!assertionResult) {
            return false;
          }

          challengeResponse = JSON.stringify(assertionResult);
        }

        let finalAudioBase64 = payload?.audioBase64;
        if (method === 'VOICE' && !finalAudioBase64) {
          try {
            const recorder = new AudioRecorder();
            await recorder.start();
            await new Promise((resolve) => setTimeout(resolve, 2500));
            const audioBlob = await recorder.stop();
            const arrayBuf = await audioBlob.arrayBuffer();
            finalAudioBase64 = bufferToBase64(arrayBuf);
          } catch {
            return false;
          }
        }

        const result = await apiVerifyOwnerIdentity({
          method,
          challengeResponse,
          audioBase64: finalAudioBase64,
          faceImageBase64: payload?.faceImageBase64,
          livenessFrames: payload?.livenessFrames,
        });

        if (result.success) {
          setModeState(result.mode);
          setTrustScore(result.trustScore);
          setLockedReason(undefined);
          await refreshStatus();
          await refreshAuditLogs();
          await refreshVoiceStatus();
          return true;
        } else {
          if (result.mode) {
            setModeState(result.mode);
            setTrustScore(result.trustScore);
          }
          await refreshStatus();
          await refreshAuditLogs();
          return false;
        }
      } catch {
        return false;
      } finally {
        setLoading(false);
      }
    },
    [refreshStatus, refreshAuditLogs, refreshVoiceStatus, user],
  );

  const enrollVoice = useCallback(
    async (audioBlob: Blob): Promise<boolean> => {
      setLoading(true);
      try {
        const res = await enrollOwnerVoiceApi(audioBlob);
        if (res.success) {
          setVoiceEnrolled(true);
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

  const revokeVoice = useCallback(async (): Promise<boolean> => {
    setLoading(true);
    try {
      const res = await revokeOwnerVoiceApi();
      if (res.success) {
        setVoiceEnrolled(false);
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
  }, [refreshStatus, refreshAuditLogs]);

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
      const timeoutMs = typeof DEFAULT_AUTO_LOCK_MS !== 'undefined' ? DEFAULT_AUTO_LOCK_MS : 15 * 60 * 1000;
      if (idleTime >= timeoutMs) {
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
    voiceEnrolled,
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
    refreshVoiceStatus,
    enrollVoice,
    revokeVoice,
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
