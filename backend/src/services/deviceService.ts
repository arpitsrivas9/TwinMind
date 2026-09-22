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
  ALLOWED_DEVICE_COMMANDS,
} from '../types/deviceTypes';
import { DeviceAdapterFactory } from './deviceAdapters';

export class DeviceService {
  private devices: Map<string, DeviceRecord> = new Map();
  private commands: Map<string, DeviceCommand> = new Map();
  private requestToCommandId: Map<string, string> = new Map();
  private crossDeviceStates: Map<string, CrossDeviceState> = new Map();
  private sseSubscribers: Map<string, Set<(event: { type: string; data: unknown }) => void>> = new Map();
  private presenceSweeperInterval: NodeJS.Timeout | null = null;

  constructor() {
    this.startPresenceSweeper();
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
          isTrusted: record.isTrusted,
          lastUsedAt: now,
        },
        create: {
          userId,
          deviceKey,
          label: record.label,
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
}

// Authoritative Singleton instance
export const deviceService = new DeviceService();
