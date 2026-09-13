export type TrustMode = 'OWNER' | 'GUEST' | 'LOCKED';

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
  providerStatus?: {
    voice: string;
    face: string;
    liveness: string;
  };
};
