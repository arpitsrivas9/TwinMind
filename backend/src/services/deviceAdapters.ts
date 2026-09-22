/**
 * Phase 9: Device Adapters
 * Modular capability adapters for Laptop, Desktop, Phone, Tablet, and extensible future devices.
 * Enforces hardware capability constraints and permitted command surfaces per platform.
 */

import {
  DeviceType,
  DeviceCapability,
  DevicePermission,
  DeviceCommandType,
  DeviceCommand,
  ALLOWED_DEVICE_COMMANDS,
} from '../types/deviceTypes';

export interface IDeviceAdapter {
  readonly deviceType: DeviceType;
  readonly defaultCapabilities: DeviceCapability[];
  readonly defaultPermissions: DevicePermission[];
  readonly supportedCommands: DeviceCommandType[];

  validateCommand(
    commandType: DeviceCommandType,
    payload?: Record<string, unknown>,
  ): { valid: boolean; reason?: string };

  formatExecutionPayload(command: DeviceCommand): Record<string, unknown>;
}

abstract class BaseDeviceAdapter implements IDeviceAdapter {
  abstract readonly deviceType: DeviceType;
  abstract readonly defaultCapabilities: DeviceCapability[];
  abstract readonly defaultPermissions: DevicePermission[];
  abstract readonly supportedCommands: DeviceCommandType[];

  validateCommand(
    commandType: DeviceCommandType,
    _payload?: Record<string, unknown>,
  ): { valid: boolean; reason?: string } {
    if (!ALLOWED_DEVICE_COMMANDS.includes(commandType)) {
      return {
        valid: false,
        reason: `Command '${commandType}' is not in the TwinMind allowlist.`,
      };
    }

    if (!this.supportedCommands.includes(commandType)) {
      return {
        valid: false,
        reason: `Device type '${this.deviceType}' does not support command '${commandType}'.`,
      };
    }

    return { valid: true };
  }

  formatExecutionPayload(command: DeviceCommand): Record<string, unknown> {
    return {
      commandId: command.id,
      commandType: command.commandType,
      targetDeviceId: command.targetDeviceId,
      sourceDeviceId: command.sourceDeviceId,
      payload: command.payload,
      timestamp: new Date().toISOString(),
    };
  }
}

export class LaptopAdapter extends BaseDeviceAdapter {
  readonly deviceType: DeviceType = 'LAPTOP';
  readonly defaultCapabilities: DeviceCapability[] = [
    'CAMERA',
    'MICROPHONE',
    'KEYBOARD',
    'SCREEN',
    'FILES',
    'NOTIFICATIONS',
    'SPEAKERS',
    'BIOMETRICS',
  ];
  readonly defaultPermissions: DevicePermission[] = [
    'READ_STATE',
    'SEND_COMMAND',
    'RECEIVE_COMMAND',
    'SYNC_SESSION',
    'SYNC_MEMORY',
    'SYNC_CONVERSATION',
    'NOTIFICATIONS',
    'CAMERA',
    'MICROPHONE',
    'FILES',
  ];
  readonly supportedCommands: DeviceCommandType[] = [
    'OPEN_TWINMIND',
    'FOCUS_TWINMIND',
    'SYNC_SESSION',
    'SYNC_STATE',
    'SHOW_NOTIFICATION',
    'OPEN_SUPPORTED_VIEW',
    'START_APPROVED_TWINMIND_ACTION',
  ];
}

export class DesktopAdapter extends BaseDeviceAdapter {
  readonly deviceType: DeviceType = 'DESKTOP';
  readonly defaultCapabilities: DeviceCapability[] = [
    'CAMERA',
    'MICROPHONE',
    'KEYBOARD',
    'SCREEN',
    'FILES',
    'NOTIFICATIONS',
    'SPEAKERS',
    'BIOMETRICS',
  ];
  readonly defaultPermissions: DevicePermission[] = [
    'READ_STATE',
    'SEND_COMMAND',
    'RECEIVE_COMMAND',
    'SYNC_SESSION',
    'SYNC_MEMORY',
    'SYNC_CONVERSATION',
    'NOTIFICATIONS',
    'CAMERA',
    'MICROPHONE',
    'FILES',
  ];
  readonly supportedCommands: DeviceCommandType[] = [
    'OPEN_TWINMIND',
    'FOCUS_TWINMIND',
    'SYNC_SESSION',
    'SYNC_STATE',
    'SHOW_NOTIFICATION',
    'OPEN_SUPPORTED_VIEW',
    'START_APPROVED_TWINMIND_ACTION',
  ];
}

