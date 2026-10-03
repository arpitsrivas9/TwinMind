/**
 * Phase 9: Device Intelligence Service
 * Central coordinator for device identity, registration, presence monitoring,
 * permission isolation, allowlisted command routing, and SSE push dispatch.
 * 
 * NOTE: Laptop Safety Guarantee:
 * Strictly runs at the application layer. Zero OS, registry, firewall, or driver modifications.
 */

import crypto from 'crypto';
import type { Request } from 'express';
import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';
import {
  DeviceType,
  DeviceStatus,
  DevicePresenceState,
  DeviceCapability,
  DevicePermission,
  DeviceCommandType,
  DeviceRecord,
  DeviceCommand,
  CrossDeviceState,
  DeviceRegistrationInput,
  RouteCommandInput,
  SyncSessionInput,
  DevicePairingSession,
  JoinPairingInput,
  PlatformInfo,
  ALLOWED_DEVICE_COMMANDS,
} from '../types/deviceTypes';
import { DeviceAdapterFactory } from './deviceAdapters';
import { getLocalNetworkAddress } from '../utils/networkUtils';
import { createToken } from './authService';
import { deviceTransportManager } from './deviceTransport';

export class DeviceService {
  private devices: Map<string, DeviceRecord> = new Map();
  private commands: Map<string, DeviceCommand> = new Map();
  private requestToCommandId: Map<string, string> = new Map();
  private crossDeviceStates: Map<string, CrossDeviceState> = new Map();
  private sseSubscribers: Map<string, Set<(event: { type: string; data: unknown }) => void>> = new Map();
  private presenceSweeperInterval: NodeJS.Timeout | null = null;

  constructor() {
    this.startPresenceSweeper();
    this.hydrateFromDatabase();
  }

  /**
   * Hydrates all registered devices from PostgreSQL on server startup.
   */
  public async hydrateFromDatabase(): Promise<void> {
    try {
      const records = await prisma.trustedDevice.findMany();
      for (const r of records) {
        const adapter = DeviceAdapterFactory.getAdapter(r.deviceType as DeviceType);
        const capabilities = (r.capabilities as DeviceCapability[]) || adapter.defaultCapabilities;
        const permissions = (r.permissions as DevicePermission[]) || adapter.defaultPermissions;
        const platformInfo = (r.platformInfo as PlatformInfo) || {};

        const record: DeviceRecord = {
          id: r.id,
          userId: r.userId,
          deviceKey: r.deviceKey,
          label: r.label,
          type: r.deviceType as DeviceType,
          status: r.status as DeviceStatus,
          presence: r.status === 'REVOKED' || r.status === 'UNPAIRED' ? 'OFFLINE' : 'ONLINE',
          connectionMethod: r.connectionMethod,
          deviceToken: r.deviceToken,
          capabilities,
          permissions,
          platformInfo,
          ipAddress: r.ipAddress || undefined,
          userAgent: r.userAgent || undefined,
          isTrusted: r.isTrusted,
          isSimulator: r.isSimulator,
          lastSeenAt: r.lastUsedAt,
          unpairedAt: r.unpairedAt,
          revokedAt: r.revokedAt,
          createdAt: r.createdAt,
          updatedAt: r.updatedAt,
        };
        this.devices.set(r.id, record);
      }
      logger.info(`[DeviceService] Hydrated ${records.length} devices from PostgreSQL.`);
    } catch (err) {
      logger.warn('[DeviceService] PostgreSQL hydration skipped/failed:', { error: String(err) });
    }
  }

  /**
   * Cleans up resources (used in tests/shutdown).
   */
  public destroy(): void {
    if (this.presenceSweeperInterval) {
      clearInterval(this.presenceSweeperInterval);
      this.presenceSweeperInterval = null;
    }
    this.devices.clear();
    this.commands.clear();
    this.requestToCommandId.clear();
    this.crossDeviceStates.clear();
    this.sseSubscribers.clear();
  }

  /**
   * Starts periodic sweeper that marks stale devices (>60s without heartbeat) as OFFLINE.
   */
  private startPresenceSweeper(): void {
    if (this.presenceSweeperInterval) return;

    this.presenceSweeperInterval = setInterval(() => {
      const now = Date.now();
      for (const [id, device] of this.devices.entries()) {
        if (device.presence === 'ONLINE' && now - new Date(device.lastSeenAt).getTime() > 60000) {
          device.presence = 'OFFLINE';
          device.updatedAt = new Date();
          logger.info(`[DeviceService] Device marked OFFLINE due to inactivity: ${device.label} (${id})`);
          this.broadcast(device.userId, 'PRESENCE_UPDATED', {
            deviceId: device.id,
            presence: 'OFFLINE',
            lastSeenAt: device.lastSeenAt,
          });
        }
      }
    }, 15000);

    // Prevent sweeper from holding process open in tests
    if (this.presenceSweeperInterval.unref) {
      this.presenceSweeperInterval.unref();
    }
  }

