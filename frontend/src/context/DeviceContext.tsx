"use client";

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
} from "react";
import { useAuth } from "./AuthContext";
import { useTrust } from "./TrustContext";
import {
  DeviceRecord,
  DeviceCommand,
  CrossDeviceState,
  DeviceType,
  RouteCommandInput,
  DeviceRegistrationInput,
} from "../types/device";
import {
  fetchDevicesApi,
  registerDeviceApi,
  verifyDeviceApi,
  revokeDeviceApi,
  updateDeviceApi,
  heartbeatDeviceApi,
  routeDeviceCommandApi,
  fetchDeviceCommandsApi,
  reportDeviceCommandExecutionApi,
  fetchCrossDeviceStateApi,
  syncCrossDeviceSessionApi,
  simulateDeviceApi,
  getAuthToken,
} from "../lib/api";
import { safeStorage } from "../lib/storage";

const DEVICE_TOKEN_KEY = "twinmind_device_token";
const CURRENT_DEVICE_ID_KEY = "twinmind_current_device_id";

function detectDeviceType(): DeviceType {
  if (typeof window === "undefined") return "LAPTOP";
  const ua = navigator.userAgent.toLowerCase();
  if (/ipad|tablet|(android(?!.*mobile))/i.test(ua)) {
    return "TABLET";
  }
  if (/mobile|iphone|ipod|android.*mobile/i.test(ua)) {
    return "PHONE";
  }
  if (/macintosh|mac os x/i.test(ua)) {
    return "LAPTOP";
  }
  if (/windows nt/i.test(ua)) {
    return "LAPTOP";
  }
  return "DESKTOP";
}

function getPlatformInfo() {
  if (typeof window === "undefined") return {};
  const ua = navigator.userAgent;
  let os = "Unknown OS";
  if (ua.includes("Win")) os = "Windows";
  else if (ua.includes("Mac")) os = "macOS";
  else if (ua.includes("Linux")) os = "Linux";
  else if (ua.includes("Android")) os = "Android";
  else if (ua.includes("iPhone") || ua.includes("iPad")) os = "iOS";

  let browser = "Browser";
  if (ua.includes("Chrome") && !ua.includes("Edg")) browser = "Chrome";
  else if (ua.includes("Edg")) browser = "Edge";
  else if (ua.includes("Safari") && !ua.includes("Chrome")) browser = "Safari";
  else if (ua.includes("Firefox")) browser = "Firefox";

  return {
    os,
    browser,
    model: typeof navigator !== "undefined" ? (navigator as any).userAgentData?.platform || os : os,
    appVersion: "TwinMind 2.0-Phase9",
  };
}

interface DeviceContextType {
  devices: DeviceRecord[];
  currentDevice: DeviceRecord | null;
  crossDeviceState: CrossDeviceState | null;
  recentCommands: DeviceCommand[];
  loading: boolean;
  error: string | null;
  incomingNotification: { title: string; message: string; timestamp: number } | null;
  clearNotification: () => void;
  refreshDevices: () => Promise<void>;
  registerDevice: (input: DeviceRegistrationInput) => Promise<DeviceRecord>;
  verifyDevice: (deviceId: string) => Promise<void>;
  revokeDevice: (deviceId: string) => Promise<void>;
  updateDevice: (deviceId: string, updates: { label?: string }) => Promise<void>;
  routeCommand: (input: RouteCommandInput) => Promise<DeviceCommand>;
  syncSession: (conversationId: string, activeView?: string, snapshot?: Record<string, unknown>) => Promise<void>;
  simulateDevice: (type: DeviceType, label?: string) => Promise<DeviceRecord>;
}

const DeviceContext = createContext<DeviceContextType | undefined>(undefined);

