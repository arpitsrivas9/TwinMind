/**
 * TwinTrust™ — Central Trust & Identity Types
 */

export type TrustMode = 'OWNER' | 'GUEST' | 'LOCKED';

export type VoiceIdentityState =
  | 'VOICE_OWNER_MATCH'
  | 'VOICE_NON_OWNER'
  | 'VOICE_UNKNOWN'
  | 'VOICE_UNAVAILABLE'
  | 'VOICE_VERIFICATION_FAILED';

export type TrustAction =
  | 'OWNER_VERIFIED'
  | 'GUEST_MODE_ACTIVATED'
  | 'MANUAL_LOCK'
  | 'AUTO_LOCK'
  | 'MANUAL_UNLOCK'
  | 'PRIVACY_SHIELD_ENABLED'
  | 'PRIVACY_SHIELD_DISABLED'
  | 'DEVICE_REGISTERED'
  | 'DEVICE_REVOKED'
  | 'PERMISSION_DENIED'
  | 'VERIFICATION_FAILED'
  | 'VOICE_ENROLLMENT_STARTED'
  | 'VOICE_ENROLLMENT_COMPLETED'
  | 'VOICE_ENROLLMENT_FAILED'
  | 'VOICE_MISMATCH'
  | 'VOICE_REVOKED'
  | 'GUEST_MODE_TRIGGERED_VOICE_MISMATCH'
  | 'FACE_ENROLLMENT_STARTED'
  | 'FACE_ENROLLMENT_COMPLETED'
  | 'FACE_ENROLLMENT_FAILED'
  | 'FACE_MISMATCH'
  | 'FACE_REVOKED'
  | 'GUEST_MODE_TRIGGERED_FACE_MISMATCH';

export interface TrustSignals {
  authenticated: boolean;
  trustedDevice: boolean;
  osAuthVerified: boolean;
  voiceVerified: boolean;
  voiceMismatch?: boolean;
  faceVerified: boolean;
  faceMismatch?: boolean;
  livenessVerified: boolean;
  recentVerification: boolean;
  networkTrusted: boolean;
}

export interface TrustScoreBreakdown {
  score: number; // 0 - 100
  state: TrustMode;
  signals: TrustSignals;
  reasons: string[];
}

export interface TrustSessionState {
  userId: string;
  currentMode: TrustMode;
  trustScore: number;
  privacyShieldActive: boolean;
  lastVerifiedAt: Date | null;
  lastActivityAt: Date;
  lockedReason: string | null;
  deviceId?: string;
  signals: TrustSignals;
  autoLockMinutes?: number;
}

export type BiometricProviderStatus = 'CONFIGURED' | 'NOT_CONFIGURED' | 'DEVELOPMENT_MOCK';

export interface BiometricVerificationResult {
  verified: boolean;
  confidence: number; // 0.0 to 1.0
  providerStatus: BiometricProviderStatus;
  providerName: string;
  liveness?: 'LIVE' | 'NOT_LIVE' | 'UNKNOWN' | 'FAILED';
  details?: string;
}

export interface VoiceBiometricVerificationResult extends BiometricVerificationResult {
  voiceState: VoiceIdentityState;
  antiSpoofPassed?: boolean;
  replayDetected?: boolean;
}

export interface IVoiceBiometricProvider {
  name: string;
  status: BiometricProviderStatus;
  verifyVoice(
    userId: string,
    audioBuffer: Buffer,
    storedEncryptedTemplate?: string | null,
  ): Promise<VoiceBiometricVerificationResult>;
  enrollVoice(
    userId: string,
    audioBuffer: Buffer,
  ): Promise<{
    enrolled: boolean;
    encryptedTemplate: string;
    templateHash: string;
    verified?: boolean;
    segmentsAnalyzed?: number;
    speechDurationSec?: number;
  }>;
}

export interface FaceBiometricVerificationResult extends BiometricVerificationResult {
  faceState?: 'FACE_OWNER' | 'FACE_NON_OWNER' | 'FACE_UNENROLLED';
  similarity?: number;
}

export interface IFaceBiometricProvider {
  name: string;
  status: BiometricProviderStatus;
  verifyFace(
    userId: string,
    imageBase64: string,
    storedEncryptedTemplate?: string | null,
  ): Promise<FaceBiometricVerificationResult>;
  enrollFace(
    userId: string,
    imageBase64: string,
  ): Promise<{ enrolled: boolean; encryptedTemplate: string; templateHash: string }>;
}

export interface ILivenessProvider {
  name: string;
  status: BiometricProviderStatus;
  checkLiveness(
    frames: string[],
    challenge?: string,
  ): Promise<{ liveness: 'LIVE' | 'NOT_LIVE' | 'UNKNOWN' | 'FAILED'; score: number; details?: string }>;
}
