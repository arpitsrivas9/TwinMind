/**
 * Phase 9: Cross-Device Routes
 * REST & SSE endpoints for device registration, presence monitoring,
 * permission isolation, allowlisted command routing, and session sync.
 */

import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth';
import { successResponse, errorResponse } from '../utils/apiResponse';
import { getOrCreateTrustSession } from '../services/trust/trustSessionService';
import { deviceService } from '../services/deviceService';
import { ALLOWED_DEVICE_COMMANDS, DevicePermission } from '../types/deviceTypes';

const router = Router();

/**
 * Resolves whether the current session is authenticated as OWNER.
 * In Guest Mode, device lists, telemetry, and command dispatch are restricted.
 */
async function resolveIsOwner(req: AuthenticatedRequest): Promise<boolean> {
  const headerMode = req.headers['x-trust-mode'];
  if (headerMode === 'GUEST') return false;
  if (headerMode === 'OWNER') return true;

  try {
    const session = await getOrCreateTrustSession(req.user!.id, req);
    return session.currentMode === 'OWNER';
  } catch {
    return true; // Graceful fallback
  }
}

const registerSchema = z.object({
  label: z.string().min(1).max(120),
  type: z.enum(['LAPTOP', 'DESKTOP', 'PHONE', 'TABLET', 'SMARTWATCH', 'SMART_GLASSES', 'SMART_HOME']),
  deviceKey: z.string().optional(),
  capabilities: z.array(z.enum([
    'CAMERA',
    'MICROPHONE',
    'KEYBOARD',
    'SCREEN',
    'FILES',
    'NOTIFICATIONS',
    'GPS',
    'SPEAKERS',
    'BIOMETRICS',
  ])).optional(),
  permissions: z.array(z.enum([
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
    'LOCATION',
  ])).optional(),
  platformInfo: z.object({
    os: z.string().optional(),
    browser: z.string().optional(),
    model: z.string().optional(),
    appVersion: z.string().optional(),
  }).optional(),
});

const routeCommandSchema = z.object({
  requestId: z.string().min(1),
  sourceDeviceId: z.string().min(1),
  targetDeviceId: z.string().min(1),
  commandType: z.enum(ALLOWED_DEVICE_COMMANDS),
  payload: z.record(z.string(), z.unknown()).optional(),
});

const reportExecutionSchema = z.object({
  deviceId: z.string().min(1),
  success: z.boolean(),
  error: z.string().optional(),
});

const updateDeviceSchema = z.object({
  label: z.string().min(1).max(120).optional(),
  permissions: z.array(z.string()).optional(),
});

const syncSessionSchema = z.object({
  conversationId: z.string().min(1),
  targetDeviceId: z.string().optional(),
  activeView: z.string().optional(),
  contextSnapshot: z.record(z.string(), z.unknown()).optional(),
});

const simulateSchema = z.object({
  type: z.enum(['PHONE', 'TABLET', 'DESKTOP', 'SMARTWATCH', 'SMART_GLASSES', 'SMART_HOME']),
  label: z.string().min(1).max(120).optional(),
});

/**
 * SSE authentication middleware supporting both standard Authorization header and ?token= query parameter.
 */
const requireAuthSSE = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  let token: string | undefined;
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.slice(7);
  } else if (typeof req.query.token === 'string') {
    token = req.query.token;
  }

  if (!token) {
    return res.status(401).json(errorResponse('Authentication token required for SSE stream'));
  }

  try {
    const decoded = jwt.verify(token, env.jwtSecret) as {
      id: string;
      email: string;
      name: string;
    };
    req.user = decoded;
    return next();
  } catch {
    return res.status(401).json(errorResponse('Invalid or expired authentication token'));
  }
};

/**
 * GET /api/devices/stream
 * Realtime Server-Sent Events (SSE) push channel for device updates and commands.
 */