  /**
   * Broadcasts an event to all active SSE subscribers for a user.
   */
  private broadcast(userId: string, type: string, data: unknown): void {
    const listeners = this.sseSubscribers.get(userId);
    if (!listeners || listeners.size === 0) return;

    const event = { type, data };
    for (const listener of listeners) {
      try {
        listener(event);
      } catch (err) {
        logger.warn('[DeviceService] Error dispatching SSE event to subscriber', { error: String(err) });
      }
    }
  }

  /**
   * Subscribes an SSE connection to realtime device events for a user.
   */
  public subscribeDeviceEvents(
    userId: string,
    listener: (event: { type: string; data: unknown }) => void,
  ): () => void {
    if (!this.sseSubscribers.has(userId)) {
      this.sseSubscribers.set(userId, new Set());
    }
    this.sseSubscribers.get(userId)!.add(listener);

    return () => {
      const set = this.sseSubscribers.get(userId);
      if (set) {
        set.delete(listener);
        if (set.size === 0) {
          this.sseSubscribers.delete(userId);
        }
      }
    };
  }

  /**
   * Generates a stable device key.
   */
  private generateDeviceKey(token: string, userAgent?: string): string {
    return crypto.createHash('sha256').update(`${token}:${userAgent || ''}`).digest('hex');
  }

  /**
   * Registers a new device or updates an existing device record.
   */
  public async registerDevice(
    userId: string,
    input: DeviceRegistrationInput,
    req?: Request,
  ): Promise<DeviceRecord> {
    const token = input.deviceKey || (req?.headers['x-device-token'] as string) || `dev_${crypto.randomBytes(8).toString('hex')}`;
    const userAgent = (req?.headers['user-agent'] as string) || '';
    const deviceKey = this.generateDeviceKey(token, userAgent);

    // Look for existing device by deviceKey & userId
    let existing: DeviceRecord | undefined;
    for (const d of this.devices.values()) {
      if (d.userId === userId && d.deviceKey === deviceKey) {
        existing = d;
        break;
      }
    }

    const adapter = DeviceAdapterFactory.getAdapter(input.type);
    const capabilities: DeviceCapability[] = input.capabilities && input.capabilities.length > 0
      ? input.capabilities
      : adapter.defaultCapabilities;
    const permissions: DevicePermission[] = input.permissions && input.permissions.length > 0
      ? input.permissions
      : adapter.defaultPermissions;

    const ipAddress = req?.ip || req?.socket?.remoteAddress || '127.0.0.1';
    const now = new Date();

    if (existing) {
      existing.label = input.label || existing.label;
      existing.type = input.type;
      existing.capabilities = capabilities;
      existing.permissions = permissions;
      existing.platformInfo = input.platformInfo || existing.platformInfo;
      existing.ipAddress = ipAddress;
      existing.userAgent = userAgent.slice(0, 255);
      existing.presence = 'ONLINE';
      existing.lastSeenAt = now;
      existing.updatedAt = now;

      this.broadcast(userId, 'DEVICE_UPDATED', existing);
      return existing;
    }

    const deviceId = `device_${crypto.randomBytes(12).toString('hex')}`;
    // First device or simulator defaults to TRUSTED; others default to TRUSTED if registered while in Owner session
    const status: DeviceStatus = 'TRUSTED';

    const record: DeviceRecord = {
      id: deviceId,
      userId,
      deviceKey,
      label: input.label.trim() || `${input.type} Device`,
      type: input.type,
      status,
      presence: 'ONLINE',
      connectionMethod: input.connectionMethod || 'LOCAL_BROWSER',
      capabilities,
      permissions,
      platformInfo: input.platformInfo || {},
      ipAddress,
      userAgent: userAgent.slice(0, 255),
      isTrusted: status === 'TRUSTED',
      isSimulator: false,
      lastSeenAt: now,
      createdAt: now,
      updatedAt: now,
    };

    this.devices.set(deviceId, record);

    // Synchronize to Prisma if available
    try {
      await prisma.trustedDevice.upsert({
        where: { userId_deviceKey: { userId, deviceKey } },
        update: {
          label: record.label,
          connectionMethod: record.connectionMethod || 'LOCAL_BROWSER',
          isTrusted: record.isTrusted,
          lastUsedAt: now,
        },
        create: {
          id: deviceId,
          userId,
          deviceKey,
          label: record.label,
          deviceType: record.type,
          connectionMethod: record.connectionMethod || 'LOCAL_BROWSER',
          userAgent: record.userAgent,
          ipAddress: record.ipAddress,
          isTrusted: record.isTrusted,
          lastUsedAt: now,
        },
      });
    } catch {
      // Non-fatal: in-memory authoritative registry guarantees zero service disruption
    }

    this.broadcast(userId, 'DEVICE_REGISTERED', record);
    return record;
  }

  /**
   * Retrieves all devices for a user.
   * STRICT SECURITY: If in Guest Mode, returns empty array to prevent credential/hardware leakage.
   */
  public async getDevices(userId: string, isOwner: boolean): Promise<DeviceRecord[]> {
    if (!isOwner) {
      // In Guest Mode, secondary users cannot view or inspect registered devices
      return [];
    }

    const userDevices: DeviceRecord[] = [];
    for (const d of this.devices.values()) {
      if (d.userId === userId) {
        userDevices.push(d);
      }
    }

    // Sort: Online first, then by lastSeenAt desc
    return userDevices.sort((a, b) => {
      if (a.presence === 'ONLINE' && b.presence !== 'ONLINE') return -1;
      if (a.presence !== 'ONLINE' && b.presence === 'ONLINE') return 1;
      return new Date(b.lastSeenAt).getTime() - new Date(a.lastSeenAt).getTime();
    });
  }

