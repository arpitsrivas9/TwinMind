"use client";

import React, { Suspense, useState, useEffect, useCallback, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { getApiBase } from "@/lib/api";
import { safeStorage } from "@/lib/storage";

interface PlatformInfo {
  os: string;
  browser: string;
  model: string;
  appVersion: string;
}

interface PairedDevice {
  id: string;
  label: string;
  type: string;
  status: string;
  presence: string;
  ipAddress?: string;
  connectionMethod?: string;
}

interface PingResult {
  pong: boolean;
  latencyMs: number;
  timestamp: number;
  deviceId: string;
  deviceLabel: string;
  transport: string;
}

const STORAGE_KEYS = {
  DEVICE_TOKEN: "twinmind_mobile_device_token",
  DEVICE_ID: "twinmind_mobile_device_id",
  SESSION_TOKEN: "twinmind_token",
  DEVICE_DATA: "twinmind_mobile_device_data",
};

export function MobilePairingClient({ initialCode }: { initialCode?: string }) {
  const searchParams = useSearchParams();
  const rawCode = searchParams?.get("code") || initialCode || "";
  const cleanInit = rawCode.replace(/[^0-9]/g, "");
  const formattedCode = cleanInit.length === 6 ? `${cleanInit.slice(0, 3)}-${cleanInit.slice(3)}` : rawCode;

  const [pinCode, setPinCode] = useState(formattedCode);
  const [deviceLabel, setDeviceLabel] = useState("");
  const [deviceType, setDeviceType] = useState<"PHONE" | "TABLET" | "LAPTOP">("PHONE");
  const [platformInfo, setPlatformInfo] = useState<PlatformInfo>({
    os: "Mobile OS",
    browser: "Mobile Browser",
    model: "Smartphone",
    appVersion: "TwinMind 2.0-WebClient",
  });

  const [hostStatus, setHostStatus] = useState<"CHECKING" | "ONLINE" | "UNREACHABLE">("CHECKING");
  const hostIp = typeof window !== "undefined" ? window.location.hostname : "TwinMind Host";

  // Flow states: 'CONFIG' | 'SUBMITTING' | 'WAITING_APPROVAL' | 'PAIRED' | 'ERROR'
  const [flowState, setFlowState] = useState<
    "CONFIG" | "SUBMITTING" | "WAITING_APPROVAL" | "PAIRED" | "ERROR"
  >("CONFIG");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [pairedDevice, setPairedDevice] = useState<PairedDevice | null>(null);
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string>("");

  // Test Ping state
  const [pingLoading, setPingLoading] = useState(false);
  const [lastPing, setLastPing] = useState<PingResult | null>(null);
  const [pingHistory, setPingHistory] = useState<PingResult[]>([]);

  // Live SSE incoming commands/notifications
  const [liveNotifications, setLiveNotifications] = useState<
    { id: string; title: string; body: string; time: string }[]
  >([]);

  const sseRef = useRef<EventSource | null>(null);

  // Detect platform and device type on mount
  useEffect(() => {
    if (typeof window === "undefined") return;
    const ua = navigator.userAgent;

    let os = "Unknown OS";
    if (/iphone|ipad|ipod/i.test(ua)) os = "iOS";
    else if (/android/i.test(ua)) os = "Android";
    else if (/windows/i.test(ua)) os = "Windows";
    else if (/mac/i.test(ua)) os = "macOS";
    else if (/linux/i.test(ua)) os = "Linux";

    let browser = "Web Browser";
    if (/crios|chrome/i.test(ua) && !/edg/i.test(ua)) browser = "Chrome";
    else if (/safari/i.test(ua) && !/chrome|crios/i.test(ua)) browser = "Safari";
    else if (/firefox|fxios/i.test(ua)) browser = "Firefox";
    else if (/edg/i.test(ua)) browser = "Edge";

    const isTab = /ipad|tablet|(android(?!.*mobile))/i.test(ua);
    const type: "PHONE" | "TABLET" | "LAPTOP" = isTab ? "TABLET" : "PHONE";

    const modelName = `${os} ${type === "PHONE" ? "Phone" : "Tablet"}`;
    const defaultLabel = `${modelName} (${browser})`;

    setDeviceType(type);
    setDeviceLabel(defaultLabel);
    setPlatformInfo({
      os,
      browser,
      model: modelName,
      appVersion: "TwinMind 2.0-WebClient",
    });

    if (formattedCode && !pinCode) {
      setPinCode(formattedCode);
    }

    // Check if device is already paired from previous session
    const savedDev = safeStorage.get<PairedDevice | null>(STORAGE_KEYS.DEVICE_DATA, null);
    const savedToken = safeStorage.get<string | null>(STORAGE_KEYS.SESSION_TOKEN, null);
    if (savedDev && savedToken) {
      setPairedDevice(savedDev);
      setSessionToken(savedToken);
      setFlowState("PAIRED");
    }
  }, [formattedCode]);

  // Check Host Reachability
  const checkHost = useCallback(async () => {
    setHostStatus("CHECKING");
    try {
      const apiBase = getApiBase();
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 4000);
      const res = await fetch(`${apiBase}/api/health`, { signal: ctrl.signal });
      clearTimeout(timer);
      if (res.ok) {
        setHostStatus("ONLINE");
      } else {
        setHostStatus("UNREACHABLE");
      }
    } catch {
      setHostStatus("UNREACHABLE");
    }
  }, []);

  useEffect(() => {
    checkHost();
  }, [checkHost]);

  // Clean PIN formatting (insert hyphen e.g. 123-456)
  const handlePinChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/[^0-9]/g, "").slice(0, 6);
    if (raw.length > 3) {
      setPinCode(`${raw.slice(0, 3)}-${raw.slice(3)}`);
    } else {
      setPinCode(raw);
    }
  };

  // Connect & Submit Pairing Request
  const handleSubmitPairing = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const cleanPin = pinCode.replace(/[^0-9]/g, "");
    if (cleanPin.length !== 6) {
      setErrorMessage("Please enter a valid 6-digit PIN code.");
      return;
    }

    setErrorMessage(null);
    setFlowState("SUBMITTING");
    setStatusMessage("Connecting to TwinMind host...");

    try {
      const apiBase = getApiBase();
      let deviceKey = safeStorage.get<string>(STORAGE_KEYS.DEVICE_TOKEN, "");
      if (!deviceKey) {
        deviceKey = `mob_${Math.random().toString(36).substring(2, 12)}_${Date.now()}`;
        safeStorage.set(STORAGE_KEYS.DEVICE_TOKEN, deviceKey);
      }

      const res = await fetch(`${apiBase}/api/devices/pairing/join`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pairingCode: pinCode,
          candidateDevice: {
            label: deviceLabel.trim() || `${platformInfo.os} Phone`,
            type: deviceType,
            deviceKey,
            platformInfo,
          },
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error?.message || "Failed to join pairing session.");
      }

      const sid = data.data.sessionId;
      setSessionId(sid);
      setFlowState("WAITING_APPROVAL");
      setStatusMessage("Pairing request sent! Waiting for Owner approval on host laptop...");
    } catch (err: unknown) {
      const error = err as Error;
      setErrorMessage(error.message || "Failed to submit pairing request.");
      setFlowState("CONFIG");
    }
  };

  // Poll for Approval when in WAITING_APPROVAL state
  useEffect(() => {
    if (flowState !== "WAITING_APPROVAL" || !sessionId) return;

    let isMounted = true;
    const interval = setInterval(async () => {
      try {
        const apiBase = getApiBase();
        const res = await fetch(`${apiBase}/api/devices/pairing/${sessionId}/status`);
        const data = await res.json();

        if (!isMounted) return;

        if (res.ok && data.success) {
          const { status, device, deviceToken, sessionToken: sToken } = data.data;

          if (status === "APPROVED" && device) {
            clearInterval(interval);
            setPairedDevice(device);
            if (sToken) {
              setSessionToken(sToken);
              safeStorage.set(STORAGE_KEYS.SESSION_TOKEN, sToken);
              localStorage.setItem("twinmind_token", sToken);
            }
            if (deviceToken) {
              safeStorage.set(STORAGE_KEYS.DEVICE_TOKEN, deviceToken);
            }
            safeStorage.set(STORAGE_KEYS.DEVICE_ID, device.id);
            safeStorage.set(STORAGE_KEYS.DEVICE_DATA, device);
            setFlowState("PAIRED");
            setStatusMessage("✓ Device Approved & Paired!");
          } else if (status === "REJECTED") {
            clearInterval(interval);
            setErrorMessage("Pairing request was declined by the Owner.");
            setFlowState("CONFIG");
          } else if (status === "EXPIRED") {
            clearInterval(interval);
            setErrorMessage("Pairing session expired. Please enter a fresh PIN from your laptop.");
            setFlowState("CONFIG");
          }
        }
      } catch {
        // Continue polling on transient network glitches
      }
    }, 2000);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [flowState, sessionId]);

  // Subscribe to live SSE events when paired
  useEffect(() => {
    if (flowState !== "PAIRED" || !sessionToken) return;

    const apiBase = getApiBase();
    const streamUrl = `${apiBase}/api/devices/stream?token=${encodeURIComponent(sessionToken)}`;

    try {
      const sse = new EventSource(streamUrl);
      sseRef.current = sse;

      sse.addEventListener("connected", () => {
        // SSE connected
      });

      sse.addEventListener("COMMAND_DISPATCHED", (e: MessageEvent) => {
        try {
          const payload = JSON.parse(e.data);
          const cmd = payload.command || payload;
          setLiveNotifications((prev) => [
            {
              id: cmd.id || `notif_${Date.now()}`,
              title: `Command: ${cmd.commandType || "Cross-Device Action"}`,
              body: cmd.payload?.message || JSON.stringify(cmd.payload || {}),
              time: new Date().toLocaleTimeString(),
            },
            ...prev.slice(0, 9),
          ]);
        } catch {}
      });

      sse.addEventListener("SHOW_NOTIFICATION", (e: MessageEvent) => {
        try {
          const payload = JSON.parse(e.data);
          setLiveNotifications((prev) => [
            {
              id: `notif_${Date.now()}`,
              title: payload.title || "TwinMind Alert",
              body: payload.message || payload.body || "New cross-device update",
              time: new Date().toLocaleTimeString(),
            },
            ...prev.slice(0, 9),
          ]);
        } catch {}
      });

      sse.onerror = () => {
        // SSE will attempt auto-reconnect
      };

      return () => {
        sse.close();
      };
    } catch {}
  }, [flowState, sessionToken]);

  // Send Test Ping
  const handleSendPing = async () => {
    if (!pairedDevice) return;
    setPingLoading(true);

    const clientTimestamp = Date.now();
    try {
      const apiBase = getApiBase();
      const token = sessionToken || safeStorage.get<string>(STORAGE_KEYS.SESSION_TOKEN, "");
      const res = await fetch(`${apiBase}/api/devices/${pairedDevice.id}/ping`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ timestamp: clientTimestamp }),
      });

      const data = await res.json();
      const rtt = Math.max(1, Date.now() - clientTimestamp);

      if (res.ok && data.success) {
        const pingData: PingResult = {
          pong: true,
          latencyMs: rtt,
          timestamp: Date.now(),
          deviceId: pairedDevice.id,
          deviceLabel: pairedDevice.label,
          transport: data.data.transport || "LOCAL_NETWORK",
        };
        setLastPing(pingData);
        setPingHistory((prev) => [pingData, ...prev.slice(0, 4)]);
      } else {
        throw new Error(data.error?.message || "Ping failed");
      }
    } catch (err: unknown) {
      const error = err as Error;
      setLastPing({
        pong: false,
        latencyMs: -1,
        timestamp: Date.now(),
        deviceId: pairedDevice.id,
        deviceLabel: pairedDevice.label,
        transport: `Failed: ${error.message}`,
      });
    } finally {
      setPingLoading(false);
    }
  };

  // Disconnect & Unpair
  const handleUnpair = async () => {
    if (!confirm("Are you sure you want to unpair this device? You will need to re-scan or enter a new PIN.")) {
      return;
    }

    if (pairedDevice && sessionToken) {
      try {
        const apiBase = getApiBase();
        await fetch(`${apiBase}/api/devices/${pairedDevice.id}/unpair`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${sessionToken}`,
            "x-trust-mode": "OWNER",
          },
        });
      } catch {}
    }

    if (sseRef.current) {
      sseRef.current.close();
    }

    safeStorage.remove(STORAGE_KEYS.DEVICE_DATA);
    safeStorage.remove(STORAGE_KEYS.SESSION_TOKEN);
    safeStorage.remove(STORAGE_KEYS.DEVICE_ID);
    setPairedDevice(null);
    setSessionToken(null);
    setSessionId(null);
    setFlowState("CONFIG");
    setErrorMessage(null);
    setPinCode("");
    setLastPing(null);
    setPingHistory([]);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-cyan-500/30">
      {/* Top Mobile Bar */}
      <header className="sticky top-0 z-20 backdrop-blur-md bg-slate-950/80 border-b border-slate-800 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="size-8 rounded-lg bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center font-bold text-white text-sm shadow-lg shadow-cyan-500/20">
            TM
          </div>
          <div>
            <h1 className="text-sm font-semibold tracking-tight text-white leading-none">
              TwinMind™ Mobile
            </h1>
            <span className="text-[10px] text-cyan-400 font-mono">
              Local Wireless Pairing
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <span
            className={`inline-block size-2 rounded-full ${
              flowState === "PAIRED"
                ? "bg-emerald-400 shadow-sm shadow-emerald-400 animate-pulse"
                : flowState === "WAITING_APPROVAL"
                ? "bg-amber-400 animate-ping"
                : "bg-slate-600"
            }`}
          />
          <span className="text-[11px] font-mono text-slate-400 uppercase">
            {flowState === "PAIRED"
              ? "ONLINE"
              : flowState === "WAITING_APPROVAL"
              ? "WAITING"
              : "READY"}
          </span>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-md w-full mx-auto p-4 flex flex-col justify-center space-y-4">
        {/* ================= STATE 1: CONFIG & PIN ENTRY ================= */}
        {flowState === "CONFIG" && (
          <div className="space-y-5">
            <div className="text-center space-y-1.5">
              <div className="size-14 rounded-2xl bg-cyan-950/50 border border-cyan-500/30 flex items-center justify-center text-2xl mx-auto shadow-inner">
                📱
              </div>
              <h2 className="text-xl font-bold text-white tracking-tight">
                TwinMind Device Pairing
              </h2>
              <p className="text-xs text-slate-400 max-w-xs mx-auto">
                Secure local network handshake with your laptop. Zero native app required.
              </p>
            </div>

            {/* Structured Connection Overview Card */}
            <div className="rounded-2xl border border-cyan-500/30 bg-slate-900/70 p-4 space-y-2.5 shadow-xl backdrop-blur">
              <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                <div className="flex items-center gap-2">
                  <span className="text-sm">💻</span>
                  <span className="text-xs font-semibold text-slate-300">Device</span>
                </div>
                <span className="text-xs font-mono text-cyan-300 truncate max-w-[200px]">
                  Laptop / TwinMind Host ({hostIp})
                </span>
              </div>

              <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                <div className="flex items-center gap-2">
                  <span className="text-sm">🔢</span>
                  <span className="text-xs font-semibold text-slate-300">Session</span>
                </div>
                <span className="text-xs font-mono font-bold text-accent-cyan tracking-wider">
                  {pinCode || "Pending PIN"}
                </span>
              </div>

              <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                <div className="flex items-center gap-2">
                  <span className="text-sm">📶</span>
                  <span className="text-xs font-semibold text-slate-300">Connection</span>
                </div>
                <span className="text-xs font-mono text-emerald-400 flex items-center gap-1.5">
                  <span className="size-2 rounded-full bg-emerald-400 animate-pulse" />
                  Local Network (Wi-Fi)
                </span>
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-sm">⚡</span>
                  <span className="text-xs font-semibold text-slate-300">Status</span>
                </div>
                <span className="text-xs font-semibold text-amber-300">
                  Ready to Request
                </span>
              </div>
            </div>

            {/* Diagnostic Unreachable Alert if host port 4000 not reachable */}
            {hostStatus === "UNREACHABLE" && (
              <div className="p-3.5 rounded-xl border border-amber-500/30 bg-amber-500/10 space-y-2 text-xs">
                <div className="font-semibold text-amber-300 flex items-center gap-1.5">
                  <span>⚠️</span> Cannot reach TwinMind Host on port 4000
                </div>
                <p className="text-[11px] text-slate-300 leading-relaxed">
                  Make sure your phone and laptop are connected to the <strong>same Wi-Fi network</strong> and that the laptop’s Windows Network Profile is set to <strong>Private</strong>.
                </p>
                <div className="flex items-center justify-between pt-1">
                  <span className="text-[10px] font-mono text-slate-400">Target: {hostIp}:4000</span>
                  <button
                    type="button"
                    onClick={checkHost}
                    className="px-2.5 py-1 rounded-lg text-xs font-medium bg-amber-500/20 text-amber-200 border border-amber-500/40 hover:bg-amber-500/30 transition"
                  >
                    Retry Connection
                  </button>
                </div>
              </div>
            )}

            <form onSubmit={handleSubmitPairing} className="space-y-4">
              {/* PIN Code Input */}
              <div className="p-4 rounded-2xl border border-cyan-500/30 bg-slate-900/60 backdrop-blur space-y-2">
                <label className="block text-xs font-semibold text-cyan-300 uppercase tracking-wider">
                  6-Digit Pairing PIN
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  placeholder="000-000"
                  value={pinCode}
                  onChange={handlePinChange}
                  className="w-full text-center text-3xl font-mono font-bold tracking-widest bg-slate-950 border border-slate-700 rounded-xl py-3 text-cyan-400 placeholder:text-slate-700 focus:outline-none focus:border-cyan-400 transition"
                  autoFocus
                />
                <p className="text-[10px] text-slate-400 text-center">
                  Look at the 6-digit code displayed on your laptop screen.
                </p>
              </div>

              {/* Device Label / Platform Info */}
              <div className="p-4 rounded-xl border border-slate-800 bg-slate-900/40 space-y-3">
                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-slate-400">
                    Device Name
                  </label>
                  <input
                    type="text"
                    value={deviceLabel}
                    onChange={(e) => setDeviceLabel(e.target.value)}
                    className="w-full text-xs bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-cyan-500/50"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2 text-[10px] font-mono text-slate-400 pt-1">
                  <div>
                    <span className="text-slate-400 block">OS / Browser:</span>
                    <span className="text-slate-300">
                      {platformInfo.os} • {platformInfo.browser}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block">Device Type:</span>
                    <span className="text-slate-300">{deviceType}</span>
                  </div>
                </div>
              </div>

              {errorMessage && (
                <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs flex items-center gap-2">
                  <span>⚠️</span> {errorMessage}
                </div>
              )}

              <button
                type="submit"
                disabled={pinCode.replace(/[^0-9]/g, "").length !== 6}
                className="w-full py-3.5 rounded-xl font-semibold text-sm bg-gradient-to-r from-cyan-500 to-blue-600 text-white shadow-lg shadow-cyan-500/20 hover:from-cyan-400 hover:to-blue-500 transition disabled:opacity-50 disabled:pointer-events-none active:scale-[0.99] flex items-center justify-center gap-2"
              >
                <span>Request Pairing</span>
                <span>→</span>
              </button>
            </form>
          </div>
        )}

        {/* ================= STATE 2: WAITING FOR HOST APPROVAL ================= */}
        {(flowState === "SUBMITTING" || flowState === "WAITING_APPROVAL") && (
          <div className="text-center space-y-6 p-6 rounded-2xl border border-cyan-500/30 bg-slate-900/70 backdrop-blur shadow-2xl">
            <div className="relative size-20 mx-auto">
              <div className="absolute inset-0 rounded-full border-4 border-cyan-500/20" />
              <div className="absolute inset-0 rounded-full border-4 border-cyan-400 border-t-transparent animate-spin" />
              <div className="absolute inset-0 flex items-center justify-center text-2xl">
                ⏳
              </div>
            </div>

            <div className="space-y-2">
              <h2 className="text-lg font-bold text-white">
                Waiting for Owner Approval
              </h2>
              <p className="text-xs text-slate-300 max-w-xs mx-auto">
                {statusMessage}
              </p>
            </div>

            <div className="p-3 rounded-xl bg-cyan-950/40 border border-cyan-500/20 text-xs font-mono text-cyan-300">
              PIN: <span className="font-bold tracking-widest">{pinCode}</span>
            </div>

            <div className="text-[11px] text-slate-400 space-y-1">
              <p>On your laptop, click <strong className="text-white">Approve</strong> on the incoming request prompt.</p>
              <p className="text-[10px]">Zero OS modification • Secure local handshake</p>
            </div>

            <button
              type="button"
              onClick={() => setFlowState("CONFIG")}
              className="text-xs text-slate-400 hover:text-white underline underline-offset-4"
            >
              Cancel Request
            </button>
          </div>
        )}

        {/* ================= STATE 3: PAIRED & CONNECTED ================= */}
        {flowState === "PAIRED" && pairedDevice && (
          <div className="space-y-5">
            {/* Status Card */}
            <div className="p-5 rounded-2xl border border-emerald-500/30 bg-gradient-to-b from-emerald-950/30 to-slate-900/60 backdrop-blur space-y-4 shadow-xl">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="size-10 rounded-xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-xl text-emerald-400">
                    ✓
                  </div>
                  <div>
                    <h2 className="text-base font-bold text-white leading-tight">
                      {pairedDevice.label}
                    </h2>
                    <span className="text-[11px] text-emerald-400 font-medium flex items-center gap-1">
                      <span className="size-1.5 rounded-full bg-emerald-400 animate-pulse" />
                      Trusted & Connected
                    </span>
                  </div>
                </div>

                <span className="px-2.5 py-1 rounded-full text-[10px] font-mono font-semibold bg-emerald-500/10 text-emerald-300 border border-emerald-500/20">
                  {pairedDevice.type}
                </span>
              </div>

              {/* Specs & Transport Grid */}
              <div className="grid grid-cols-2 gap-2 text-[11px] font-mono bg-slate-950/60 p-3 rounded-xl border border-slate-800">
                <div>
                  <span className="text-slate-400 block text-[10px]">Transport</span>
                  <span className="text-cyan-300 font-semibold">Local Wi-Fi Network</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px]">Connection</span>
                  <span className="text-slate-200">
                    {pairedDevice.connectionMethod || "QR_PIN"}
                  </span>
                </div>
                <div className="col-span-2 pt-1 border-t border-slate-800/80">
                  <span className="text-slate-400 block text-[10px]">Device ID</span>
                  <span className="text-slate-400 text-[10px] truncate block">
                    {pairedDevice.id}
                  </span>
                </div>
              </div>
            </div>

            {/* Diagnostic Test Ping Section */}
            <div className="p-5 rounded-2xl border border-cyan-500/30 bg-slate-900/60 backdrop-blur space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-white">
                    Diagnostic Connection Test
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    Send real-time ping to host laptop & measure round-trip latency.
                  </p>
                </div>
                <span className="text-lg">⚡</span>
              </div>

              <button
                type="button"
                onClick={handleSendPing}
                disabled={pingLoading}
                className="w-full py-3 rounded-xl font-semibold text-xs bg-cyan-500 text-slate-950 hover:bg-cyan-400 transition flex items-center justify-center gap-2 shadow-md shadow-cyan-500/20 disabled:opacity-50 active:scale-[0.99]"
              >
                {pingLoading ? (
                  <>
                    <span className="size-3.5 rounded-full border-2 border-slate-950 border-t-transparent animate-spin" />
                    <span>Measuring Latency...</span>
                  </>
                ) : (
                  <>
                    <span>📡</span>
                    <span>Send Test Ping</span>
                  </>
                )}
              </button>

              {/* Ping Result Banner */}
              {lastPing && (
                <div
                  className={`p-3 rounded-xl border text-xs font-mono space-y-1 ${
                    lastPing.pong
                      ? "bg-emerald-950/30 border-emerald-500/30 text-emerald-300"
                      : "bg-rose-950/30 border-rose-500/30 text-rose-300"
                  }`}
                >
                  <div className="flex items-center justify-between font-semibold">
                    <span>{lastPing.pong ? "✓ Pong Received!" : "✗ Ping Failed"}</span>
                    <span>{lastPing.latencyMs > 0 ? `${lastPing.latencyMs}ms` : "---"}</span>
                  </div>
                  <div className="text-[10px] text-slate-400 flex items-center justify-between">
                    <span>Transport: {lastPing.transport}</span>
                    <span>{new Date(lastPing.timestamp).toLocaleTimeString()}</span>
                  </div>
                </div>
              )}

              {/* Ping History */}
              {pingHistory.length > 1 && (
                <div className="space-y-1 pt-1 border-t border-slate-800">
                  <span className="text-[10px] font-mono text-slate-400 block uppercase">
                    Recent Pings
                  </span>
                  <div className="space-y-1">
                    {pingHistory.slice(1).map((p, idx) => (
                      <div
                        key={idx}
                        className="flex items-center justify-between text-[10px] font-mono text-slate-400 bg-slate-950/40 px-2 py-1 rounded"
                      >
                        <span>{new Date(p.timestamp).toLocaleTimeString()}</span>
                        <span className="text-cyan-400 font-semibold">{p.latencyMs}ms</span>
                        <span>{p.transport}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Live SSE Notifications received from Host */}
            {liveNotifications.length > 0 && (
              <div className="p-4 rounded-xl border border-slate-800 bg-slate-900/40 space-y-2">
                <span className="text-[10px] font-mono text-cyan-400 uppercase tracking-wider block">
                  Live Notifications from Laptop ({liveNotifications.length})
                </span>
                <div className="space-y-1.5 max-h-36 overflow-y-auto">
                  {liveNotifications.map((notif) => (
                    <div
                      key={notif.id}
                      className="p-2 rounded-lg bg-slate-950/80 border border-slate-800 text-xs space-y-0.5"
                    >
                      <div className="flex items-center justify-between font-semibold text-slate-200">
                        <span>{notif.title}</span>
                        <span className="text-[9px] text-slate-400 font-mono">
                          {notif.time}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-400">{notif.body}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex items-center gap-3 pt-2">
              <a
                href="/"
                className="flex-1 py-3 text-center rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-white transition border border-slate-700"
              >
                Open TwinMind Chat →
              </a>
              <button
                type="button"
                onClick={handleUnpair}
                className="px-4 py-3 rounded-xl text-xs font-medium text-rose-400 hover:bg-rose-500/10 border border-rose-500/20 transition"
              >
                Unpair
              </button>
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="text-center py-4 text-[10px] text-slate-400 font-mono border-t border-slate-900">
        TwinMind AI • Phase 9.1 Local Network Transport • Zero OS Modification
      </footer>
    </div>
  );
}

export default function PairPage({ initialCode }: { initialCode?: string } = {}) {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center">
          <div className="text-center space-y-2">
            <div className="size-8 rounded-full border-2 border-cyan-400 border-t-transparent animate-spin mx-auto" />
            <p className="text-xs text-slate-400 font-mono">Loading TwinMind Pairing Client...</p>
          </div>
        </div>
      }
    >
      <MobilePairingClient initialCode={initialCode} />
    </Suspense>
  );
}

