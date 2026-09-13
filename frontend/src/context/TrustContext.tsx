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

export const DEFAULT_AUTO_LOCK_MS = 60 * 60 * 1000; // 60 minutes

type TrustContextType = {
  mode: TrustMode;
  trustScore: number;
  privacyShieldActive: boolean;
  breakdown: TrustScoreBreakdown | null;
  lockedReason?: string;
  lastVerifiedAt?: string;
  autoLockMinutes: number;
  isModalOpen: boolean;
  loading: boolean;
  devices: TrustedDevice[];
  auditLogs: SecurityAuditLog[];
  voiceEnrolled: boolean;
  openModal: () => void;
  closeModal: () => void;
  refreshStatus: () => Promise<void>;
  recordActivity: () => void;
  setMode: (mode: TrustMode) => Promise<void>;
  lock: () => Promise<void>;
  togglePrivacyShield: () => Promise<boolean>;
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
  enrollPlatformPasskey: () => Promise<boolean>;
};

const TrustContext = createContext<TrustContextType | undefined>(undefined);

// Helper to convert ArrayBuffer to Base64 in browser without Node Buffer dependencies
export function bufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function bufferToBase64url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64ToBuffer(base64: string): ArrayBuffer {
  let normalized = base64.replace(/-/g, '+').replace(/_/g, '/');
  while (normalized.length % 4 !== 0) {
    normalized += '=';
  }
  const binary = atob(normalized);
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
  const [autoLockMinutes, setAutoLockMinutes] = useState<number>(60);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [devices, setDevices] = useState<TrustedDevice[]>([]);
  const [auditLogs, setAuditLogs] = useState<SecurityAuditLog[]>([]);
  const [voiceEnrolled, setVoiceEnrolled] = useState<boolean>(false);

  const lastActivityRef = useRef<number>(0);
  const autoLockTimerRef = useRef<NodeJS.Timeout | null>(null);

  const openModal = useCallback(() => setIsModalOpen(true), []);
  const closeModal = useCallback(() => setIsModalOpen(false), []);

  const recordActivity = useCallback(() => {
    lastActivityRef.current = Date.now();
  }, []);

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
      if (status.autoLockMinutes) {
        setAutoLockMinutes(status.autoLockMinutes);
      }
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
          if (status.autoLockMinutes) {
            setAutoLockMinutes(status.autoLockMinutes);
          }
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
          if (
            typeof window === 'undefined' ||
            !window.PublicKeyCredential ||
            !navigator.credentials
          ) {
            console.warn('[TwinTrust WebAuthn] WebAuthn is not supported in this browser context.');
            return false;
          }

          let challenge: string;
          try {
            const res = await fetchOsAuthChallenge();
            challenge = res.challenge;
          } catch (fetchErr) {
            console.warn('[TwinTrust WebAuthn] Failed to fetch server challenge:', fetchErr);
            return false;
          }

          const challengeBuffer = base64ToBuffer(challenge);
          let assertion: PublicKeyCredential | null = null;

          const savedCredentialId =
            typeof window !== 'undefined'
              ? localStorage.getItem('twinmind_platform_credential_id')
              : null;

          // Strategy 1: Targeted assertion with saved internal credential ID
          if (savedCredentialId) {
            try {
              assertion = (await navigator.credentials.get({
                publicKey: {
                  challenge: challengeBuffer,
                  timeout: 60000,
                  userVerification: 'required',
                  rpId: window.location.hostname || undefined,
                  allowCredentials: [
                    {
                      id: base64ToBuffer(savedCredentialId),
                      type: 'public-key',
                      transports: ['internal'],
                    },
                  ],
                },
              })) as PublicKeyCredential | null;
            } catch (targetedErr: unknown) {
              const domErr = targetedErr as DOMException;
              console.warn(
                '[TwinTrust WebAuthn] Targeted passkey assertion failed (attempting discoverable query):',
                domErr.name,
                domErr.message,
              );
              assertion = null;
            }
          }

          // Strategy 2: Discoverable platform passkey query
          if (!assertion) {
            try {
              assertion = (await navigator.credentials.get({
                publicKey: {
                  challenge: challengeBuffer,
                  timeout: 60000,
                  userVerification: 'required',
                  rpId: window.location.hostname || undefined,
                },
              })) as PublicKeyCredential | null;
            } catch (discErr: unknown) {
              const domErr = discErr as DOMException;
              console.warn(
                '[TwinTrust WebAuthn] Discoverable passkey query failed or was canceled:',
                domErr.name,
                domErr.message,
              );
              assertion = null;
            }
          }

          // Strategy 3: Automatic fallback to platform passkey creation if no credential exists on device
          if (!assertion) {
            try {
              const enc = new TextEncoder();
              const newCredential = (await navigator.credentials.create({
                publicKey: {
                  challenge: challengeBuffer,
                  rp: {
                    name: 'TwinMind AI',
                    id: window.location.hostname || undefined,
                  },
                  user: {
                    id: enc.encode(user?.id || 'current_user'),
                    name: user?.email || 'owner@twinmind.local',
                    displayName: user?.name || 'TwinMind Owner',
                  },
                  pubKeyCredParams: [
                    { alg: -7, type: 'public-key' },
                    { alg: -257, type: 'public-key' },
                  ],
                  authenticatorSelection: {
                    authenticatorAttachment: 'platform',
                    userVerification: 'required',
                    residentKey: 'preferred',
                  },
                  timeout: 60000,
                },
              })) as PublicKeyCredential | null;

              if (newCredential && newCredential.response) {
                assertion = newCredential;
              }
            } catch (createErr: unknown) {
              const domErr = createErr as DOMException;
              console.warn(
                '[TwinTrust WebAuthn] Automatic platform passkey creation fallback cancelled or failed:',
                domErr.name,
                domErr.message,
              );
              assertion = null;
            }
          }

          if (!assertion || !assertion.response) {
            console.warn('[TwinTrust WebAuthn] No assertion or credential returned. Aborting elevation.');
            return false;
          }

          if (assertion.id && typeof window !== 'undefined') {
            localStorage.setItem('twinmind_platform_credential_id', assertion.id);
          }

          let clientDataJSON: string;
          let authenticatorData: string | undefined;
          let signature: string | undefined;
          let attestationObject: string | undefined;

          if ('authenticatorData' in assertion.response) {
            const getResp = assertion.response as AuthenticatorAssertionResponse;
            clientDataJSON = bufferToBase64url(getResp.clientDataJSON);
            authenticatorData = getResp.authenticatorData ? bufferToBase64url(getResp.authenticatorData) : undefined;
            signature = getResp.signature ? bufferToBase64url(getResp.signature) : undefined;
          } else {
            const createResp = assertion.response as AuthenticatorAttestationResponse;
            clientDataJSON = bufferToBase64url(createResp.clientDataJSON);
            attestationObject = createResp.attestationObject ? bufferToBase64url(createResp.attestationObject) : undefined;
          }

          const assertionResult = {
            credentialId: assertion.id,
            clientDataJSON,
            authenticatorData,
            signature,
            attestationObject,
          };

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
      } catch (err: unknown) {
        console.warn('[TwinTrust Verification] General verification error:', err);
        return false;
      } finally {
        setLoading(false);
      }
    },
    [user, refreshStatus, refreshAuditLogs, refreshVoiceStatus],
  );

  // Explicit mode changer
  const setMode = useCallback(
    async (newMode: TrustMode) => {
      setLoading(true);
      try {
        if (newMode === 'OWNER' && mode !== 'OWNER' && trustScore < 75) {
          const verified = await verifyIdentity('OS_AUTH');
          if (!verified) {
            return;
          }
        }
        const res = await setTrustModeApi(newMode);
        setModeState(res.mode);
        setTrustScore(res.trustScore);
        setPrivacyShieldActive(res.privacyShieldActive);
        if (res.mode === 'OWNER') {
          setLockedReason(undefined);
        }
        await refreshStatus();
        await refreshAuditLogs();
      } finally {
        setLoading(false);
      }
    },
    [mode, trustScore, verifyIdentity, refreshStatus, refreshAuditLogs],
  );

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
  const togglePrivacyShield = useCallback(async (): Promise<boolean> => {
    setLoading(true);
    try {
      const res = await togglePrivacyShieldApi();
      setPrivacyShieldActive(res.privacyShieldActive);
      await refreshStatus();
      await refreshAuditLogs();
      return true;
    } catch (err) {
      console.warn('[TwinTrust] Toggle privacy shield failed:', err);
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

  const enrollPlatformPasskey = useCallback(async (): Promise<boolean> => {
    if (typeof window === 'undefined' || !window.PublicKeyCredential || !navigator.credentials) {
      console.warn('[TwinTrust WebAuthn] WebAuthn is not supported in this browser context.');
      return false;
    }

    setLoading(true);
    try {
      const { challenge } = await fetchOsAuthChallenge();
      const challengeBuffer = base64ToBuffer(challenge);
      const enc = new TextEncoder();

      const newCredential = (await navigator.credentials.create({
        publicKey: {
          challenge: challengeBuffer,
          rp: {
            name: 'TwinMind AI',
            id: window.location.hostname || undefined,
          },
          user: {
            id: enc.encode(user?.id || 'current_user'),
            name: user?.email || 'owner@twinmind.local',
            displayName: user?.name || 'TwinMind Owner',
          },
          pubKeyCredParams: [
            { alg: -7, type: 'public-key' },
            { alg: -257, type: 'public-key' },
          ],
          authenticatorSelection: {
            authenticatorAttachment: 'platform',
            userVerification: 'required',
            residentKey: 'preferred',
          },
          timeout: 60000,
        },
      })) as PublicKeyCredential | null;

      if (!newCredential || !newCredential.response) {
        console.warn('[TwinTrust WebAuthn] Credential creation returned no response.');
        return false;
      }

      if (newCredential.id && typeof window !== 'undefined') {
        localStorage.setItem('twinmind_platform_credential_id', newCredential.id);
      }

      const createResp = newCredential.response as AuthenticatorAttestationResponse;
      const assertionResult = {
        credentialId: newCredential.id,
        clientDataJSON: bufferToBase64url(createResp.clientDataJSON),
        attestationObject: createResp.attestationObject
          ? bufferToBase64url(createResp.attestationObject)
          : undefined,
      };

      try {
        const verifyRes = await apiVerifyOwnerIdentity({
          method: 'OS_AUTH',
          challengeResponse: JSON.stringify(assertionResult),
        });
        if (verifyRes.success) {
          setModeState(verifyRes.mode);
          setTrustScore(verifyRes.trustScore);
          setLockedReason(undefined);
        }
      } catch {
        // Fallback to refreshStatus
      }

      try {
        const platformName = typeof navigator !== 'undefined' ? navigator.platform || 'Windows PC' : 'PC';
        await registerDevice(`Windows Hello (${platformName})`);
      } catch {
        // Device list registration optional
      }

      await refreshStatus();
      await refreshAuditLogs();
      return true;
    } catch (err: unknown) {
      const domErr = err as DOMException;
      console.warn('[TwinTrust WebAuthn] Platform passkey enrollment error:', domErr.name, domErr.message);
      return false;
    } finally {
      setLoading(false);
    }
  }, [user, registerDevice, refreshStatus, refreshAuditLogs]);

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

  // Inactivity tracking & Auto-lock
  useEffect(() => {
    if (!user || mode === 'LOCKED') return;

    let lastRecorded = 0;
    const onActivity = () => {
      const now = Date.now();
      if (now - lastRecorded > 2000) {
        lastRecorded = now;
        lastActivityRef.current = now;
      }
    };

    // Passive event listeners covering all user activity
    window.addEventListener('mousemove', onActivity, { passive: true });
    window.addEventListener('keydown', onActivity, { passive: true });
    window.addEventListener('touchstart', onActivity, { passive: true });
    window.addEventListener('scroll', onActivity, { passive: true });
    window.addEventListener('click', onActivity, { passive: true });
    window.addEventListener('input', onActivity, { passive: true });
    window.addEventListener('wheel', onActivity, { passive: true });

    // Periodic auto-lock check
    autoLockTimerRef.current = setInterval(() => {
      const idleTime = Date.now() - lastActivityRef.current;
      const timeoutMs = (autoLockMinutes || 60) * 60 * 1000;
      if (idleTime >= timeoutMs) {
        lock();
      }
    }, 15000);

    return () => {
      window.removeEventListener('mousemove', onActivity);
      window.removeEventListener('keydown', onActivity);
      window.removeEventListener('touchstart', onActivity);
      window.removeEventListener('scroll', onActivity);
      window.removeEventListener('click', onActivity);
      window.removeEventListener('input', onActivity);
      window.removeEventListener('wheel', onActivity);
      if (autoLockTimerRef.current) {
        clearInterval(autoLockTimerRef.current);
      }
    };
  }, [user, mode, autoLockMinutes, lock]);

  const value = {
    mode,
    trustScore,
    privacyShieldActive,
    breakdown,
    lockedReason,
    lastVerifiedAt,
    autoLockMinutes,
    isModalOpen,
    loading,
    devices,
    auditLogs,
    voiceEnrolled,
    openModal,
    closeModal,
    refreshStatus,
    recordActivity,
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
    enrollPlatformPasskey,
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

export function useOptionalTrust() {
  return useContext(TrustContext);
}