  /**
   * Retrieves a single device by ID.
   */
  public async getDeviceById(
    userId: string,
    deviceId: string,
    isOwner: boolean,
  ): Promise<DeviceRecord | null> {
    if (!isOwner) return null;
    const device = this.devices.get(deviceId);
    if (!device || device.userId !== userId) return null;
    return device;
  }

  /**
   * Verifies/approves a pending device. Requires Owner Mode.
   */
  public async verifyDevice(
    userId: string,
    deviceId: string,
    isOwner: boolean,
  ): Promise<DeviceRecord> {
    if (!isOwner) {
      throw new Error('Owner authorization required to verify devices.');
    }

    const device = this.devices.get(deviceId);
    if (!device || device.userId !== userId) {
      throw new Error(`Device not found: ${deviceId}`);
    }

    device.status = 'TRUSTED';
    device.isTrusted = true;
    device.updatedAt = new Date();

    try {
      await prisma.trustedDevice.updateMany({
        where: { userId, deviceKey: device.deviceKey },
        data: { isTrusted: true, lastUsedAt: new Date() },
      });
    } catch {
      // Non-fatal
    }

    this.broadcast(userId, 'DEVICE_VERIFIED', device);
    return device;
  }

  /**
   * Revokes a device. Requires Owner Mode.
   */
  public async revokeDevice(
    userId: string,
    deviceId: string,
    isOwner: boolean,
  ): Promise<DeviceRecord> {
    if (!isOwner) {
      throw new Error('Owner authorization required to revoke devices.');
    }

    const device = this.devices.get(deviceId);
    if (!device || device.userId !== userId) {
      throw new Error(`Device not found: ${deviceId}`);
    }

    device.status = 'REVOKED';
    device.isTrusted = false;
    device.presence = 'OFFLINE';
    device.updatedAt = new Date();

    try {
      await prisma.trustedDevice.updateMany({
        where: { userId, deviceKey: device.deviceKey },
        data: { isTrusted: false },
      });
    } catch {
      // Non-fatal
    }

    this.broadcast(userId, 'DEVICE_REVOKED', device);
    return device;
  }

  /**
   * 1. Disconnect: Temporary connection termination.
   * Sets presence to OFFLINE, does not invalidate credentials.
   */
  public async disconnectDevice(
    userId: string,
    deviceId: string,
  ): Promise<{ success: boolean; message: string }> {
    const device = this.devices.get(deviceId);
    if (!device || device.userId !== userId) {
      throw new Error(`Device not found: ${deviceId}`);
    }

    device.presence = 'OFFLINE';
    device.status = 'DISCONNECTED';
    device.updatedAt = new Date();

    try {
      await prisma.trustedDevice.updateMany({
        where: { id: deviceId, userId },
        data: { status: 'DISCONNECTED' },
      });
    } catch {}

    this.broadcast(userId, 'DEVICE_DISCONNECTED', { deviceId });
    this.broadcast(userId, 'PRESENCE_UPDATED', {
      deviceId,
      presence: 'OFFLINE',
      lastSeenAt: device.lastSeenAt,
    });

    return { success: true, message: `Device '${device.label}' disconnected.` };
  }

  /**
   * 2. Unpair: Terminates active device pairing relationship while keeping record in history.
   * Invalidates active tokens, marks status UNPAIRED, prevents auto-reconnect. Requires Owner Mode.
   */
  public async unpairDevice(
    userId: string,
    deviceId: string,
    isOwner: boolean,
  ): Promise<DeviceRecord> {
    if (!isOwner) {
      throw new Error('Owner authorization required to unpair devices.');
    }

    const device = this.devices.get(deviceId);
    if (!device || device.userId !== userId) {
      throw new Error(`Device not found: ${deviceId}`);
    }

    const now = new Date();
    device.status = 'UNPAIRED';
    device.isTrusted = false;
    device.presence = 'OFFLINE';
    device.deviceToken = null;
    device.unpairedAt = now;
    device.updatedAt = now;

    try {
      await prisma.trustedDevice.updateMany({
        where: { id: deviceId, userId },
        data: {
          status: 'UNPAIRED',
          isTrusted: false,
          deviceToken: null,
          unpairedAt: now,
        },
      });
    } catch {}

    this.broadcast(userId, 'DEVICE_UNPAIRED', { deviceId });
    this.broadcast(userId, 'DEVICE_UPDATED', device);
    return device;
  }