router.get('/stream', requireAuthSSE, async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user!.id;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  // Send initial connection event
  const sendEvent = (type: string, data: unknown) => {
    res.write(`event: ${type}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  sendEvent('connected', {
    userId,
    timestamp: new Date().toISOString(),
    service: 'TwinMind Device Intelligence SSE',
  });

  const unsubscribe = deviceService.subscribeDeviceEvents(userId, (event) => {
    sendEvent(event.type, event.data);
  });

  // Heartbeat ping every 25 seconds to keep intermediate proxies alive
  const pingInterval = setInterval(() => {
    sendEvent('ping', { timestamp: Date.now() });
  }, 25000);

  req.on('close', () => {
    clearInterval(pingInterval);
    unsubscribe();
  });
});

/**
 * POST /api/devices/register
 * Registers or updates a device record.
 */
router.post('/register', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json(errorResponse('Validation failed', { issues: parsed.error.issues }));
    }

    const device = await deviceService.registerDevice(req.user!.id, parsed.data, req);
    return res.status(200).json(successResponse(device));
  } catch (err: unknown) {
    const error = err as Error;
    return res.status(400).json(errorResponse(error.message || 'Failed to register device'));
  }
});

/**
 * GET /api/devices
 * Lists devices for user. In Guest Mode, returns empty array to prevent hardware reconnaissance.
 */
router.get('/', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const isOwner = await resolveIsOwner(req);
    const devices = await deviceService.getDevices(req.user!.id, isOwner);
    return res.status(200).json(successResponse(devices));
  } catch (err: unknown) {
    const error = err as Error;
    return res.status(400).json(errorResponse(error.message || 'Failed to list devices'));
  }
});

/**
 * GET /api/devices/presence
 * Returns summary presence status across all user devices.
 */
router.get('/presence', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const isOwner = await resolveIsOwner(req);
    const state = await deviceService.getCrossDeviceState(req.user!.id, isOwner);
    return res.status(200).json(successResponse({
      activeDeviceCount: state.activeDeviceCount,
      onlineDevices: state.onlineDevices,
      lastActivityAt: state.lastActivityAt,
      mode: state.mode,
    }));
  } catch (err: unknown) {
    const error = err as Error;
    return res.status(400).json(errorResponse(error.message || 'Failed to retrieve presence state'));
  }
});

/**
 * GET /api/devices/state
 * Returns unified cross-device workspace and conversation state.
 */
router.get('/state', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const isOwner = await resolveIsOwner(req);
    const state = await deviceService.getCrossDeviceState(req.user!.id, isOwner);
    return res.status(200).json(successResponse(state));
  } catch (err: unknown) {
    const error = err as Error;
    return res.status(400).json(errorResponse(error.message || 'Failed to retrieve cross-device state'));
  }
});

/**
 * POST /api/devices/sync-session
 * Synchronizes active conversation across devices. Requires Owner Mode.
 */
router.post('/sync-session', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const isOwner = await resolveIsOwner(req);
    if (!isOwner) {
      return res.status(403).json(errorResponse('Guest Mode cannot synchronize sessions across devices.'));
    }

    const parsed = syncSessionSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json(errorResponse('Validation failed', { issues: parsed.error.issues }));
    }

    const updatedState = await deviceService.syncSession(req.user!.id, parsed.data, isOwner);
    return res.status(200).json(successResponse(updatedState));
  } catch (err: unknown) {
    const error = err as Error;
    return res.status(400).json(errorResponse(error.message || 'Failed to synchronize session'));
  }
});

/**
 * POST /api/devices/commands
 * Dispatches an allowlisted cross-device command. Requires Owner Mode.
 */
router.post('/commands', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const isOwner = await resolveIsOwner(req);
    if (!isOwner) {
      return res.status(403).json(errorResponse('Guest Mode cannot route cross-device commands.'));
    }

    const parsed = routeCommandSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json(errorResponse('Validation failed', { issues: parsed.error.issues }));
    }

    const command = await deviceService.routeCommand(req.user!.id, parsed.data, isOwner);
    return res.status(200).json(successResponse(command));
  } catch (err: unknown) {
    const error = err as Error;
    return res.status(400).json(errorResponse(error.message || 'Failed to route command'));
  }
});

/**
 * GET /api/devices/commands
 * Retrieves history of dispatched commands for the current device or user.
 */
router.get('/commands', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const isOwner = await resolveIsOwner(req);
    const deviceId = req.query.deviceId as string | undefined;
    const commands = await deviceService.getCommands(req.user!.id, deviceId, isOwner);
    return res.status(200).json(successResponse(commands));
  } catch (err: unknown) {
    const error = err as Error;
    return res.status(400).json(errorResponse(error.message || 'Failed to retrieve commands'));
  }
});

/**
 * POST /api/devices/commands/:id/execute
 * Reports execution status back from target device.
 */
router.post('/commands/:id/execute', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const parsed = reportExecutionSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json(errorResponse('Validation failed', { issues: parsed.error.issues }));
    }

    const commandId = req.params.id as string;
    const command = await deviceService.reportCommandExecution(
      req.user!.id,
      commandId,
      parsed.data.deviceId,
      parsed.data.success,
      parsed.data.error,
    );
    return res.status(200).json(successResponse(command));
  } catch (err: unknown) {
    const error = err as Error;
    return res.status(400).json(errorResponse(error.message || 'Failed to report execution'));
  }
});

/**
 * POST /api/devices/simulator/simulate
 * Spawns a virtual Phone/Tablet/Desktop device for localhost testing. Requires Owner Mode.
 */
router.post('/simulator/simulate', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const isOwner = await resolveIsOwner(req);
    if (!isOwner) {
      return res.status(403).json(errorResponse('Guest Mode cannot access device simulator.'));
    }

    const parsed = simulateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json(errorResponse('Validation failed', { issues: parsed.error.issues }));
    }

    const simulated = await deviceService.simulateDevice(
      req.user!.id,
      parsed.data.type,
      parsed.data.label || `Virtual ${parsed.data.type}`,
      isOwner,
    );
    return res.status(201).json(successResponse(simulated));
  } catch (err: unknown) {
    const error = err as Error;
    return res.status(400).json(errorResponse(error.message || 'Failed to simulate device'));
  }
});

/**
 * GET /api/devices/:id
 * Retrieves device details.
 */
router.get('/:id', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const isOwner = await resolveIsOwner(req);
    const deviceId = req.params.id as string;
    const device = await deviceService.getDeviceById(req.user!.id, deviceId, isOwner);
    if (!device) {
      return res.status(404).json(errorResponse('Device not found or unauthorized'));
    }
    return res.status(200).json(successResponse(device));
  } catch (err: unknown) {
    const error = err as Error;
    return res.status(400).json(errorResponse(error.message || 'Failed to retrieve device'));
  }
});

/**
 * POST /api/devices/:id/verify
 * Elevates device from PENDING to TRUSTED. Requires Owner Mode.
 */
router.post('/:id/verify', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const isOwner = await resolveIsOwner(req);
    if (!isOwner) {
      return res.status(403).json(errorResponse('Owner Mode required to verify devices.'));
    }

    const deviceId = req.params.id as string;
    const device = await deviceService.verifyDevice(req.user!.id, deviceId, isOwner);
    return res.status(200).json(successResponse(device));
  } catch (err: unknown) {
    const error = err as Error;
    return res.status(400).json(errorResponse(error.message || 'Failed to verify device'));
  }
});

/**
 * POST /api/devices/:id/revoke
 * Revokes device access. Requires Owner Mode.
 */
router.post('/:id/revoke', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const isOwner = await resolveIsOwner(req);
    if (!isOwner) {
      return res.status(403).json(errorResponse('Owner Mode required to revoke devices.'));
    }

    const deviceId = req.params.id as string;
    const device = await deviceService.revokeDevice(req.user!.id, deviceId, isOwner);
    return res.status(200).json(successResponse(device));
  } catch (err: unknown) {
    const error = err as Error;
    return res.status(400).json(errorResponse(error.message || 'Failed to revoke device'));
  }
});

/**
 * PATCH /api/devices/:id
 * Updates device label or permissions. Requires Owner Mode.
 */
router.patch('/:id', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const isOwner = await resolveIsOwner(req);
    if (!isOwner) {
      return res.status(403).json(errorResponse('Owner Mode required to update device settings.'));
    }

    const parsed = updateDeviceSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json(errorResponse('Validation failed', { issues: parsed.error.issues }));
    }

    const deviceId = req.params.id as string;
    const device = await deviceService.updateDevice(
      req.user!.id,
      deviceId,
      {
        label: parsed.data.label,
        permissions: parsed.data.permissions as DevicePermission[] | undefined,
      },
      isOwner,
    );
    return res.status(200).json(successResponse(device));
  } catch (err: unknown) {
    const error = err as Error;
    return res.status(400).json(errorResponse(error.message || 'Failed to update device'));
  }
});

/**
 * POST /api/devices/:id/heartbeat
 * Lightweight application-level presence ping.
 */
router.post('/:id/heartbeat', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const deviceId = req.params.id as string;
    const result = await deviceService.heartbeat(req.user!.id, deviceId);
    return res.status(200).json(successResponse(result));
  } catch (err: unknown) {
    const error = err as Error;
    return res.status(400).json(errorResponse(error.message || 'Failed to process heartbeat'));
  }
});

export default router;