export class PhoneAdapter extends BaseDeviceAdapter {
  readonly deviceType: DeviceType = 'PHONE';
  readonly defaultCapabilities: DeviceCapability[] = [
    'CAMERA',
    'MICROPHONE',
    'SCREEN',
    'NOTIFICATIONS',
    'GPS',
    'SPEAKERS',
    'BIOMETRICS',
  ];
  readonly defaultPermissions: DevicePermission[] = [
    'READ_STATE',
    'SEND_COMMAND',
    'RECEIVE_COMMAND',
    'SYNC_SESSION',
    'SYNC_CONVERSATION',
    'NOTIFICATIONS',
    'CAMERA',
    'MICROPHONE',
    'LOCATION',
  ];
  readonly supportedCommands: DeviceCommandType[] = [
    'OPEN_TWINMIND',
    'FOCUS_TWINMIND',
    'SYNC_SESSION',
    'SYNC_STATE',
    'SHOW_NOTIFICATION',
    'OPEN_SUPPORTED_VIEW',
  ];
}

export class TabletAdapter extends BaseDeviceAdapter {
  readonly deviceType: DeviceType = 'TABLET';
  readonly defaultCapabilities: DeviceCapability[] = [
    'CAMERA',
    'MICROPHONE',
    'SCREEN',
    'NOTIFICATIONS',
    'SPEAKERS',
    'BIOMETRICS',
  ];
  readonly defaultPermissions: DevicePermission[] = [
    'READ_STATE',
    'SEND_COMMAND',
    'RECEIVE_COMMAND',
    'SYNC_SESSION',
    'SYNC_CONVERSATION',
    'NOTIFICATIONS',
    'CAMERA',
    'MICROPHONE',
  ];
  readonly supportedCommands: DeviceCommandType[] = [
    'OPEN_TWINMIND',
    'FOCUS_TWINMIND',
    'SYNC_SESSION',
    'SYNC_STATE',
    'SHOW_NOTIFICATION',
    'OPEN_SUPPORTED_VIEW',
    'START_APPROVED_TWINMIND_ACTION',
  ];
}

// Extensible future-ready adapters
export class SmartwatchAdapter extends BaseDeviceAdapter {
  readonly deviceType: DeviceType = 'SMARTWATCH';
  readonly defaultCapabilities: DeviceCapability[] = [
    'MICROPHONE',
    'SCREEN',
    'NOTIFICATIONS',
    'SPEAKERS',
    'GPS',
  ];
  readonly defaultPermissions: DevicePermission[] = [
    'READ_STATE',
    'RECEIVE_COMMAND',
    'NOTIFICATIONS',
    'MICROPHONE',
  ];
  readonly supportedCommands: DeviceCommandType[] = [
    'SHOW_NOTIFICATION',
    'SYNC_STATE',
  ];
}

export class SmartGlassesAdapter extends BaseDeviceAdapter {
  readonly deviceType: DeviceType = 'SMART_GLASSES';
  readonly defaultCapabilities: DeviceCapability[] = [
    'CAMERA',
    'MICROPHONE',
    'SCREEN',
    'SPEAKERS',
  ];
  readonly defaultPermissions: DevicePermission[] = [
    'READ_STATE',
    'RECEIVE_COMMAND',
    'CAMERA',
    'MICROPHONE',
    'NOTIFICATIONS',
  ];
  readonly supportedCommands: DeviceCommandType[] = [
    'SHOW_NOTIFICATION',
    'SYNC_STATE',
    'START_APPROVED_TWINMIND_ACTION',
  ];
}

export class SmartHomeAdapter extends BaseDeviceAdapter {
  readonly deviceType: DeviceType = 'SMART_HOME';
  readonly defaultCapabilities: DeviceCapability[] = [
    'MICROPHONE',
    'SPEAKERS',
    'NOTIFICATIONS',
  ];
  readonly defaultPermissions: DevicePermission[] = [
    'READ_STATE',
    'RECEIVE_COMMAND',
    'NOTIFICATIONS',
  ];
  readonly supportedCommands: DeviceCommandType[] = [
    'SHOW_NOTIFICATION',
    'SYNC_STATE',
  ];
}

export class DeviceAdapterFactory {
  private static adapters: Map<DeviceType, IDeviceAdapter> = new Map([
    ['LAPTOP', new LaptopAdapter()],
    ['DESKTOP', new DesktopAdapter()],
    ['PHONE', new PhoneAdapter()],
    ['TABLET', new TabletAdapter()],
    ['SMARTWATCH', new SmartwatchAdapter()],
    ['SMART_GLASSES', new SmartGlassesAdapter()],
    ['SMART_HOME', new SmartHomeAdapter()],
  ]);

  public static getAdapter(type: DeviceType): IDeviceAdapter {
    const adapter = this.adapters.get(type);
    if (!adapter) {
      return this.adapters.get('LAPTOP')!;
    }
    return adapter;
  }
}