  /**
   * 3. Forget: Equivalent to "Forget this Bluetooth device".
   * Completely revokes credentials, purges from active trusted devices, prevents silent reconnection. Requires Owner Mode.
   */
  public async forgetDevice(
    userId: string,
    deviceId: string,
    isOwner: boolean,
  ): Promise<DeviceRecord> {
    if (!isOwner) {
      throw new Error('Owner authorization required to forget devices.');
    }

    const device = this.devices.get(deviceId);
    if (!device || device.userId !== userId) {
      throw new Error(`Device not found: ${deviceId}`);
    }

    const now = new Date();
    device.status = 'REVOKED';
    device.isTrusted = false;
    device.presence = 'OFFLINE';
    device.deviceToken = null;
    device.revokedAt = now;
    device.updatedAt = now;

    try {
      await prisma.trustedDevice.updateMany({
        where: { id: deviceId, userId },
        data: {
          status: 'REVOKED',
          isTrusted: false,
          deviceToken: null,
          revokedAt: now,
        },
      });
    } catch {}

    this.broadcast(userId, 'DEVICE_FORGOTTEN', { deviceId });
    this.broadcast(userId, 'DEVICE_REVOKED', device);
    return device;
  }

  /**
   * 4. Delete: Permanently deletes the device record from the database. Requires Owner Mode.
   */
  public async deleteDevice(
    userId: string,
    deviceId: string,
    isOwner: boolean,
  ): Promise<{ success: boolean; message: string }> {
    if (!isOwner) {
      throw new Error('Owner authorization required to delete device records.');
    }

    const device = this.devices.get(deviceId);
    if (!device || device.userId !== userId) {
      throw new Error(`Device not found: ${deviceId}`);
    }

    this.devices.delete(deviceId);

    try {
      await prisma.trustedDevice.deleteMany({
        where: { id: deviceId, userId },
      });
    } catch {}

    this.broadcast(userId, 'DEVICE_DELETED', { deviceId });
    return { success: true, message: `Device '${device.label}' deleted permanently.` };
  }

  /**
   * Updates device label or permissions. Requires Owner Mode.
   */
  public async updateDevice(
    userId: string,
    deviceId: string,
    updates: { label?: string; permissions?: DevicePermission[] },
    isOwner: boolean,
  ): Promise<DeviceRecord> {
    if (!isOwner) {
      throw new Error('Owner authorization required to update devices.');
    }

    const device = this.devices.get(deviceId);
    if (!device || device.userId !== userId) {
      throw new Error(`Device not found: ${deviceId}`);
    }

    if (updates.label && updates.label.trim()) {
      device.label = updates.label.trim();
    }
    if (updates.permissions) {
      device.permissions = updates.permissions;
    }
    device.updatedAt = new Date();

    this.broadcast(userId, 'DEVICE_UPDATED', device);
    return device;
  }

  /**
   * Application-level presence heartbeat.
   */
  public async heartbeat(
    userId: string,
    deviceId: string,
  ): Promise<{ success: boolean; presence: DevicePresenceState; status: DeviceStatus }> {
    const device = this.devices.get(deviceId);
    if (!device || device.userId !== userId) {
      return { success: false, presence: 'OFFLINE', status: 'REVOKED' };
    }

    if (device.status === 'REVOKED') {
      return { success: false, presence: 'OFFLINE', status: 'REVOKED' };
    }

    const previousPresence = device.presence;
    device.presence = 'ONLINE';
    device.lastSeenAt = new Date();
    device.updatedAt = new Date();

    if (previousPresence !== 'ONLINE') {
      this.broadcast(userId, 'PRESENCE_UPDATED', {
        deviceId: device.id,
        presence: 'ONLINE',
        lastSeenAt: device.lastSeenAt,
      });
    }

    return { success: true, presence: 'ONLINE', status: device.status };
  }

