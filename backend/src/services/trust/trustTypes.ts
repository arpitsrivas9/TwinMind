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
  | 'GUEST_MODE_TRIGGERED_VOICE_MISMATCH';

export interface TrustSignals {
  authenticated: boolean;
  trustedDevice: boolean;
  osAuthVerified: boolean;
  voiceVerified: boolean;
  voiceMismatch?: boolean;
  faceVerified: boolean;
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
  ): Promise<{ enrolled: boolean; encryptedTemplate: string; templateHash: string }>;
}

export interface IFaceBiometricProvider {
  name: string;
  status: BiometricProviderStatus;
  verifyFace(userId: string, imageBase64: string): Promise<BiometricVerificationResult>;
  enrollFace(userId: string, imageBase64: string): Promise<{ enrolled: boolean; templateHash: string }>;
}

export interface ILivenessProvider {
  name: string;
  status: BiometricProviderStatus;
  checkLiveness(frames: string[]): Promise<{ liveness: 'LIVE' | 'NOT_LIVE' | 'UNKNOWN' | 'FAILED'; score: number }>;
}
