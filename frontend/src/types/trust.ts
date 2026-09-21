export type TrustMode = 'OWNER' | 'GUEST' | 'LOCKED';

export type CameraEvidenceState =
  | 'OWNER_FACE'
  | 'NO_FACE'
  | 'UNKNOWN_FACE'
  | 'CAMERA_UNAVAILABLE'
  | 'FACE_ERROR';

export type VoiceEvidenceState =
  | 'OWNER_VOICE'
  | 'NON_OWNER_VOICE'
  | 'UNKNOWN_VOICE'
  | 'NO_SPEECH'
  | 'VOICE_UNAVAILABLE'
  | 'VOICE_ERROR';

export type CentralTrustState =
  | 'LOCKED'
  | 'GUEST'
  | 'OWNER'
  | 'VERIFYING_OWNER'
  | 'VERIFYING_SPEAKER'
  | 'UNKNOWN';

export type SpeakerTrustState =
  | 'NO_SPEECH'
  | 'SPEECH_DETECTED'
  | 'VERIFYING'
  | 'OWNER_CONFIRMED'
  | 'UNKNOWN_SPEAKER'
  | 'ERROR';

export type TrustSignals = {
  authenticated: boolean;
  trustedDevice: boolean;
  recentVerification: boolean;
  networkTrusted: boolean;
  voiceBiometricsMatched?: boolean;
  faceBiometricsMatched?: boolean;
  livenessPassed?: boolean;
};

export type TrustFactor = {
  name: string;
  weight: number;
  satisfied: boolean;
  contribution: number;
};

export type TrustScoreBreakdown = {
  score: number;
  factors?: TrustFactor[];
  reasons?: string[];
  state: TrustMode;
};

export type TrustStatus = {
  mode: TrustMode;
  trustScore: number;
  privacyShieldActive: boolean;
  lockedReason?: string;
  lastVerifiedAt?: string;
  autoLockMinutes?: number;
  breakdown: TrustScoreBreakdown;
};

export type TrustedDevice = {
  id: string;
  label: string;
  userAgent?: string;
  ipAddress?: string;
  isTrusted: boolean;
  lastUsedAt: string;
  createdAt: string;
};

export type SecurityAuditLog = {
  id: string;
  action: string;
  status: string;
  trustScore: number;
  ipAddress?: string;
  userAgent?: string;
  details?: string;
  createdAt: string;
};

export type VerificationResult = {
  success: boolean;
  mode: TrustMode;
  trustScore: number;
  message: string;
  voiceState?: 'VOICE_OWNER_MATCH' | 'VOICE_NON_OWNER' | 'VOICE_VERIFICATION_FAILED' | 'VOICE_UNKNOWN';
  faceState?: 'FACE_OWNER' | 'FACE_NON_OWNER' | 'FACE_UNKNOWN' | 'FACE_UNENROLLED';
  cameraEvidence?: CameraEvidenceState;
  voiceEvidence?: VoiceEvidenceState;
  providerStatus?: {
    voice: string;
    face: string;
    liveness: string;
  };
};