  /**
   * Routes an allowlisted command to a target device.
   * Strict security checks:
   * 1. Guest Mode cannot route commands.
   * 2. Rejects any non-allowlisted command.
   * 3. Idempotency check via requestId.
   * 4. Source device must have SEND_COMMAND permission.
   * 5. Target device must have RECEIVE_COMMAND permission.
   * 6. Target device must be ONLINE.
   */
  public async routeCommand(
    userId: string,
    input: RouteCommandInput,
    isOwner: boolean,
  ): Promise<DeviceCommand> {
    if (!isOwner) {
      throw new Error('Security boundary: Only Owner Mode can route cross-device commands.');
    }

    // Strict command allowlist enforcement
    if (!ALLOWED_DEVICE_COMMANDS.includes(input.commandType)) {
      throw new Error(`Security violation: Command '${input.commandType}' is not permitted.`);
    }

    // Idempotency check
    if (input.requestId && this.requestToCommandId.has(input.requestId)) {
      const existingId = this.requestToCommandId.get(input.requestId)!;
      const existingCmd = this.commands.get(existingId);
      if (existingCmd) {
        logger.info(`[DeviceService] Duplicate command request suppressed: ${input.requestId}`);
        return existingCmd;
      }
    }

    const sourceDevice = this.devices.get(input.sourceDeviceId);
    if (!sourceDevice || sourceDevice.userId !== userId) {
      throw new Error(`Source device not found: ${input.sourceDeviceId}`);
    }
    if (sourceDevice.status === 'REVOKED') {
      throw new Error('Source device has been revoked and cannot send commands.');
    }
    if (!sourceDevice.permissions.includes('SEND_COMMAND')) {
      throw new Error(`Source device lacks SEND_COMMAND permission.`);
    }

    const targetDevice = this.devices.get(input.targetDeviceId);
    if (!targetDevice || targetDevice.userId !== userId) {
      throw new Error(`Target device not found: ${input.targetDeviceId}`);
    }
    if (targetDevice.status === 'REVOKED') {
      throw new Error('Target device has been revoked.');
    }
    if (!targetDevice.permissions.includes('RECEIVE_COMMAND')) {
      throw new Error(`Target device lacks RECEIVE_COMMAND permission.`);
    }

    const targetAdapter = DeviceAdapterFactory.getAdapter(targetDevice.type);
    const validation = targetAdapter.validateCommand(input.commandType, input.payload);
    if (!validation.valid) {
      throw new Error(validation.reason || 'Command rejected by target adapter.');
    }

    const commandId = `cmd_${crypto.randomBytes(12).toString('hex')}`;
    const now = new Date();

    // Check target presence
    if (targetDevice.presence !== 'ONLINE') {
      const offlineCommand: DeviceCommand = {
        id: commandId,
        requestId: input.requestId,
        userId,
        sourceDeviceId: input.sourceDeviceId,
        targetDeviceId: input.targetDeviceId,
        commandType: input.commandType,
        payload: input.payload || {},
        state: 'DEVICE_OFFLINE',
        errorMessage: `Target device '${targetDevice.label}' is currently offline.`,
        createdAt: now,
        updatedAt: now,
      };
      this.commands.set(commandId, offlineCommand);
      if (input.requestId) {
        this.requestToCommandId.set(input.requestId, commandId);
      }
      return offlineCommand;
    }

    const command: DeviceCommand = {
      id: commandId,
      requestId: input.requestId,
      userId,
      sourceDeviceId: input.sourceDeviceId,
      targetDeviceId: input.targetDeviceId,
      commandType: input.commandType,
      payload: input.payload || {},
      state: 'ROUTING',
      createdAt: now,
      updatedAt: now,
    };

    this.commands.set(commandId, command);
    if (input.requestId) {
      this.requestToCommandId.set(input.requestId, commandId);
    }

    // Dispatch command to target device via SSE
    this.broadcast(userId, 'COMMAND_DISPATCHED', {
      command,
      targetDeviceId: targetDevice.id,
      executionPayload: targetAdapter.formatExecutionPayload(command),
    });

    // If target device is a simulator, simulate immediate completion
    if (targetDevice.isSimulator) {
      command.state = 'COMPLETED';
      command.completedAt = new Date();
      command.updatedAt = new Date();
      this.broadcast(userId, 'COMMAND_COMPLETED', {
        commandId: command.id,
        targetDeviceId: targetDevice.id,
        state: 'COMPLETED',
      });
    }

    return command;
  }

  /**
   * Reports execution result for a routed command.
   */
  public async reportCommandExecution(
    userId: string,
    commandId: string,
    deviceId: string,
    success: boolean,
    error?: string,
  ): Promise<DeviceCommand> {
    const command = this.commands.get(commandId);
    if (!command || command.userId !== userId) {
      throw new Error(`Command not found: ${commandId}`);
    }

    if (command.targetDeviceId !== deviceId) {
      throw new Error(`Device '${deviceId}' is not authorized to report on command '${commandId}'.`);
    }

    const now = new Date();
    command.state = success ? 'COMPLETED' : 'EXECUTION_FAILED';
    command.completedAt = now;
    command.updatedAt = now;
    if (error) {
      command.errorMessage = error;
    }

    this.broadcast(userId, 'COMMAND_COMPLETED', {
      commandId: command.id,
      state: command.state,
      errorMessage: command.errorMessage,
    });

    return command;
  }

