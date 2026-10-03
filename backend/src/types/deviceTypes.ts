/**
 * Phase 9: Cross-Device TwinMind — Device Intelligence Layer Types
 * Defines type contracts for multi-device presence, capability discovery,
 * permission isolation, and allowlisted command routing.
 */

export type DeviceType =
  | 'LAPTOP'
  | 'DESKTOP'
  | 'PHONE'
  | 'TABLET'
  | 'SMARTWATCH'
  | 'SMART_GLASSES'
  | 'SMART_HOME';

export type DeviceStatus = 'PENDING' | 'TRUSTED' | 'REVOKED' | 'OFFLINE' | 'DISCONNECTED' | 'UNPAIRED';

export type DevicePresenceState = 'ONLINE' | 'OFFLINE' | 'BUSY' | 'AWAY';

export type DeviceCapability =
  | 'CAMERA'
  | 'MICROPHONE'
  | 'KEYBOARD'
  | 'SCREEN'
  | 'FILES'
  | 'NOTIFICATIONS'
  | 'GPS'
  | 'SPEAKERS'
  | 'BIOMETRICS';

export type DevicePermission =
  | 'READ_STATE'
  | 'SEND_COMMAND'
  | 'RECEIVE_COMMAND'
  | 'SYNC_SESSION'
  | 'SYNC_MEMORY'
  | 'SYNC_CONVERSATION'
  | 'NOTIFICATIONS'
  | 'CAMERA'
  | 'MICROPHONE'
  | 'FILES'
  | 'LOCATION';

export const ALLOWED_DEVICE_COMMANDS = [
  'OPEN_TWINMIND',
  'FOCUS_TWINMIND',
  'SYNC_SESSION',
  'SYNC_STATE',
  'SHOW_NOTIFICATION',
  'OPEN_SUPPORTED_VIEW',
  'START_APPROVED_TWINMIND_ACTION',
] as const;

export type DeviceCommandType = typeof ALLOWED_DEVICE_COMMANDS[number];

export type CommandLifecycleState =
  | 'CREATED'
  | 'AUTHENTICATING'
  | 'AUTHORIZED'
  | 'ROUTING'
  | 'EXECUTING'
  | 'COMPLETED'
  | 'AUTH_FAILED'
  | 'PERMISSION_DENIED'
  | 'DEVICE_OFFLINE'
  | 'COMMAND_REJECTED'
  | 'TIMEOUT'
  | 'EXECUTION_FAILED';

export interface PlatformInfo {
  os?: string;
  browser?: string;
  model?: string;
  appVersion?: string;
}

export interface DeviceRecord {
  id: string;
  userId: string;
  deviceKey: string;
  label: string;
  type: DeviceType;
  status: DeviceStatus;
  presence: DevicePresenceState;
  connectionMethod?: string | null;
  deviceToken?: string | null;
  capabilities: DeviceCapability[];
  permissions: DevicePermission[];
  platformInfo: PlatformInfo;
  ipAddress?: string | null;
  userAgent?: string | null;
  isTrusted: boolean;
  isSimulator?: boolean;
  lastSeenAt: Date;
  unpairedAt?: Date | null;
  revokedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface DeviceCommand {
  id: string;
  requestId: string;
  userId: string;
  sourceDeviceId: string;
  targetDeviceId: string;
  commandType: DeviceCommandType;
  payload: Record<string, unknown>;
  state: CommandLifecycleState;
  errorMessage?: string;
  createdAt: Date;
  updatedAt: Date;
  completedAt?: Date;
}

export interface CrossDeviceState {
  userId: string;
  activeConversationId?: string | null;
  activeView: string;
  activeDeviceCount: number;
  onlineDevices: { id: string; label: string; type: DeviceType }[];
  lastActivityAt: Date;
  mode: 'OWNER' | 'GUEST';
  syncPayload?: Record<string, unknown>;
}

export interface DeviceRegistrationInput {
  label: string;
  type: DeviceType;
  deviceKey?: string;
  connectionMethod?: string;
  capabilities?: DeviceCapability[];
  permissions?: DevicePermission[];
  platformInfo?: PlatformInfo;
}

export interface RouteCommandInput {
  requestId: string;
  sourceDeviceId: string;
  targetDeviceId: string;
  commandType: DeviceCommandType;
  payload?: Record<string, unknown>;
}

export interface SyncSessionInput {
  conversationId: string;
  targetDeviceId?: string; // Optional: target specific device or all devices
  activeView?: string;
  contextSnapshot?: Record<string, unknown>;
}

export interface DevicePairingSession {
  id: string;
  userId: string;
  pairingCode: string;
  pairingKey: string;
  status: 'INITIATED' | 'PENDING_APPROVAL' | 'APPROVED' | 'REJECTED' | 'EXPIRED';
  hostDeviceId?: string | null;
  qrPayload: string;
  candidateDeviceName?: string | null;
  candidateDeviceType?: string | null;
  candidateDeviceKey?: string | null;
  candidatePlatformInfo?: Record<string, unknown> | null;
  candidateIpAddress?: string | null;
  candidateToken?: string | null;
  isClaimed: boolean;
  claimedAt?: Date | null;
  claimedById?: string | null;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface JoinPairingInput {
  pairingCode?: string;
  sessionId?: string;
  candidateDevice: DeviceRegistrationInput;
}