export function DeviceProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const { mode: trustMode } = useTrust();
  const isOwner = trustMode === "OWNER";

  const [devices, setDevices] = useState<DeviceRecord[]>([]);
  const [currentDevice, setCurrentDevice] = useState<DeviceRecord | null>(null);
  const [crossDeviceState, setCrossDeviceState] = useState<CrossDeviceState | null>(null);
  const [recentCommands, setRecentCommands] = useState<DeviceCommand[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [incomingNotification, setIncomingNotification] = useState<{
    title: string;
    message: string;
    timestamp: number;
  } | null>(null);

  const eventSourceRef = useRef<EventSource | null>(null);
  const heartbeatIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const currentDeviceIdRef = useRef<string | null>(null);

  const clearNotification = useCallback(() => {
    setIncomingNotification(null);
  }, []);

  // Fetch all devices and state
  const refreshDevices = useCallback(async () => {
    if (!user) return;
    try {
      setLoading(true);
      setError(null);
      const [fetchedDevices, fetchedState, fetchedCmds] = await Promise.all([
        fetchDevicesApi().catch(() => []),
        fetchCrossDeviceStateApi().catch(() => null),
        fetchDeviceCommandsApi().catch(() => []),
      ]);
      setDevices(fetchedDevices);
      setCrossDeviceState(fetchedState);
      setRecentCommands(fetchedCmds);

      // Identify current device if registered
      const savedId = currentDeviceIdRef.current || safeStorage.get<string>(CURRENT_DEVICE_ID_KEY, "");
      if (savedId) {
        const found = fetchedDevices.find((d) => d.id === savedId);
        if (found) setCurrentDevice(found);
      }
    } catch (err: unknown) {
      const msg = (err as Error).message || "Failed to load devices";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [user]);

  // Initial self-device auto-registration
  useEffect(() => {
    if (!user) {
      setDevices([]);
      setCurrentDevice(null);
      return;
    }

    let isMounted = true;

    async function initClientDevice() {
      try {
        let token = safeStorage.get<string>(DEVICE_TOKEN_KEY, "");
        if (!token) {
          token = `client_token_${Math.random().toString(36).substring(2, 15)}`;
          safeStorage.set(DEVICE_TOKEN_KEY, token);
        }

        const platform = getPlatformInfo();
        const detectedType = detectDeviceType();
        const label = `${platform.os} ${platform.browser || detectedType}`;

        const registered = await registerDeviceApi({
          label,
          type: detectedType,
          deviceKey: token,
          platformInfo: platform,
        });

        if (isMounted) {
          setCurrentDevice(registered);
          currentDeviceIdRef.current = registered.id;
          safeStorage.set(CURRENT_DEVICE_ID_KEY, registered.id);
          refreshDevices();
        }
      } catch (err) {
        console.warn("[DeviceContext] Auto-registration non-fatal error:", err);
      }
    }

    initClientDevice();

    return () => {
      isMounted = false;
    };
  }, [user, refreshDevices]);

  // 30s Application-level presence heartbeat
  useEffect(() => {
    if (!user || !currentDevice?.id) return;

    const deviceId = currentDevice.id;

    const sendHeartbeat = async () => {
      try {
        await heartbeatDeviceApi(deviceId);
      } catch {
        // Silent non-fatal heartbeat retry
      }
    };

    // Initial ping
    sendHeartbeat();

    heartbeatIntervalRef.current = setInterval(sendHeartbeat, 30000);

    return () => {
      if (heartbeatIntervalRef.current) {
        clearInterval(heartbeatIntervalRef.current);
      }
    };
  }, [user, currentDevice?.id]);

  // SSE Realtime push stream subscriber
  useEffect(() => {
    if (!user) return;
    const token = getAuthToken();
    if (!token) return;

    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }

    const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
    const sseUrl = `${apiBase}/api/devices/stream?token=${encodeURIComponent(token)}`;

    const es = new EventSource(sseUrl);
    eventSourceRef.current = es;

    es.addEventListener("connected", () => {
      // Stream established
    });

    es.addEventListener("DEVICE_REGISTERED", (e) => {
      try {
        const dev = JSON.parse(e.data) as DeviceRecord;
        setDevices((prev) => {
          const filtered = prev.filter((d) => d.id !== dev.id);
          return [dev, ...filtered];
        });
      } catch {}
    });

    es.addEventListener("DEVICE_UPDATED", (e) => {
      try {
        const dev = JSON.parse(e.data) as DeviceRecord;
        setDevices((prev) => prev.map((d) => (d.id === dev.id ? dev : d)));
        if (currentDeviceIdRef.current === dev.id) {
          setCurrentDevice(dev);
        }
      } catch {}
    });

    es.addEventListener("DEVICE_VERIFIED", (e) => {
      try {
        const dev = JSON.parse(e.data) as DeviceRecord;
        setDevices((prev) => prev.map((d) => (d.id === dev.id ? dev : d)));
      } catch {}
    });

    es.addEventListener("DEVICE_REVOKED", (e) => {
      try {
        const dev = JSON.parse(e.data) as DeviceRecord;
        setDevices((prev) => prev.map((d) => (d.id === dev.id ? dev : d)));
      } catch {}
    });

    es.addEventListener("PRESENCE_UPDATED", (e) => {
      try {
        const data = JSON.parse(e.data) as {
          deviceId: string;
          presence: 'ONLINE' | 'OFFLINE';
          lastSeenAt: string;
        };
        setDevices((prev) =>
          prev.map((d) =>
            d.id === data.deviceId
              ? { ...d, presence: data.presence, lastSeenAt: data.lastSeenAt }
              : d,
          ),
        );
      } catch {}
    });

    es.addEventListener("COMMAND_DISPATCHED", async (e) => {
      try {
        const payload = JSON.parse(e.data) as {
          command: DeviceCommand;
          targetDeviceId: string;
        };
        const cmd = payload.command;
        setRecentCommands((prev) => [cmd, ...prev.slice(0, 19)]);

        // Check if this command was targeted at this browser
        if (payload.targetDeviceId === currentDeviceIdRef.current) {
          if (cmd.commandType === "SHOW_NOTIFICATION") {
            const p = cmd.payload as { title?: string; message?: string };
            setIncomingNotification({
              title: p.title || "TwinMind Alert",
              message: p.message || "Incoming cross-device message",
              timestamp: Date.now(),
            });
            // Try browser Notification API if permitted
            if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "granted") {
              new Notification(p.title || "TwinMind Alert", { body: p.message });
            }
          }

          // Report completion back to backend
          try {
            await reportDeviceCommandExecutionApi(cmd.id, currentDeviceIdRef.current!, true);
          } catch {}
        }
      } catch {}
    });

    es.addEventListener("COMMAND_COMPLETED", (e) => {
      try {
        const data = JSON.parse(e.data) as {
          commandId: string;
          state: string;
          errorMessage?: string;
        };
        setRecentCommands((prev) =>
          prev.map((c) =>
            c.id === data.commandId
              ? { ...c, state: data.state as any, errorMessage: data.errorMessage }
              : c,
          ),
        );
      } catch {}
    });

    es.addEventListener("SESSION_SYNCED", (e) => {
      try {
        const data = JSON.parse(e.data) as {
          conversationId: string;
          activeView: string;
          syncPayload?: Record<string, unknown>;
        };
        setCrossDeviceState((prev) =>
          prev
            ? {
                ...prev,
                activeConversationId: data.conversationId,
                activeView: data.activeView,
                syncPayload: data.syncPayload,
              }
            : null,
        );
      } catch {}
    });

    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
    };
  }, [user]);

  // Actions
  const registerDevice = useCallback(async (input: DeviceRegistrationInput) => {
    const res = await registerDeviceApi(input);
    await refreshDevices();
    return res;
  }, [refreshDevices]);

  const verifyDevice = useCallback(async (deviceId: string) => {
    await verifyDeviceApi(deviceId);
    await refreshDevices();
  }, [refreshDevices]);

  const revokeDevice = useCallback(async (deviceId: string) => {
    await revokeDeviceApi(deviceId);
    await refreshDevices();
  }, [refreshDevices]);

  const updateDevice = useCallback(async (deviceId: string, updates: { label?: string }) => {
    await updateDeviceApi(deviceId, updates);
    await refreshDevices();
  }, [refreshDevices]);

  const routeCommand = useCallback(async (input: RouteCommandInput) => {
    const cmd = await routeDeviceCommandApi(input);
    setRecentCommands((prev) => [cmd, ...prev.slice(0, 19)]);
    return cmd;
  }, []);

  const syncSession = useCallback(
    async (conversationId: string, activeView?: string, snapshot?: Record<string, unknown>) => {
      const state = await syncCrossDeviceSessionApi({
        conversationId,
        activeView,
        contextSnapshot: snapshot,
      });
      setCrossDeviceState(state);
    },
    [],
  );

  const simulateDevice = useCallback(
    async (type: DeviceType, label?: string) => {
      const dev = await simulateDeviceApi(type, label);
      await refreshDevices();
      return dev;
    },
    [refreshDevices],
  );

  return (
    <DeviceContext.Provider
      value={{
        devices,
        currentDevice,
        crossDeviceState,
        recentCommands,
        loading,
        error,
        incomingNotification,
        clearNotification,
        refreshDevices,
        registerDevice,
        verifyDevice,
        revokeDevice,
        updateDevice,
        routeCommand,
        syncSession,
        simulateDevice,
      }}
    >
      {children}
    </DeviceContext.Provider>
  );
}

export function useDevice() {
  const context = useContext(DeviceContext);
  if (!context) {
    throw new Error("useDevice must be used within a DeviceProvider");
  }
  return context;
}