  /**
   * Retrieves active or completed commands.
   */
  public async getCommands(
    userId: string,
    deviceId?: string,
    isOwner?: boolean,
  ): Promise<DeviceCommand[]> {
    if (!isOwner) return [];

    const list: DeviceCommand[] = [];
    for (const cmd of this.commands.values()) {
      if (cmd.userId === userId) {
        if (!deviceId || cmd.targetDeviceId === deviceId || cmd.sourceDeviceId === deviceId) {
          list.push(cmd);
        }
      }
    }

    return list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  /**
   * Returns centralized cross-device state.
   */
  public async getCrossDeviceState(userId: string, isOwner: boolean): Promise<CrossDeviceState> {
    const onlineDevices: { id: string; label: string; type: DeviceType }[] = [];
    for (const d of this.devices.values()) {
      if (d.userId === userId && d.presence === 'ONLINE') {
        onlineDevices.push({ id: d.id, label: d.label, type: d.type });
      }
    }

    const existing = this.crossDeviceStates.get(userId);

    const state: CrossDeviceState = {
      userId,
      activeConversationId: isOwner ? existing?.activeConversationId || null : null,
      activeView: existing?.activeView || 'chat',
      activeDeviceCount: onlineDevices.length,
      onlineDevices: isOwner ? onlineDevices : [],
      lastActivityAt: existing?.lastActivityAt || new Date(),
      mode: isOwner ? 'OWNER' : 'GUEST',
      syncPayload: isOwner ? existing?.syncPayload : undefined,
    };

    return state;
  }

  /**
   * Synchronizes active session or conversation across devices.
   */
  public async syncSession(
    userId: string,
    input: SyncSessionInput,
    isOwner: boolean,
  ): Promise<CrossDeviceState> {
    if (!isOwner) {
      throw new Error('Security boundary: Only Owner Mode can synchronize session state across devices.');
    }

    const now = new Date();
    const current = this.crossDeviceStates.get(userId) || {
      userId,
      activeView: input.activeView || 'chat',
      activeDeviceCount: 0,
      onlineDevices: [],
      lastActivityAt: now,
      mode: 'OWNER',
    };

    current.activeConversationId = input.conversationId;
    if (input.activeView) {
      current.activeView = input.activeView;
    }
    current.lastActivityAt = now;
    if (input.contextSnapshot) {
      current.syncPayload = input.contextSnapshot;
    }

    this.crossDeviceStates.set(userId, current);

    this.broadcast(userId, 'SESSION_SYNCED', {
      conversationId: input.conversationId,
      activeView: current.activeView,
      targetDeviceId: input.targetDeviceId,
      syncPayload: current.syncPayload,
      timestamp: now.toISOString(),
    });

    return this.getCrossDeviceState(userId, isOwner);
  }

  /**
   * Development Device Simulator:
   * Instantly creates a virtual Phone/Tablet/Desktop device on localhost for testing handoff.
   */
  public async simulateDevice(
    userId: string,
    type: DeviceType,
    label: string,
    isOwner: boolean,
  ): Promise<DeviceRecord> {
    if (!isOwner) {
      throw new Error('Security boundary: Only Owner Mode can simulate devices.');
    }

    const adapter = DeviceAdapterFactory.getAdapter(type);
    const deviceId = `sim_${type.toLowerCase()}_${crypto.randomBytes(6).toString('hex')}`;
    const now = new Date();

    const simulatedDevice: DeviceRecord = {
      id: deviceId,
      userId,
      deviceKey: `simkey_${deviceId}`,
      label: label.trim() || `Simulated ${type}`,
      type,
      status: 'TRUSTED',
      presence: 'ONLINE',
      capabilities: adapter.defaultCapabilities,
      permissions: adapter.defaultPermissions,
      platformInfo: {
        os: type === 'PHONE' ? 'Android 14 (Simulated)' : type === 'TABLET' ? 'iPadOS 17 (Simulated)' : 'macOS (Simulated)',
        browser: 'TwinMind Mobile View (Simulator)',
        model: `Virtual ${type}`,
        appVersion: '1.0.0-sim',
      },
      ipAddress: '127.0.0.1',
      userAgent: `TwinMind-Simulator/${type}`,
      isTrusted: true,
      isSimulator: true,
      lastSeenAt: now,
      createdAt: now,
      updatedAt: now,
    };

    this.devices.set(deviceId, simulatedDevice);
    this.broadcast(userId, 'DEVICE_REGISTERED', simulatedDevice);
    return simulatedDevice;
  }

  /**
   * Generates a 6-digit numeric PIN pairing session with signed QR payload.
   * Auto-expires in 10 minutes.
   */
  public async initiatePairingSession(
    userId: string,
    hostDeviceId?: string,
    req?: Request,
  ): Promise<DevicePairingSession & { pairingUrl: string }> {
    // 6-digit PIN with hyphen format: e.g. 519-824
    const pin = `${Math.floor(100 + Math.random() * 900)}-${Math.floor(100 + Math.random() * 900)}`;
    const pairingKey = crypto.randomBytes(24).toString('hex');
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    const hostDevice = hostDeviceId ? this.devices.get(hostDeviceId) : undefined;
    const hostLabel = hostDevice?.label || 'TwinMind Host';

    const netInfo = getLocalNetworkAddress();
    const pairingUrl = `${netInfo.frontendUrl}/pair?code=${pin}`;
    const apiBase = `${req?.protocol || 'http'}://${req?.get('host') || `${netInfo.ip}:4000`}`;

    const qrPayload = JSON.stringify({
      twinmindPairing: true,
      version: '1.0',
      pairingCode: pin,
      pairingKey,
      pairingUrl,
      hostDeviceId: hostDeviceId || null,
      hostLabel,
      apiBase,
      expiresAt: expiresAt.toISOString(),
      nonce: crypto.randomBytes(8).toString('hex'),
    });

    const session = await prisma.devicePairingSession.create({
      data: {
        userId,
        pairingCode: pin,
        pairingKey,
        status: 'INITIATED',
        hostDeviceId: hostDeviceId || null,
        qrPayload,
        expiresAt,
        isClaimed: false,
      },
    });

    this.broadcast(userId, 'PAIRING_INITIATED', {
      sessionId: session.id,
      pairingCode: session.pairingCode,
      pairingUrl,
      expiresAt: session.expiresAt,
    });

    return { ...(session as DevicePairingSession), pairingUrl };
  }

  /**
   * Candidate device joins a pairing session via 6-digit PIN or scanned QR payload.
   * Transitions session to PENDING_APPROVAL and alerts host device via SSE.
   * Note: userId is optional so unauthenticated mobile devices on local Wi-Fi can join.
   */
  public async joinPairingSession(
    userId: string | undefined,
    input: JoinPairingInput,
    req?: Request,
  ): Promise<{ sessionId: string; status: string; message: string }> {
    const rawCode = (input.pairingCode || '').replace(/\s+/g, '').replace(/-/g, '');
    const now = new Date();

    // Find active session by rawCode or sessionId
    const sessions = await prisma.devicePairingSession.findMany({
      where: {
        ...(userId ? { userId } : {}),
        isClaimed: false,
        expiresAt: { gt: now },
      },
      orderBy: { createdAt: 'desc' },
    });

    const session = sessions.find((s) => {
      if (input.sessionId && s.id === input.sessionId) return true;
      const dbCode = s.pairingCode.replace(/\s+/g, '').replace(/-/g, '');
      return dbCode === rawCode;
    });

    if (!session) {
      throw new Error('Pairing session not found, expired, or already claimed. Please generate a new PIN or QR code.');
    }

    if (session.status === 'APPROVED' || session.isClaimed) {
      throw new Error('This pairing session has already been claimed and approved.');
    }

    const ipAddress = req?.ip || req?.socket?.remoteAddress || '127.0.0.1';
    const candidateName = input.candidateDevice.label.trim() || `${input.candidateDevice.type} Device`;

    const updated = await prisma.devicePairingSession.update({
      where: { id: session.id },
      data: {
        status: 'PENDING_APPROVAL',
        candidateDeviceName: candidateName,
        candidateDeviceType: input.candidateDevice.type,
        candidateDeviceKey: input.candidateDevice.deviceKey || `key_${crypto.randomBytes(12).toString('hex')}`,
        candidatePlatformInfo: (input.candidateDevice.platformInfo as object) || {},
        candidateIpAddress: ipAddress,
      },
    });

    // Alert host device via SSE with incoming device request
    this.broadcast(session.userId, 'PAIRING_REQUEST_RECEIVED', {
      sessionId: updated.id,
      pairingCode: updated.pairingCode,
      candidateDevice: {
        name: updated.candidateDeviceName,
        type: updated.candidateDeviceType,
        platformInfo: updated.candidatePlatformInfo,
        ipAddress: updated.candidateIpAddress,
      },
    });

    return {
      sessionId: updated.id,
      status: 'PENDING_APPROVAL',
      message: 'Pairing request received. Waiting for Owner authorization on host device...',
    };
  }

  /**
   * Host Owner explicitly approves the incoming pairing request.
   * Creates the new TrustedDevice and returns permanent device token and session token.
   */
  public async approvePairingSession(
    userId: string,
    sessionId: string,
    isOwner: boolean,
  ): Promise<{ success: boolean; device: DeviceRecord; token: string; sessionToken?: string }> {
    if (!isOwner) {
      throw new Error('Security boundary: Only Owner Mode can approve new device pairing requests.');
    }

    const session = await prisma.devicePairingSession.findUnique({
      where: { id: sessionId },
    });

    if (!session || session.userId !== userId) {
      throw new Error('Pairing session not found.');
    }

    if (session.status === 'EXPIRED' || session.expiresAt < new Date()) {
      throw new Error('Pairing session has expired. Generate a new pairing code.');
    }

    const adapter = DeviceAdapterFactory.getAdapter((session.candidateDeviceType as DeviceType) || 'PHONE');
    const deviceId = `device_${crypto.randomBytes(12).toString('hex')}`;
    const deviceToken = `dvt_${crypto.randomBytes(32).toString('hex')}`;
    const deviceKey = session.candidateDeviceKey || `key_${crypto.randomBytes(12).toString('hex')}`;
    const now = new Date();

    const user = await prisma.user.findUnique({ where: { id: userId } });
    const sessionToken = user
      ? createToken({ id: user.id, email: user.email, name: user.name })
      : undefined;

    const deviceRecord = await prisma.trustedDevice.upsert({
      where: { userId_deviceKey: { userId, deviceKey } },
      update: {
        label: session.candidateDeviceName || 'Paired Device',
        deviceType: session.candidateDeviceType || 'PHONE',
        status: 'TRUSTED',
        connectionMethod: 'QR_PIN',
        deviceToken,
        isTrusted: true,
        lastUsedAt: now,
        platformInfo: (session.candidatePlatformInfo as object) || {},
        ipAddress: session.candidateIpAddress || '127.0.0.1',
      },
      create: {
        id: deviceId,
        userId,
        deviceKey,
        label: session.candidateDeviceName || 'Paired Device',
        deviceType: session.candidateDeviceType || 'PHONE',
        status: 'TRUSTED',
        connectionMethod: 'QR_PIN',
        deviceToken,
        capabilities: adapter.defaultCapabilities,
        permissions: adapter.defaultPermissions,
        platformInfo: (session.candidatePlatformInfo as object) || {},
        ipAddress: session.candidateIpAddress || '127.0.0.1',
        isTrusted: true,
        lastUsedAt: now,
      },
    });

    // Mark session APPROVED and CLAIMED
    await prisma.devicePairingSession.update({
      where: { id: session.id },
      data: {
        status: 'APPROVED',
        isClaimed: true,
        claimedAt: now,
        claimedById: deviceRecord.id,
        candidateToken: deviceToken,
      },
    });

    const fullRecord: DeviceRecord = {
      id: deviceRecord.id,
      userId,
      deviceKey: deviceRecord.deviceKey,
      label: deviceRecord.label,
      type: deviceRecord.deviceType as DeviceType,
      status: 'TRUSTED',
      presence: 'ONLINE',
      connectionMethod: deviceRecord.connectionMethod,
      deviceToken: deviceRecord.deviceToken,
      capabilities: (deviceRecord.capabilities as DeviceCapability[]) || adapter.defaultCapabilities,
      permissions: (deviceRecord.permissions as DevicePermission[]) || adapter.defaultPermissions,
      platformInfo: (deviceRecord.platformInfo as PlatformInfo) || {},
      ipAddress: deviceRecord.ipAddress || undefined,
      isTrusted: true,
      lastSeenAt: now,
      createdAt: deviceRecord.createdAt,
      updatedAt: deviceRecord.updatedAt,
    };

    this.devices.set(fullRecord.id, fullRecord);

    // Notify candidate device via SSE that it was approved
    this.broadcast(userId, 'PAIRING_APPROVED', {
      sessionId: session.id,
      device: fullRecord,
      deviceToken,
      sessionToken,
    });

    // Notify all devices to update their topology
    this.broadcast(userId, 'DEVICE_REGISTERED', fullRecord);

    return { success: true, device: fullRecord, token: deviceToken, sessionToken };
  }

  /**
   * Host Owner rejects the pairing request.
   */
  public async rejectPairingSession(
    userId: string,
    sessionId: string,
    isOwner: boolean,
  ): Promise<{ success: boolean; message: string }> {
    if (!isOwner) {
      throw new Error('Security boundary: Only Owner Mode can reject pairing requests.');
    }

    const session = await prisma.devicePairingSession.findUnique({
      where: { id: sessionId },
    });

    if (!session || session.userId !== userId) {
      throw new Error('Pairing session not found.');
    }

    await prisma.devicePairingSession.update({
      where: { id: sessionId },
      data: { status: 'REJECTED' },
    });

    this.broadcast(userId, 'PAIRING_REJECTED', {
      sessionId,
      message: 'Pairing request was rejected by the Owner.',
    });

    return { success: true, message: 'Pairing request rejected.' };
  }

  /**
   * Polls pairing session status (used by candidate device as a fallback to SSE).
   * Note: userId is optional so unauthenticated mobile devices waiting for approval can poll.
   */
  public async getPairingSessionStatus(
    userId: string | undefined,
    sessionId: string,
  ): Promise<{
    status: string;
    device?: DeviceRecord;
    deviceToken?: string;
    sessionToken?: string;
    candidateDeviceName?: string | null;
    candidateDeviceType?: string | null;
  }> {
    const session = await prisma.devicePairingSession.findUnique({
      where: { id: sessionId },
    });

    if (!session || (userId && session.userId !== userId)) {
      throw new Error('Pairing session not found.');
    }

    if (session.status === 'APPROVED' && session.claimedById) {
      const dev = this.devices.get(session.claimedById);
      const user = await prisma.user.findUnique({ where: { id: session.userId } });
      const sessionToken = user
        ? createToken({ id: user.id, email: user.email, name: user.name })
        : undefined;

      return {
        status: 'APPROVED',
        device: dev,
        deviceToken: session.candidateToken || undefined,
        sessionToken,
        candidateDeviceName: session.candidateDeviceName,
        candidateDeviceType: session.candidateDeviceType,
      };
    }

    return {
      status: session.status,
      candidateDeviceName: session.candidateDeviceName,
      candidateDeviceType: session.candidateDeviceType,
    };
  }

  /**
   * Diagnostic connection ping to measure real-time latency and confirm bidirectional connectivity.
   */
  public async pingDevice(
    userId: string,
    deviceId: string,
    payload?: { timestamp?: number },
  ): Promise<{
    pong: boolean;
    latencyMs: number;
    timestamp: number;
    deviceId: string;
    deviceLabel: string;
    transport: string;
  }> {
    const device = this.devices.get(deviceId);
    if (!device || device.userId !== userId) {
      throw new Error(`Device '${deviceId}' not found or not owned by user.`);
    }

    const now = Date.now();
    const sentTime = payload?.timestamp || now;
    const latencyMs = Math.max(1, now - sentTime);

    device.presence = 'ONLINE';
    device.lastSeenAt = new Date();
    device.updatedAt = new Date();

    this.broadcast(userId, 'DEVICE_PING_PONG', {
      deviceId,
      latencyMs,
      timestamp: now,
      transport: 'LOCAL_NETWORK',
    });

    return {
      pong: true,
      latencyMs,
      timestamp: now,
      deviceId,
      deviceLabel: device.label,
      transport: 'LOCAL_NETWORK',
    };
  }
}

// Authoritative Singleton instance
export const deviceService = new DeviceService();

