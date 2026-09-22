/**
 * Phase 9: Cross-Device TwinMind Frontend Types
 * Mirroring backend device model for presence, capability discovery,
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

export type DeviceStatus = 'PENDING' | 'TRUSTED' | 'REVOKED' | 'OFFLINE';

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
  capabilities: DeviceCapability[];
  permissions: DevicePermission[];
  platformInfo: PlatformInfo;
  ipAddress?: string;
  userAgent?: string;
  isTrusted: boolean;
  isSimulator?: boolean;
  lastSeenAt: string;
  createdAt: string;
  updatedAt: string;
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
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
}

export interface CrossDeviceState {
  userId: string;
  activeConversationId?: string | null;
  activeView: string;
  activeDeviceCount: number;
  onlineDevices: { id: string; label: string; type: DeviceType }[];
  lastActivityAt: string;
  mode: 'OWNER' | 'GUEST';
  syncPayload?: Record<string, unknown>;
}

export interface DeviceRegistrationInput {
  label: string;
  type: DeviceType;
  deviceKey?: string;
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
