"use client";

import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import QRCode from "qrcode";
import { useDevice } from "../../context/DeviceContext";
import { useTrust } from "../../context/TrustContext";
import { GuestPrivacyShield } from "../trust/GuestPrivacyShield";
import { QrScannerModal } from "./QrScannerModal";
import {
  DeviceRecord,
  DeviceType,
  DevicePermission,
  DeviceCommandType,
  ALLOWED_DEVICE_COMMANDS,
  DevicePairingSession,
} from "../../types/device";
import { fetchNetworkInfoApi } from "../../lib/api";

const DEVICE_TYPE_ICONS: Record<DeviceType, string> = {
  LAPTOP: "💻",
  DESKTOP: "🖥️",
  PHONE: "📱",
  TABLET: "📟",
  SMARTWATCH: "⌚",
  SMART_GLASSES: "👓",
  SMART_HOME: "🏠",
};

export function DeviceManager() {
  const { mode: trustMode } = useTrust();
  const isGuest = trustMode === "GUEST";

  const {
    devices,
    currentDevice,
    crossDeviceState,
    recentCommands,
    loading,
    error,
    incomingNotification,
    incomingPairingRequest,
    clearNotification,
    clearIncomingPairingRequest,
    refreshDevices,
    updateDevice,
    revokeDevice,
    routeCommand,
    simulateDevice,
    initiatePairing,
    joinPairing,
    getPairingStatus,
    approvePairing,
    rejectPairing,
    disconnectDevice,
    unpairDevice,
    forgetDevice,
    deleteDevice,
    pingDevice,
  } = useDevice();

  // Command modal state
  const [commandModalOpen, setCommandModalOpen] = useState(false);
  const [targetDeviceId, setTargetDeviceId] = useState<string>("");
  const [selectedCommand, setSelectedCommand] = useState<DeviceCommandType>("SHOW_NOTIFICATION");
  const [commandPayload, setCommandPayload] = useState({
    title: "TwinMind Alert",
    message: "Meeting in 10 minutes",
    view: "chat",
  });
  const [commandSending, setCommandSending] = useState(false);
  const [commandSuccess, setCommandSuccess] = useState<string | null>(null);
  const [commandError, setCommandError] = useState<string | null>(null);

  // Pairing modal state
  const [pairingModalOpen, setPairingModalOpen] = useState(false);
  const [pairingTab, setPairingTab] = useState<"LOCAL_WIFI" | "BLUETOOTH" | "CLAIM">("LOCAL_WIFI");
  const [pairingSession, setPairingSession] = useState<DevicePairingSession | null>(null);
  const [pairingLoading, setPairingLoading] = useState(false);
  const [pairingError, setPairingError] = useState<string | null>(null);
  const [claimCode, setClaimCode] = useState("");
  const [claimDeviceLabel, setClaimDeviceLabel] = useState("");
  const [claimLoading, setClaimLoading] = useState(false);
  const [claimSuccess, setClaimSuccess] = useState<string | null>(null);
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);

  // Bluetooth scan state inside pairing modal
  const [btScanError, setBtScanError] = useState<string | null>(null);
  const [btScanning, setBtScanning] = useState(false);
  const [btFoundDevice, setBtFoundDevice] = useState<string | null>(null);

  // Real LAN Network Info (IP, pairingUrl)
  const [networkInfo, setNetworkInfo] = useState<{
    ip: string;
    interfaceName: string;
    frontendUrl: string;
    backendUrl: string;
    pairingUrl: string;
  } | null>(null);

  // Diagnostic Test Ping state
  const [pingResult, setPingResult] = useState<{
    pong: boolean;
    latencyMs: number;
    timestamp: number;
    deviceId: string;
    deviceLabel: string;
    transport: string;
  } | null>(null);
  const [pingLoading, setPingLoading] = useState(false);

  // Real Camera Scanner modal state
  const [cameraScannerOpen, setCameraScannerOpen] = useState(false);

  // Candidate waiting-for-approval state
  const [candidateJoinStatus, setCandidateJoinStatus] = useState<
    "IDLE" | "WAITING_APPROVAL" | "APPROVED" | "REJECTED"
  >("IDLE");
  const [candidateSessionId, setCandidateSessionId] = useState<string | null>(null);

  // Web Bluetooth capability check state
  const [bluetoothStatus, setBluetoothStatus] = useState<string | null>(null);
  const [bluetoothChecking, setBluetoothChecking] = useState(false);

  // Rename state
  const [editingDeviceId, setEditingDeviceId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState("");

  // Detailed Manage Device modal state
  const [manageTarget, setManageTarget] = useState<DeviceRecord | null>(null);
  const [savingPermission, setSavingPermission] = useState<string | null>(null);

  const handleTogglePermission = async (permKey: DevicePermission) => {
    if (!manageTarget) return;
    const currentPermissions = manageTarget.permissions || [];
    const hasPerm = currentPermissions.includes(permKey);
    const nextPermissions = hasPerm
      ? currentPermissions.filter((p) => p !== permKey)
      : [...currentPermissions, permKey];

    setSavingPermission(permKey);
    const prevTarget = manageTarget;
    setManageTarget({ ...manageTarget, permissions: nextPermissions });

    try {
      await updateDevice(manageTarget.id, { permissions: nextPermissions });
    } catch (err) {
      console.error("Failed to update permissions:", err);
      setManageTarget(prevTarget);
    } finally {
      setSavingPermission(null);
    }
  };

  // Action confirmation modal state (DISCONNECT, UNPAIR, REVOKE, FORGET, DELETE)
  const [actionTarget, setActionTarget] = useState<{
    device: DeviceRecord;
    action: "DISCONNECT" | "UNPAIR" | "REVOKE" | "FORGET" | "DELETE";
  } | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  // Simulator state & Hub feedback
  const [simulatorLoading, setSimulatorLoading] = useState(false);
  const [hubNotification, setHubNotification] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  // Fetch host LAN network info whenever pairing modal opens
  useEffect(() => {
    fetchNetworkInfoApi()
      .then((info) => setNetworkInfo(info))
      .catch(() => {});
  }, [pairingModalOpen]);

  // Auto-dismiss hub notifications
  useEffect(() => {
    if (!hubNotification) return;
    const timer = setTimeout(() => setHubNotification(null), 4000);
    return () => clearTimeout(timer);
  }, [hubNotification]);

  // Generate dynamic QR Code data URL encoding the web pairing link
  useEffect(() => {
    if (!pairingSession) {
      setQrDataUrl(null);
      return;
    }

    // Determine target URL for phone browser
    let targetUrl = pairingSession.pairingUrl;
    if (!targetUrl && pairingSession.qrPayload) {
      try {
        const parsed = JSON.parse(pairingSession.qrPayload);
        if (parsed.pairingUrl) targetUrl = parsed.pairingUrl;
      } catch {}
    }
    if (!targetUrl && networkInfo?.frontendUrl) {
      targetUrl = `${networkInfo.frontendUrl}/pair?code=${pairingSession.pairingCode}`;
    }
    if (!targetUrl) {
      targetUrl = `http://localhost:3000/pair?code=${pairingSession.pairingCode}`;
    }

    QRCode.toDataURL(targetUrl, {
      width: 220,
      margin: 1,
      color: {
        dark: "#06b6d4",
        light: "#020617",
      },
    })
      .then((url) => setQrDataUrl(url))
      .catch((err) => {
        console.error("QR Code generation error:", err);
        setQrDataUrl(null);
      });
  }, [pairingSession, networkInfo]);

  // Poll pairing status when candidate is waiting for host approval
  useEffect(() => {
    if (candidateJoinStatus !== "WAITING_APPROVAL" || !candidateSessionId) return;

    const interval = setInterval(async () => {
      try {
        const session = await getPairingStatus(candidateSessionId);
        if (session.status === "APPROVED") {
          setCandidateJoinStatus("APPROVED");
          setClaimSuccess("Pairing approved by Owner! Connecting device...");
          setTimeout(() => {
            setPairingModalOpen(false);
            setCandidateJoinStatus("IDLE");
            setCandidateSessionId(null);
            setClaimCode("");
          }, 2000);
        } else if (session.status === "REJECTED") {
          setCandidateJoinStatus("REJECTED");
          setPairingError("Pairing request was rejected by the Owner.");
        }
      } catch {
        // Retry next tick
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [candidateJoinStatus, candidateSessionId, getPairingStatus]);

  // If in Guest Mode, strictly block access to protect user's device infrastructure
  if (isGuest) {
    return (
      <div className="w-full max-w-5xl mx-auto py-6">
        <GuestPrivacyShield
          title="TwinDevices™ — Cross-Device AI OS"
          description="Cross-device intelligence, connected hardware lists, and remote command routing are restricted in Guest Mode. Biometric owner verification is required to manage devices."
          icon="📱"
        />
      </div>
    );
  }

  const onlineDevicesCount = devices.filter((d) => d.presence === "ONLINE").length;
  const trustedDevicesCount = devices.filter(
    (d) => d.isTrusted && d.status !== "REVOKED" && d.status !== "UNPAIRED",
  ).length;

  // Eligible targets for command routing (strictly secondary devices that are online)
  const eligibleTargets = devices.filter(
    (d) =>
      d.id !== currentDevice?.id &&
      d.presence === "ONLINE" &&
      d.status !== "REVOKED" &&
      d.status !== "UNPAIRED",
  );

  const handleOpenCommandModal = (targetId?: string) => {
    const defaultTarget = targetId || eligibleTargets[0]?.id || "";
    setTargetDeviceId(defaultTarget);
    setCommandSuccess(null);
    setCommandError(null);
    setCommandModalOpen(true);
  };

  const handleSendCommand = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentDevice) {
      setCommandError("Current device not registered.");
      return;
    }
    if (!targetDeviceId) {
      setCommandError("Please select a target device.");
      return;
    }

    setCommandSending(true);
    setCommandError(null);
    setCommandSuccess(null);

    try {
      const requestId = `req_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      let payload: Record<string, unknown> = {};

      if (selectedCommand === "SHOW_NOTIFICATION") {
        payload = { title: commandPayload.title, message: commandPayload.message };
      } else if (selectedCommand === "OPEN_SUPPORTED_VIEW") {
        payload = { view: commandPayload.view };
      }

      const result = await routeCommand({
        requestId,
        sourceDeviceId: currentDevice.id,
        targetDeviceId,
        commandType: selectedCommand,
        payload,
      });

      setCommandSuccess(`Command dispatched! State: ${result.state}`);
      setTimeout(() => {
        setCommandModalOpen(false);
        setCommandSuccess(null);
      }, 1500);
    } catch (err: unknown) {
      setCommandError((err as Error).message || "Failed to dispatch command.");
    } finally {
      setCommandSending(false);
    }
  };

  const handleSpawnSimulator = async (type: DeviceType, label: string) => {
    try {
      setSimulatorLoading(true);
      const simulated = await simulateDevice(type, label);
      setHubNotification({
        type: "success",
        message: `Virtual ${type} (${simulated.label}) connected to topology.`,
      });
    } catch (err: unknown) {
      setHubNotification({
        type: "error",
        message: (err as Error).message || "Failed to spawn simulator device",
      });
    } finally {
      setSimulatorLoading(false);
    }
  };

  const handleSaveRename = async (id: string) => {
    if (!editLabel.trim()) return;
    try {
      await updateDevice(id, { label: editLabel });
      setEditingDeviceId(null);
      setHubNotification({
        type: "success",
        message: "Device renamed successfully.",
      });
    } catch (err: unknown) {
      setHubNotification({
        type: "error",
        message: (err as Error).message || "Failed to rename device",
      });
    }
  };

  const handleOpenPairingModal = async () => {
    setPairingModalOpen(true);
    setPairingTab("LOCAL_WIFI");
    setPairingError(null);
    setClaimSuccess(null);
    setCopiedCode(false);
    setCandidateJoinStatus("IDLE");
    setCandidateSessionId(null);
    setBtScanError(null);
    setBtFoundDevice(null);

    // Auto-generate pairing PIN on opening
    try {
      setPairingLoading(true);
      const session = await initiatePairing();
      setPairingSession(session);
    } catch (err: unknown) {
      setPairingError((err as Error).message || "Failed to initiate pairing PIN");
    } finally {
      setPairingLoading(false);
    }
  };

  const handleRefreshPairingCode = async () => {
    try {
      setPairingLoading(true);
      setPairingError(null);
      setCopiedCode(false);
      const session = await initiatePairing();
      setPairingSession(session);
    } catch (err: unknown) {
      setPairingError((err as Error).message || "Failed to refresh pairing PIN");
    } finally {
      setPairingLoading(false);
    }
  };

  const handleCopyPairingCode = () => {
    if (!pairingSession) return;
    navigator.clipboard.writeText(pairingSession.pairingCode);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  // Real candidate pairing submission
  const handleJoinPairing = async (e?: React.FormEvent, codeOverride?: string) => {
    if (e) e.preventDefault();
    const code = (codeOverride || claimCode).trim();
    if (!code) {
      setPairingError("Please enter a 6-digit pairing code.");
      return;
    }
    setClaimLoading(true);
    setPairingError(null);
    setCandidateJoinStatus("WAITING_APPROVAL");

    try {
      const res = await joinPairing({
        pairingCode: code,
        candidateDevice: {
          label: claimDeviceLabel.trim() || undefined,
        },
      });
      setCandidateSessionId(res.sessionId);
    } catch (err: unknown) {
      setCandidateJoinStatus("IDLE");
      setPairingError((err as Error).message || "Pairing join failed. Check PIN and retry.");
    } finally {
      setClaimLoading(false);
    }
  };

  // Real Web Bluetooth capability check
  const handleCheckBluetooth = async () => {
    setBluetoothChecking(true);
    setBluetoothStatus(null);

    if (typeof navigator === "undefined" || !("bluetooth" in navigator)) {
      setBluetoothChecking(false);
      setBluetoothStatus(
        "Web Bluetooth API is not supported in this browser. TwinMind uses secure local network & encrypted SSE pairing.",
      );
      return;
    }

    try {
      // Prompt honest user gesture request device dialog
      // @ts-expect-error Web Bluetooth API
      const device = await navigator.bluetooth.requestDevice({
        acceptAllDevices: true,
      });
      setBluetoothStatus(
        `Bluetooth device detected: ${device.name || "Unnamed Device"}. Complete pairing by scanning the QR code or entering the 6-digit PIN.`,
      );
    } catch (err: unknown) {
      const msg = (err as Error).message || "Bluetooth scan cancelled or unavailable.";
      setBluetoothStatus(`Bluetooth scan note: ${msg} Standard QR/PIN pairing remains active.`);
    } finally {
      setBluetoothChecking(false);
    }
  };

  // Web Bluetooth Scan for pairing tab with non-blocking fallback
  const handleScanBluetooth = async () => {
    setBtScanning(true);
    setBtScanError(null);
    setBtFoundDevice(null);

    if (typeof navigator === "undefined" || !("bluetooth" in navigator)) {
      setBtScanning(false);
      setBtScanError(
        "Bluetooth discovery is unavailable for this device/browser. Use Local Wi-Fi Pairing instead."
      );
      return;
    }

    try {
      // @ts-expect-error Web Bluetooth API
      const device = await navigator.bluetooth.requestDevice({
        acceptAllDevices: true,
      });
      setBtFoundDevice(device.name || "Bluetooth Peripheral");
    } catch {
      setBtScanError(
        "Bluetooth discovery is unavailable for this device/browser. Use Local Wi-Fi Pairing instead."
      );
    } finally {
      setBtScanning(false);
    }
  };

  // Lifecycle confirmation executor
  const handleConfirmAction = async () => {
    if (!actionTarget) return;
    setActionLoading(true);
    try {
      const { device, action } = actionTarget;
      if (action === "DISCONNECT") {
        await disconnectDevice(device.id);
        setHubNotification({
          type: "success",
          message: `Device '${device.label}' disconnected (status: OFFLINE).`,
        });
      } else if (action === "UNPAIR") {
        await unpairDevice(device.id);
        setHubNotification({
          type: "success",
          message: `Device '${device.label}' unpaired. Tokens invalidated.`,
        });
      } else if (action === "REVOKE") {
        await revokeDevice(device.id);
        setHubNotification({
          type: "success",
          message: `Access revoked for '${device.label}' (status: REVOKED).`,
        });
      } else if (action === "FORGET") {
        await forgetDevice(device.id);
        setHubNotification({
          type: "success",
          message: `Device '${device.label}' forgotten. Credentials completely revoked.`,
        });
      } else if (action === "DELETE") {
        await deleteDevice(device.id);
        setHubNotification({
          type: "success",
          message: `Device '${device.label}' permanently removed.`,
        });
      }
      setActionTarget(null);
      setManageTarget(null);
    } catch (err: unknown) {
      setHubNotification({
        type: "error",
        message: (err as Error).message || "Device management action failed.",
      });
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="w-full max-w-6xl mx-auto space-y-8 pb-12">
      {/* Real Camera QR Scanner Modal */}
      <QrScannerModal
        isOpen={cameraScannerOpen}
        onClose={() => setCameraScannerOpen(false)}
        onScanSuccess={({ pairingCode }) => {
          setCameraScannerOpen(false);
          setClaimCode(pairingCode);
          handleJoinPairing(undefined, pairingCode);
        }}
      />

      {/* Floating Cross-Device Incoming Notification Toast */}
      <AnimatePresence>
        {incomingNotification && (
          <motion.div
            initial={{ opacity: 0, y: -20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.95 }}
            className="fixed top-4 right-4 z-50 max-w-md w-full p-4 rounded-xl border border-cyan-500/40 bg-surface-2/95 backdrop-blur-md shadow-2xl shadow-cyan-950/50 flex items-start gap-3.5 text-text-primary"
          >
            <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-cyan-500/20 text-accent-cyan text-xl border border-cyan-500/30">
              🔔
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <h4 className="text-sm font-semibold text-accent-cyan truncate">
                  {incomingNotification.title}
                </h4>
                <span className="text-[10px] text-text-muted">Just now</span>
              </div>
              <p className="text-xs text-text-secondary mt-0.5 leading-relaxed break-words">
                {incomingNotification.message}
              </p>
            </div>
            <button
              onClick={clearNotification}
              className="text-text-muted hover:text-text-primary text-xs p-1 rounded hover:bg-surface-3 transition"
            >
              ✕
            </button>
          </motion.div>
        )}
      </AnimatePresence>
      {/* Hub Status Feedback Toast */}
      <AnimatePresence>
        {hubNotification && (
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 15 }}
            className={`fixed bottom-6 right-6 z-50 max-w-sm w-full p-3.5 rounded-xl border shadow-xl backdrop-blur-md flex items-center justify-between gap-3 text-xs ${
              hubNotification.type === "success"
                ? "border-emerald-500/40 bg-emerald-950/90 text-emerald-300"
                : "border-rose-500/40 bg-rose-950/90 text-rose-300"
            }`}
          >
            <div className="flex items-center gap-2 min-w-0">
              <span>{hubNotification.type === "success" ? "✓" : "⚠️"}</span>
              <span className="truncate">{hubNotification.message}</span>
            </div>
            <button
              onClick={() => setHubNotification(null)}
              className="text-xs opacity-75 hover:opacity-100"
            >
              ✕
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Hero Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border-subtle pb-6">
        <div>
          <div className="flex items-center gap-2.5">
            <span className="flex size-9 items-center justify-center rounded-xl border border-cyan-400/30 bg-cyan-400/10 text-accent-cyan font-bold text-lg">
              📱
            </span>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-text-primary">
              TwinDevices™ — Cross-Device AI OS
            </h1>
          </div>
          <p className="mt-1.5 text-sm text-text-muted max-w-2xl">
            Unified personal AI operating system layer across all your hardware. Realtime presence, allowlisted command routing, genuine QR camera pairing, and zero OS modifications.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={() => handleOpenPairingModal()}
            className="px-3.5 py-2 rounded-xl text-xs font-semibold border border-cyan-500/40 bg-cyan-500/10 text-accent-cyan hover:bg-cyan-500/20 transition shadow-sm flex items-center gap-1.5"
          >
            <span>🔗</span> Pair Device
          </button>
          <button
            onClick={() => handleOpenCommandModal()}
            className="px-3.5 py-2 rounded-xl text-xs font-semibold bg-accent-cyan text-surface-0 hover:bg-accent-cyan/90 transition shadow-sm shadow-cyan-500/20 flex items-center gap-1.5"
          >
            <span>⚡</span> Route Command
          </button>
          <button
            onClick={() => refreshDevices()}
            disabled={loading}
            className="px-3 py-2 rounded-xl text-xs font-medium border border-border-subtle bg-surface-2 text-text-secondary hover:text-text-primary hover:bg-surface-3 transition"
          >
            {loading ? "Refreshing..." : "↻ Refresh"}
          </button>
        </div>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
        <div className="p-4 rounded-xl border border-border-subtle bg-surface-2/60 backdrop-blur-sm">
          <div className="text-xs font-medium text-text-muted">Total Devices</div>
          <div className="text-2xl font-bold text-text-primary mt-1">{devices.length}</div>
          <div className="text-[11px] text-text-muted mt-0.5">Registered in topology</div>
        </div>

        <div className="p-4 rounded-xl border border-emerald-500/30 bg-emerald-500/5 backdrop-blur-sm">
          <div className="text-xs font-medium text-emerald-400 flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-emerald-400 animate-pulse" />
            Online Now
          </div>
          <div className="text-2xl font-bold text-emerald-300 mt-1">{onlineDevicesCount}</div>
          <div className="text-[11px] text-emerald-400/70 mt-0.5">Application heartbeats</div>
        </div>

        <div className="p-4 rounded-xl border border-border-subtle bg-surface-2/60 backdrop-blur-sm">
          <div className="text-xs font-medium text-text-muted">Trusted Hardware</div>
          <div className="text-2xl font-bold text-text-primary mt-1">{trustedDevicesCount}</div>
          <div className="text-[11px] text-text-muted mt-0.5">Owner authorized</div>
        </div>

        <div className="p-4 rounded-xl border border-border-subtle bg-surface-2/60 backdrop-blur-sm">
          <div className="text-xs font-medium text-text-muted">Active View</div>
          <div className="text-2xl font-bold text-accent-cyan mt-1 capitalize">
            {crossDeviceState?.activeView || "Chat"}
          </div>
          <div className="text-[11px] text-text-muted mt-0.5">Synchronized context</div>
        </div>
      </div>

      {/* Development Device Simulator Hub & Bluetooth Section */}
      <div className="p-5 rounded-2xl border border-border-subtle bg-surface-2/50 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold text-text-primary flex items-center gap-2">
              <span>🧪</span> Development Device Simulator
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-cyan-500/15 border border-cyan-500/30 text-accent-cyan font-mono">
                Localhost Sandbox
              </span>
            </h3>
            <p className="text-xs text-text-muted mt-0.5">
              Simulate secondary devices on localhost to test cross-device notifications and handoff without modifying OS hardware or settings.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => handleSpawnSimulator("PHONE", "Simulated Galaxy Phone")}
              disabled={simulatorLoading}
              className="px-2.5 py-1.5 rounded-lg text-xs font-medium border border-border-subtle bg-surface-3 hover:bg-surface-4 text-text-primary transition flex items-center gap-1.5 disabled:opacity-50"
            >
              <span>📱</span> + Sim Phone
            </button>
            <button
              onClick={() => handleSpawnSimulator("TABLET", "Simulated iPad Pro")}
              disabled={simulatorLoading}
              className="px-2.5 py-1.5 rounded-lg text-xs font-medium border border-border-subtle bg-surface-3 hover:bg-surface-4 text-text-primary transition flex items-center gap-1.5 disabled:opacity-50"
            >
              <span>📟</span> + Sim Tablet
            </button>
            <button
              onClick={() => handleSpawnSimulator("DESKTOP", "Simulated Mac Studio")}
              disabled={simulatorLoading}
              className="px-2.5 py-1.5 rounded-lg text-xs font-medium border border-border-subtle bg-surface-3 hover:bg-surface-4 text-text-primary transition flex items-center gap-1.5 disabled:opacity-50"
            >
              <span>🖥️</span> + Sim Desktop
            </button>
          </div>
        </div>

        {/* Real Web Bluetooth Capability Section */}
        <div className="pt-3 border-t border-border-subtle flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2">
            <span className="text-base">📶</span>
            <div>
              <span className="font-semibold text-text-primary">Web Bluetooth Capability</span>
              <p className="text-[11px] text-text-muted">
                Honest browser API inspection. Zero driver installation or OS modifications.
              </p>
            </div>
          </div>

          <button
            onClick={handleCheckBluetooth}
            disabled={bluetoothChecking}
            className="px-3 py-1.5 rounded-lg text-xs font-medium border border-border-subtle bg-surface-3 hover:bg-surface-4 text-text-primary transition flex items-center gap-1.5 shrink-0"
          >
            <span>🔍</span> {bluetoothChecking ? "Checking..." : "Inspect Web Bluetooth"}
          </button>
        </div>

        {bluetoothStatus && (
          <div className="p-3 rounded-xl bg-surface-3/80 border border-border-subtle text-xs text-text-secondary flex items-start gap-2">
            <span className="text-cyan-400 mt-0.5">ℹ️</span>
            <span className="flex-1">{bluetoothStatus}</span>
          </div>
        )}
      </div>

      {/* Registered Devices Grid */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-text-primary flex items-center gap-2">
            <span>Hardware Topology</span>
            <span className="text-xs font-normal text-text-muted">
              ({devices.length} registered)
            </span>
          </h2>
          <span className="text-xs text-text-muted">
            Auto-refreshed via SSE
          </span>
        </div>

        {devices.length === 0 ? (
          <div className="p-8 text-center rounded-2xl border border-dashed border-border-subtle bg-surface-2/30 space-y-2">
            <div className="text-3xl">💻</div>
            <p className="text-sm font-medium text-text-primary">No devices registered</p>
            <p className="text-xs text-text-muted max-w-sm mx-auto">
              This browser will automatically register as your primary host, or you can pair secondary devices using the buttons above.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {devices.map((device) => {
              const isCurrent = device.id === currentDevice?.id;
              const isOnline = device.presence === "ONLINE";
              const isRevoked = device.status === "REVOKED";
              const isUnpaired = device.status === "UNPAIRED";

              return (
                <div
                  key={device.id}
                  className={`p-4 rounded-2xl border transition relative flex flex-col justify-between ${
                    isRevoked
                      ? "border-rose-500/20 bg-rose-500/5 opacity-60"
                      : isUnpaired
                      ? "border-amber-500/20 bg-amber-500/5 opacity-75"
                      : isCurrent
                      ? "border-accent-cyan/40 bg-surface-2/90 shadow-lg shadow-cyan-950/20"
                      : "border-border-subtle bg-surface-2/60 hover:border-border-strong"
                  }`}
                >
                  <div className="space-y-3">
                    {/* Top Row: Icon, Label, Badges */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-surface-3 text-xl border border-border-subtle">
                          {DEVICE_TYPE_ICONS[device.type] || "💻"}
                        </span>
                        <div className="min-w-0">
                          {editingDeviceId === device.id ? (
                            <div className="flex items-center gap-1.5">
                              <input
                                type="text"
                                value={editLabel}
                                onChange={(e) => setEditLabel(e.target.value)}
                                className="px-2 py-0.5 rounded text-xs bg-surface-1 border border-border-strong text-text-primary w-28"
                                autoFocus
                              />
                              <button
                                onClick={() => handleSaveRename(device.id)}
                                className="text-[10px] text-accent-cyan hover:underline"
                              >
                                Save
                              </button>
                              <button
                                onClick={() => setEditingDeviceId(null)}
                                className="text-[10px] text-text-muted hover:underline"
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1.5">
                              <h3 className="text-sm font-semibold text-text-primary truncate">
                                {device.label}
                              </h3>
                              <button
                                onClick={() => {
                                  setEditingDeviceId(device.id);
                                  setEditLabel(device.label);
                                }}
                                className="text-text-muted hover:text-text-primary text-[11px]"
                                title="Rename device"
                              >
                                ✎
                              </button>
                            </div>
                          )}

                          <div className="text-[11px] text-text-muted truncate">
                            {device.platformInfo?.os || device.type} • {device.platformInfo?.browser || "TwinMind OS"}
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-col items-end gap-1 shrink-0">
                        <span
                          className={`text-[10px] font-medium px-2 py-0.5 rounded-full flex items-center gap-1 border ${
                            isRevoked
                              ? "bg-rose-500/10 border-rose-500/30 text-rose-400"
                              : isUnpaired
                              ? "bg-amber-500/10 border-amber-500/30 text-amber-400"
                              : isOnline
                              ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
                              : "bg-surface-3 border-border-subtle text-text-muted"
                          }`}
                        >
                          <span
                            className={`size-1.5 rounded-full ${
                              isRevoked
                                ? "bg-rose-400"
                                : isUnpaired
                                ? "bg-amber-400"
                                : isOnline
                                ? "bg-emerald-400 animate-pulse"
                                : "bg-zinc-500"
                            }`}
                          />
                          {isRevoked
                            ? "REVOKED"
                            : isUnpaired
                            ? "UNPAIRED"
                            : isOnline
                            ? "ONLINE"
                            : "OFFLINE"}
                        </span>

                        {isCurrent && (
                          <span className="text-[9px] px-1.5 py-0.5 rounded bg-cyan-500/20 text-accent-cyan border border-cyan-500/30 font-semibold">
                            THIS HOST
                          </span>
                        )}
                        {device.isSimulator ? (
                          <span className="text-[9px] px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-500/30 font-semibold">
                            SIMULATOR
                          </span>
                        ) : (
                          <span className="text-[9px] px-1.5 py-0.5 rounded bg-cyan-950/40 text-cyan-300 border border-cyan-500/30 font-semibold">
                            REAL HARDWARE
                          </span>
                        )}
                        {device.isTrusted && !isRevoked && !isUnpaired && (
                          <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 font-semibold">
                            TRUSTED
                          </span>
                        )}
                        {device.connectionMethod && (
                          <span className="text-[9px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700 font-mono">
                            {device.connectionMethod}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Capabilities Tags */}
                    <div className="space-y-1.5">
                      <div className="text-[10px] font-semibold text-text-muted tracking-wider uppercase">
                        Capabilities & Permissions
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {device.capabilities.slice(0, 5).map((cap) => (
                          <span
                            key={cap}
                            className="text-[9px] px-1.5 py-0.5 rounded bg-surface-3 text-text-secondary border border-border-subtle"
                          >
                            {cap.toLowerCase()}
                          </span>
                        ))}
                        {device.capabilities.length > 5 && (
                          <span className="text-[9px] px-1.5 py-0.5 rounded bg-surface-3 text-text-muted border border-border-subtle">
                            +{device.capabilities.length - 5}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Actions Footer */}
                  <div className="mt-4 pt-3 border-t border-border-subtle flex items-center justify-between gap-2">
                    <span className="text-[10px] text-text-muted">
                      Last seen:{" "}
                      {new Date(device.lastSeenAt).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>

                    <div className="flex items-center gap-1.5">
                      {!isRevoked && !isUnpaired && !isCurrent && isOnline && (
                        <button
                          onClick={() => handleOpenCommandModal(device.id)}
                          className="px-2 py-1 rounded-lg text-[11px] font-medium bg-surface-3 hover:bg-surface-4 text-accent-cyan border border-border-subtle transition flex items-center gap-1"
                        >
                          <span>⚡</span> Command
                        </button>
                      )}

                      {!isRevoked && !isUnpaired && (
                        <button
                          type="button"
                          onClick={async () => {
                            try {
                              const res = await pingDevice(device.id);
                              setHubNotification({
                                type: "success",
                                message: `Pong from ${device.label}! Round-trip latency: ${res.latencyMs}ms (${res.transport})`,
                              });
                            } catch (err: unknown) {
                              const error = err as Error;
                              setHubNotification({
                                type: "error",
                                message: `Ping failed: ${error.message}`,
                              });
                            }
                          }}
                          className="px-2 py-1 rounded-lg text-[11px] font-medium bg-cyan-500/10 hover:bg-cyan-500/20 text-accent-cyan border border-cyan-500/30 transition flex items-center gap-1"
                          title="Measure real-time local network latency"
                        >
                          <span>📡</span> Ping
                        </button>
                      )}

                      {/* Manage Button */}
                      <button
                        onClick={() => setManageTarget(device)}
                        className="px-2.5 py-1 rounded-lg text-[11px] font-medium border border-border-subtle bg-surface-3 hover:bg-surface-4 text-text-secondary hover:text-text-primary transition"
                      >
                        Manage
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Command Activity Log */}
      {recentCommands.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-text-primary flex items-center gap-2">
            <span>Recent Cross-Device Commands</span>
            <span className="text-xs text-text-muted">({recentCommands.length})</span>
          </h3>

          <div className="border border-border-subtle rounded-2xl bg-surface-2/40 overflow-hidden divide-y divide-border-subtle">
            {recentCommands.slice(0, 5).map((cmd) => (
              <div key={cmd.id} className="p-3 sm:px-4 flex items-center justify-between gap-3 text-xs">
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className="size-2 rounded-full bg-cyan-400 shrink-0" />
                  <div className="min-w-0">
                    <div className="font-semibold text-text-primary truncate">
                      {cmd.commandType}
                    </div>
                    <div className="text-[11px] text-text-muted truncate">
                      Target: {devices.find((d) => d.id === cmd.targetDeviceId)?.label || cmd.targetDeviceId}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3 shrink-0">
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-medium border ${
                      cmd.state === "COMPLETED" || cmd.state === "ACKNOWLEDGED"
                        ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
                        : cmd.state === "FAILED"
                        ? "bg-rose-500/10 border-rose-500/30 text-rose-400"
                        : cmd.state === "ROUTING" || cmd.state === "QUEUED"
                        ? "bg-amber-500/10 border-amber-500/30 text-amber-400"
                        : "bg-surface-3 border-border-subtle text-text-muted"
                    }`}
                  >
                    {cmd.state}
                  </span>
                  <span className="text-[10px] text-text-muted hidden sm:inline">
                    {new Date(cmd.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Allowlisted Command Routing Modal */}
      <AnimatePresence>
        {commandModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-lg rounded-2xl border border-border-strong bg-surface-1 p-6 shadow-2xl space-y-5 max-h-[85dvh] sm:max-h-[90dvh] overflow-y-auto"
            >
              <div className="flex items-center justify-between border-b border-border-subtle pb-4">
                <div className="flex items-center gap-2">
                  <span className="text-xl">⚡</span>
                  <h3 className="text-lg font-bold text-text-primary">
                    Route Cross-Device Command
                  </h3>
                </div>
                <button
                  onClick={() => setCommandModalOpen(false)}
                  className="text-text-muted hover:text-text-primary text-sm p-1"
                >
                  ✕
                </button>
              </div>

              <form onSubmit={handleSendCommand} className="space-y-4">
                {/* Target Device Selector */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-text-secondary">
                    Target Device
                  </label>
                  {eligibleTargets.length === 0 ? (
                    <div className="p-3 rounded-xl border border-amber-500/30 bg-amber-500/10 text-xs text-amber-300">
                      No secondary devices are currently online. Launch a virtual Phone, Tablet, or Desktop above, or pair a real device first.
                    </div>
                  ) : (
                    <select
                      value={targetDeviceId}
                      onChange={(e) => setTargetDeviceId(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl bg-surface-2 border border-border-subtle text-sm text-text-primary focus:outline-none focus:border-accent-cyan"
                      required
                    >
                      {eligibleTargets.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.label} ({d.type}) — {d.presence}
                        </option>
                      ))}
                    </select>
                  )}
                </div>

                {/* Command Selector */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-text-secondary">
                    Allowlisted Command Type
                  </label>
                  <select
                    value={selectedCommand}
                    onChange={(e) => setSelectedCommand(e.target.value as DeviceCommandType)}
                    className="w-full px-3 py-2 rounded-xl bg-surface-2 border border-border-subtle text-sm text-text-primary focus:outline-none focus:border-accent-cyan"
                  >
                    {ALLOWED_DEVICE_COMMANDS.map((cmd) => (
                      <option key={cmd} value={cmd}>
                        {cmd}
                      </option>
                    ))}
                  </select>
                  <p className="text-[11px] text-text-muted">
                    Only verified TwinMind OS commands are permitted. Generic shell commands are strictly blocked.
                  </p>
                </div>

                {/* Command Payload Options */}
                {selectedCommand === "SHOW_NOTIFICATION" && (
                  <div className="space-y-3 p-3 rounded-xl bg-surface-2/60 border border-border-subtle">
                    <div className="space-y-1">
                      <label className="text-[11px] font-semibold text-text-muted">
                        Notification Title
                      </label>
                      <input
                        type="text"
                        value={commandPayload.title}
                        onChange={(e) => setCommandPayload({ ...commandPayload, title: e.target.value })}
                        className="w-full px-2.5 py-1.5 rounded-lg bg-surface-1 border border-border-subtle text-xs text-text-primary"
                        placeholder="Alert title"
                        required
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[11px] font-semibold text-text-muted">
                        Notification Message
                      </label>
                      <input
                        type="text"
                        value={commandPayload.message}
                        onChange={(e) => setCommandPayload({ ...commandPayload, message: e.target.value })}
                        className="w-full px-2.5 py-1.5 rounded-lg bg-surface-1 border border-border-subtle text-xs text-text-primary"
                        placeholder="Message body"
                        required
                      />
                    </div>
                  </div>
                )}

                {selectedCommand === "OPEN_SUPPORTED_VIEW" && (
                  <div className="space-y-2 p-3 rounded-xl bg-surface-2/60 border border-border-subtle">
                    <label className="text-[11px] font-semibold text-text-muted">
                      Target Workspace Tab
                    </label>
                    <select
                      value={commandPayload.view}
                      onChange={(e) => setCommandPayload({ ...commandPayload, view: e.target.value })}
                      className="w-full px-2.5 py-1.5 rounded-lg bg-surface-1 border border-border-subtle text-xs text-text-primary"
                    >
                      <option value="chat">Chat (TwinCore)</option>
                      <option value="memory">TwinMemory™</option>
                      <option value="search">TwinSearch™</option>
                      <option value="graph">TwinGraph™</option>
                      <option value="agents">TwinAgents™</option>
                    </select>
                  </div>
                )}

                {/* Feedback */}
                {commandSuccess && (
                  <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs flex items-center gap-2">
                    <span>✓</span> {commandSuccess}
                  </div>
                )}
                {commandError && (
                  <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs flex items-center gap-2">
                    <span>⚠️</span> {commandError}
                  </div>
                )}

                <div className="flex items-center justify-end gap-2.5 pt-2">
                  <button
                    type="button"
                    onClick={() => setCommandModalOpen(false)}
                    className="px-4 py-2 rounded-xl text-xs font-medium text-text-muted hover:text-text-primary"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={commandSending || eligibleTargets.length === 0}
                    className="px-4 py-2 rounded-xl text-xs font-semibold bg-accent-cyan text-surface-0 hover:bg-accent-cyan/90 transition disabled:opacity-40"
                  >
                    {commandSending ? "Routing..." : "Dispatch Command"}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Hardware Pairing Modal (Host QR + Candidate PIN + Camera Scan) */}
      <AnimatePresence>
        {pairingModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-md rounded-2xl border border-border-strong bg-surface-1 p-6 shadow-2xl space-y-5 max-h-[85dvh] sm:max-h-[90dvh] overflow-y-auto"
            >
              <div className="flex items-center justify-between border-b border-border-subtle pb-4">
                <div className="flex items-center gap-2">
                  <span className="text-xl">🔗</span>
                  <h3 className="text-lg font-bold text-text-primary">
                    TwinDevices™ Hardware Pairing
                  </h3>
                </div>
                <button
                  onClick={() => setPairingModalOpen(false)}
                  className="text-text-muted hover:text-text-primary text-sm p-1"
                >
                  ✕
                </button>
              </div>

              {/* Tabs */}
              <div className="flex rounded-xl bg-surface-2 p-1 border border-border-subtle gap-1">
                <button
                  type="button"
                  onClick={() => {
                    setPairingTab("LOCAL_WIFI");
                    setPairingError(null);
                    setCandidateJoinStatus("IDLE");
                  }}
                  className={`flex-1 py-1.5 px-1.5 rounded-lg text-xs font-medium transition text-center truncate ${
                    pairingTab === "LOCAL_WIFI"
                      ? "bg-accent-cyan text-surface-0 font-semibold shadow-xs"
                      : "text-text-secondary hover:text-text-primary"
                  }`}
                >
                  Wi-Fi (Primary)
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPairingTab("BLUETOOTH");
                    setPairingError(null);
                    setBtScanError(null);
                  }}
                  className={`flex-1 py-1.5 px-1.5 rounded-lg text-xs font-medium transition text-center truncate ${
                    pairingTab === "BLUETOOTH"
                      ? "bg-accent-cyan text-surface-0 font-semibold shadow-xs"
                      : "text-text-secondary hover:text-text-primary"
                  }`}
                >
                  Bluetooth (BLE)
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPairingTab("CLAIM");
                    setPairingError(null);
                  }}
                  className={`flex-1 py-1.5 px-1.5 rounded-lg text-xs font-medium transition text-center truncate ${
                    pairingTab === "CLAIM"
                      ? "bg-accent-cyan text-surface-0 font-semibold shadow-xs"
                      : "text-text-secondary hover:text-text-primary"
                  }`}
                >
                  Join Secondary
                </button>
              </div>

              {/* TAB 1: LOCAL WI-FI (PRIMARY TRANSPORT) */}
              {pairingTab === "LOCAL_WIFI" && (
                <div className="space-y-4 text-center">
                  <p className="text-xs text-text-muted">
                    Scan the QR code with your secondary phone or tablet, or enter the 6-digit numeric PIN to link it.
                  </p>

                  {/* 6-Digit PIN Display */}
                  <div className="p-4 rounded-2xl border border-cyan-500/30 bg-cyan-950/20 space-y-2">
                    <div className="text-[11px] font-mono text-cyan-300 uppercase tracking-widest">
                      Pairing Code
                    </div>
                    <div className="text-3xl sm:text-4xl font-mono font-bold tracking-widest text-accent-cyan">
                      {pairingLoading ? (
                        <span className="text-lg animate-pulse">Generating PIN...</span>
                      ) : pairingSession?.pairingCode ? (
                        pairingSession.pairingCode.length === 6 && !pairingSession.pairingCode.includes("-")
                          ? `${pairingSession.pairingCode.slice(0, 3)}-${pairingSession.pairingCode.slice(3)}`
                          : pairingSession.pairingCode
                      ) : (
                        "--- ---"
                      )}
                    </div>
                    <div className="text-[10px] text-text-muted">
                      10-minute expiry • Requires Owner Approval on this laptop
                    </div>
                  </div>

                  {/* Real Dynamic QR Code Display */}
                  <div className="p-4 rounded-xl border border-border-subtle bg-surface-2/60 flex flex-col items-center gap-2">
                    <div className="size-36 rounded-xl bg-slate-950 border border-cyan-500/30 p-2 flex items-center justify-center overflow-hidden shadow-inner">
                      {qrDataUrl ? (
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <img
                          src={qrDataUrl}
                          alt="TwinMind Pairing QR Code"
                          className="size-full object-contain"
                        />
                      ) : (
                        <div className="size-full flex items-center justify-center text-xs text-cyan-400 font-mono animate-pulse">
                          Generating QR...
                        </div>
                      )}
                    </div>
                    <span className="text-[10px] text-text-muted font-mono">
                      Session ID: {pairingSession?.id.slice(0, 14)}...
                    </span>
                  </div>

                  {/* Local Wi-Fi Network URL Display */}
                  <div className="p-3.5 rounded-xl border border-cyan-500/30 bg-surface-2/80 text-left space-y-1.5">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="font-semibold text-text-primary flex items-center gap-1.5">
                        <span className="size-2 rounded-full bg-emerald-400 animate-pulse" />
                        Local Wi-Fi Pairing URL
                      </span>
                      <span className="text-[10px] text-accent-cyan font-mono">
                        {networkInfo?.ip ? `Host IP: ${networkInfo.ip}` : "Wi-Fi Ready"}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        readOnly
                        value={
                          networkInfo?.frontendUrl
                            ? `${networkInfo.frontendUrl}/pair?code=${pairingSession?.pairingCode || ""}`
                            : `http://localhost:3000/pair?code=${pairingSession?.pairingCode || ""}`
                        }
                        className="flex-1 bg-surface-0 border border-border-subtle rounded-lg px-2.5 py-1.5 text-xs font-mono text-cyan-300 select-all"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          const url = networkInfo?.frontendUrl
                            ? `${networkInfo.frontendUrl}/pair?code=${pairingSession?.pairingCode || ""}`
                            : `http://localhost:3000/pair?code=${pairingSession?.pairingCode || ""}`;
                          navigator.clipboard.writeText(url);
                          setCopiedUrl(true);
                          setTimeout(() => setCopiedUrl(false), 2000);
                        }}
                        className="px-3 py-1.5 rounded-lg text-xs font-medium bg-cyan-500/10 border border-cyan-500/30 text-accent-cyan hover:bg-cyan-500/20 transition whitespace-nowrap"
                      >
                        {copiedUrl ? "✓ Copied" : "Copy URL"}
                      </button>
                    </div>
                    <p className="text-[10px] text-text-muted">
                      Open this URL directly in Safari or Chrome on your phone, or scan the QR code above with your camera. No mobile app download required!
                    </p>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex items-center justify-center gap-3 pt-1">
                    <button
                      type="button"
                      onClick={handleCopyPairingCode}
                      disabled={!pairingSession || pairingLoading}
                      className="px-4 py-2 rounded-xl text-xs font-semibold border border-cyan-500/30 bg-cyan-500/10 text-accent-cyan hover:bg-cyan-500/20 transition flex items-center gap-1.5"
                    >
                      <span>{copiedCode ? "✓" : "📋"}</span>
                      {copiedCode ? "Copied PIN!" : "Copy Code"}
                    </button>
                    <button
                      type="button"
                      onClick={handleRefreshPairingCode}
                      disabled={pairingLoading}
                      className="px-4 py-2 rounded-xl text-xs font-medium border border-border-subtle bg-surface-2 text-text-secondary hover:text-text-primary transition"
                    >
                      {pairingLoading ? "Refreshing..." : "↻ New PIN"}
                    </button>
                  </div>
                </div>
              )}

              {/* TAB 2: WEB BLUETOOTH (BLE PERIPHERAL SCAN & FALLBACK) */}
              {pairingTab === "BLUETOOTH" && (
                <div className="space-y-4">
                  {btScanError ? (
                    <div className="p-4 rounded-xl border border-amber-500/40 bg-amber-500/10 text-xs space-y-3 text-left">
                      <div className="flex items-center gap-2 font-semibold text-amber-300">
                        <span className="text-base">⚠️</span>
                        <span>Bluetooth Scan Notice</span>
                      </div>
                      <p className="text-slate-200 leading-relaxed font-medium">
                        Bluetooth discovery is unavailable for this device/browser. Use Local Wi-Fi Pairing instead.
                      </p>
                      <p className="text-[11px] text-slate-400 leading-relaxed">
                        Smartphones do not broadcast BLE GATT peripheral packets unless running a dedicated custom peripheral app. TwinMind seamlessly pairs across devices over your local Wi-Fi network without any native app.
                      </p>
                      <div className="flex flex-wrap items-center gap-2 pt-1">
                        <button
                          type="button"
                          onClick={() => {
                            setPairingTab("LOCAL_WIFI");
                            setBtScanError(null);
                          }}
                          className="px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-accent-cyan text-surface-0 hover:bg-accent-cyan/90 transition shadow-sm"
                        >
                          Pair via Local Wi-Fi
                        </button>
                        <button
                          type="button"
                          onClick={handleScanBluetooth}
                          className="px-3.5 py-1.5 rounded-lg text-xs font-medium border border-border-subtle bg-surface-3 hover:bg-surface-4 text-text-primary transition"
                        >
                          Try Bluetooth Again
                        </button>
                        <button
                          type="button"
                          onClick={() => setBtScanError(null)}
                          className="px-3 py-1.5 rounded-lg text-xs font-medium text-text-muted hover:text-text-primary transition"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : btScanning ? (
                    <div className="p-8 text-center space-y-3">
                      <div className="size-10 rounded-full border-2 border-cyan-400 border-t-transparent animate-spin mx-auto" />
                      <p className="text-xs text-text-primary font-medium">Scanning for BLE peripherals...</p>
                      <p className="text-[11px] text-text-muted">Select your device in the browser dialog prompt</p>
                    </div>
                  ) : (
                    <div className="space-y-4 text-center">
                      <div className="p-4 rounded-2xl border border-border-subtle bg-surface-2/60 space-y-3">
                        <div className="size-12 rounded-xl bg-cyan-500/20 border border-cyan-500/30 flex items-center justify-center text-2xl mx-auto text-cyan-400">
                          📶
                        </div>
                        <h4 className="text-sm font-semibold text-text-primary">
                          Web Bluetooth Peripheral Scan
                        </h4>
                        <p className="text-xs text-text-muted max-w-xs mx-auto leading-relaxed">
                          Scan for nearby Bluetooth Low Energy (BLE) peripheral devices. Most mobile phones do not broadcast BLE peripheral advertisements by default.
                        </p>
                        <button
                          type="button"
                          onClick={handleScanBluetooth}
                          className="w-full py-2.5 px-4 rounded-xl font-semibold text-xs bg-cyan-500 text-slate-950 hover:bg-cyan-400 transition shadow-md shadow-cyan-500/20"
                        >
                          Pair via Bluetooth (Scan BLE)
                        </button>
                      </div>

                      {btFoundDevice && (
                        <div className="p-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 text-xs text-emerald-300">
                          Detected BLE Peripheral: <strong>{btFoundDevice}</strong>
                        </div>
                      )}

                      <div className="p-3 rounded-xl bg-surface-2/40 border border-border-subtle text-left space-y-1">
                        <div className="text-[11px] font-semibold text-text-secondary">
                          💡 Why Local Wi-Fi is Recommended:
                        </div>
                        <p className="text-[11px] text-text-muted leading-relaxed">
                          Browsers use Web Bluetooth to discover BLE GATT peripherals. iOS & Android only broadcast BLE advertisements when a custom background BLE app is active. Local Wi-Fi pairing works instantly in any phone browser with zero downloads.
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* TAB 3: JOIN AS SECONDARY (CANDIDATE CLIENT) */}
              {pairingTab === "CLAIM" && (
                <div className="space-y-4">
                  {candidateJoinStatus === "WAITING_APPROVAL" ? (
                    <div className="p-6 rounded-2xl border border-cyan-500/30 bg-cyan-950/20 text-center space-y-3">
                      <div className="size-10 rounded-full border-2 border-cyan-400 border-t-transparent animate-spin mx-auto" />
                      <h4 className="text-sm font-semibold text-text-primary">
                        Pairing Request Submitted
                      </h4>
                      <p className="text-xs text-text-secondary">
                        Please approve this incoming device on your primary laptop screen to finalize trust.
                      </p>
                      <div className="text-[10px] font-mono text-cyan-300">
                        Session: {candidateSessionId?.slice(0, 14)}...
                      </div>
                    </div>
                  ) : (
                    <form onSubmit={handleJoinPairing} className="space-y-4">
                      <p className="text-xs text-text-muted">
                        Enter the 6-digit code shown on your host laptop, or scan its QR code using your device camera.
                      </p>

                      {/* Camera QR Scanner Trigger */}
                      <button
                        type="button"
                        onClick={() => setCameraScannerOpen(true)}
                        className="w-full py-2.5 px-3 rounded-xl border border-cyan-500/40 bg-cyan-500/10 hover:bg-cyan-500/20 text-accent-cyan text-xs font-semibold flex items-center justify-center gap-2 transition"
                      >
                        <span>📷</span> Scan Host QR with Camera
                      </button>

                      <div className="flex items-center gap-2 text-text-muted text-[10px]">
                        <span className="flex-1 h-px bg-border-subtle" />
                        <span>OR ENTER PIN MANUALLY</span>
                        <span className="flex-1 h-px bg-border-subtle" />
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-xs font-semibold text-text-secondary">
                          6-Digit PIN Code
                        </label>
                        <input
                          type="text"
                          value={claimCode}
                          onChange={(e) => setClaimCode(e.target.value)}
                          placeholder="e.g. 123456"
                          maxLength={10}
                          className="w-full px-3 py-2.5 rounded-xl bg-surface-2 border border-border-subtle text-base font-mono tracking-widest text-text-primary focus:outline-none focus:border-accent-cyan text-center uppercase"
                          required
                        />
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-xs font-semibold text-text-secondary">
                          Device Name (Optional)
                        </label>
                        <input
                          type="text"
                          value={claimDeviceLabel}
                          onChange={(e) => setClaimDeviceLabel(e.target.value)}
                          placeholder="e.g. Personal iPhone 15"
                          className="w-full px-3 py-2 rounded-xl bg-surface-2 border border-border-subtle text-xs text-text-primary focus:outline-none focus:border-accent-cyan"
                        />
                      </div>

                      {claimSuccess && (
                        <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs flex items-center gap-2">
                          <span>✓</span> {claimSuccess}
                        </div>
                      )}

                      {pairingError && (
                        <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs flex items-center gap-2">
                          <span>⚠️</span> {pairingError}
                        </div>
                      )}

                      <div className="flex items-center justify-end gap-2.5 pt-2">
                        <button
                          type="button"
                          onClick={() => setPairingModalOpen(false)}
                          className="px-4 py-2 rounded-xl text-xs font-medium text-text-muted hover:text-text-primary"
                        >
                          Cancel
                        </button>
                        <button
                          type="submit"
                          disabled={claimLoading || !claimCode.trim()}
                          className="px-4 py-2 rounded-xl text-xs font-semibold bg-accent-cyan text-surface-0 hover:bg-accent-cyan/90 transition disabled:opacity-50"
                        >
                          {claimLoading ? "Submitting..." : "Submit Pairing Request"}
                        </button>
                      </div>
                    </form>
                  )}
                </div>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Detailed Manage Device Modal */}
      <AnimatePresence>
        {manageTarget && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-lg rounded-2xl border border-border-strong bg-surface-1 p-6 shadow-2xl space-y-5 max-h-[85dvh] sm:max-h-[90dvh] overflow-y-auto"
            >
              <div className="flex items-center justify-between border-b border-border-subtle pb-4">
                <div className="flex items-center gap-3">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-surface-3 text-xl border border-border-subtle">
                    {DEVICE_TYPE_ICONS[manageTarget.type] || "💻"}
                  </span>
                  <div>
                    <h3 className="text-base font-bold text-text-primary">
                      Manage {manageTarget.label}
                    </h3>
                    <p className="text-xs text-text-muted">
                      Hardware ID: {manageTarget.id.slice(0, 18)}...
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setManageTarget(null)}
                  className="text-text-muted hover:text-text-primary text-sm p-1"
                >
                  ✕
                </button>
              </div>

              {/* Status and Diagnostics */}
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="p-3 rounded-xl bg-surface-2 border border-border-subtle">
                  <span className="text-text-muted block text-[11px]">Lifecycle Status</span>
                  <span className="font-semibold text-text-primary mt-0.5 block">
                    {manageTarget.status}
                  </span>
                </div>
                <div className="p-3 rounded-xl bg-surface-2 border border-border-subtle">
                  <span className="text-text-muted block text-[11px]">Realtime Presence</span>
                  <span className="font-semibold text-text-primary mt-0.5 block flex items-center gap-1.5">
                    <span
                      className={`size-2 rounded-full ${
                        manageTarget.presence === "ONLINE"
                          ? "bg-emerald-400 animate-pulse"
                          : "bg-zinc-500"
                      }`}
                    />
                    {manageTarget.presence}
                  </span>
                </div>
                <div className="p-3 rounded-xl bg-surface-2 border border-border-subtle">
                  <span className="text-text-muted block text-[11px]">Connection Method</span>
                  <span className="font-semibold text-accent-cyan mt-0.5 block font-mono">
                    {manageTarget.connectionMethod || "QR_PIN"}
                  </span>
                </div>
                <div className="p-3 rounded-xl bg-surface-2 border border-border-subtle">
                  <span className="text-text-muted block text-[11px]">First Enrolled</span>
                  <span className="font-semibold text-text-primary mt-0.5 block">
                    {new Date(manageTarget.createdAt).toLocaleDateString()}
                  </span>
                </div>
              </div>

              {/* Diagnostic Test Ping */}
              <div className="p-3.5 rounded-xl border border-cyan-500/30 bg-cyan-950/20 space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-xs font-semibold text-text-primary flex items-center gap-1.5">
                      <span>⚡</span> Diagnostic Connection Ping
                    </div>
                    <div className="text-[11px] text-text-muted">
                      Verify bidirectional local network connectivity & measure RTT latency.
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={async () => {
                      setPingLoading(true);
                      try {
                        const res = await pingDevice(manageTarget.id);
                        setPingResult(res);
                      } catch (err: unknown) {
                        const error = err as Error;
                        setPingResult({
                          pong: false,
                          latencyMs: -1,
                          timestamp: Date.now(),
                          deviceId: manageTarget.id,
                          deviceLabel: manageTarget.label,
                          transport: error.message || "Failed",
                        });
                      } finally {
                        setPingLoading(false);
                      }
                    }}
                    disabled={pingLoading}
                    className="px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-accent-cyan text-surface-0 hover:bg-accent-cyan/90 transition disabled:opacity-50 shrink-0 ml-3 flex items-center gap-1"
                  >
                    <span>📡</span> {pingLoading ? "Pinging..." : "Send Test Ping"}
                  </button>
                </div>

                {pingResult && pingResult.deviceId === manageTarget.id && (
                  <div
                    className={`p-2.5 rounded-lg text-xs font-mono flex items-center justify-between ${
                      pingResult.pong
                        ? "bg-emerald-950/40 border border-emerald-500/30 text-emerald-300"
                        : "bg-rose-950/40 border border-rose-500/30 text-rose-300"
                    }`}
                  >
                    <span>
                      {pingResult.pong ? "✓ Pong Received!" : "✗ Ping Failed"} (Transport: {pingResult.transport})
                    </span>
                    <span className="font-bold">
                      {pingResult.latencyMs > 0 ? `${pingResult.latencyMs}ms` : "Error"}
                    </span>
                  </div>
                )}
              </div>

              {/* Granular Device Permissions */}
              <div className="space-y-2.5 pt-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-semibold text-text-secondary tracking-wider uppercase">
                    Granular Device Permissions & Scope
                  </h4>
                  <span className="text-[10px] text-accent-cyan font-mono bg-cyan-950/40 px-2 py-0.5 rounded-full border border-cyan-500/20">
                    {(manageTarget.permissions || []).length} Active
                  </span>
                </div>
                <p className="text-[11px] text-text-muted">
                  Control the capabilities and personal data this hardware instance is permitted to access.
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {[
                    { key: "NOTIFICATIONS" as DevicePermission, icon: "🔔", label: "Push Notifications", desc: "Display alerts & command pings" },
                    { key: "SYNC_SESSION" as DevicePermission, icon: "💬", label: "Conversation Sync", desc: "Synchronize active AI chat turns" },
                    { key: "SYNC_MEMORY" as DevicePermission, icon: "◌", label: "TwinMemory™ Recall", desc: "Access personal memory graph" },
                    { key: "RECEIVE_COMMAND" as DevicePermission, icon: "⚡", label: "Remote Commands", desc: "Allow OS and app action triggers" },
                    { key: "FILES" as DevicePermission, icon: "📎", label: "File Sharing", desc: "Transfer documents and media payloads" },
                    { key: "CAMERA" as DevicePermission, icon: "📷", label: "Camera Access", desc: "Vision feeds and QR code scanning" },
                    { key: "MICROPHONE" as DevicePermission, icon: "🎙️", label: "Microphone Access", desc: "Voice biometric and audio capture" },
                  ].map((item) => {
                    const isGranted = (manageTarget.permissions || []).includes(item.key);
                    const isPending = savingPermission === item.key;

                    return (
                      <button
                        key={item.key}
                        type="button"
                        disabled={isPending}
                        onClick={() => handleTogglePermission(item.key)}
                        className={`flex items-start justify-between p-2.5 rounded-xl border text-left transition ${
                          isGranted
                            ? "bg-cyan-950/20 border-cyan-500/40 hover:border-cyan-500/60"
                            : "bg-surface-2/40 border-border-subtle hover:border-border-strong opacity-75"
                        }`}
                      >
                        <div className="flex items-start gap-2 mr-2">
                          <span className="text-sm mt-0.5">{item.icon}</span>
                          <div>
                            <div className="text-xs font-semibold text-text-primary flex items-center gap-1.5">
                              {item.label}
                            </div>
                            <div className="text-[10px] text-text-muted leading-tight">
                              {item.desc}
                            </div>
                          </div>
                        </div>

                        <div
                          className={`w-8 h-4.5 rounded-full transition-colors relative shrink-0 mt-0.5 ${
                            isGranted ? "bg-accent-cyan" : "bg-surface-4"
                          }`}
                        >
                          <div
                            className={`size-3.5 rounded-full bg-white transition-transform absolute top-0.5 ${
                              isGranted ? "translate-x-4" : "translate-x-0.5"
                            }`}
                          />
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Lifecycle Actions Header */}
              <div className="space-y-2 pt-2">
                <h4 className="text-xs font-semibold text-text-secondary tracking-wider uppercase">
                  Device Management Operations
                </h4>

                <div className="space-y-2">
                  {/* Disconnect */}
                  <div className="flex items-center justify-between p-3 rounded-xl bg-surface-2/60 border border-border-subtle hover:border-border-strong transition">
                    <div>
                      <div className="text-xs font-semibold text-text-primary">Disconnect</div>
                      <div className="text-[11px] text-text-muted">
                        Temporarily cuts connection (status becomes OFFLINE). Pairing remains valid.
                      </div>
                    </div>
                    <button
                      onClick={() =>
                        setActionTarget({ device: manageTarget, action: "DISCONNECT" })
                      }
                      className="px-3 py-1.5 rounded-lg text-xs font-medium border border-border-subtle bg-surface-3 hover:bg-surface-4 text-text-primary shrink-0 ml-3"
                    >
                      Disconnect
                    </button>
                  </div>

                  {/* Unpair */}
                  <div className="flex items-center justify-between p-3 rounded-xl bg-surface-2/60 border border-amber-500/20 hover:border-amber-500/40 transition">
                    <div>
                      <div className="text-xs font-semibold text-amber-300">Unpair Device</div>
                      <div className="text-[11px] text-text-muted">
                        Invalidates active pairing session and credentials. Retains audit record.
                      </div>
                    </div>
                    <button
                      onClick={() => setActionTarget({ device: manageTarget, action: "UNPAIR" })}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium border border-amber-500/30 bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 shrink-0 ml-3"
                    >
                      Unpair
                    </button>
                  </div>

                  {/* Revoke Access */}
                  <div className="flex items-center justify-between p-3 rounded-xl bg-surface-2/60 border border-rose-500/20 hover:border-rose-500/40 transition">
                    <div>
                      <div className="text-xs font-semibold text-rose-300">Revoke Access</div>
                      <div className="text-[11px] text-text-muted">
                        Suspends device trust and blocks command routing (status: REVOKED).
                      </div>
                    </div>
                    <button
                      onClick={() => setActionTarget({ device: manageTarget, action: "REVOKE" })}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium border border-rose-500/30 bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 shrink-0 ml-3"
                    >
                      Revoke
                    </button>
                  </div>

                  {/* Forget */}
                  <div className="flex items-center justify-between p-3 rounded-xl bg-surface-2/60 border border-rose-500/20 hover:border-rose-500/40 transition">
                    <div>
                      <div className="text-xs font-semibold text-rose-300">Forget Device</div>
                      <div className="text-[11px] text-text-muted">
                        Completely revokes trust and purges device token. Full re-pairing required.
                      </div>
                    </div>
                    <button
                      onClick={() => setActionTarget({ device: manageTarget, action: "FORGET" })}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium border border-rose-500/30 bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 shrink-0 ml-3"
                    >
                      Forget
                    </button>
                  </div>

                  {/* Delete */}
                  <div className="flex items-center justify-between p-3 rounded-xl bg-rose-950/10 border border-rose-500/30 hover:border-rose-500/50 transition">
                    <div>
                      <div className="text-xs font-semibold text-rose-400">Permanently Delete</div>
                      <div className="text-[11px] text-text-muted">
                        Permanently deletes this hardware entry from the database.
                      </div>
                    </div>
                    <button
                      onClick={() => setActionTarget({ device: manageTarget, action: "DELETE" })}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium bg-rose-600 hover:bg-rose-500 text-white shrink-0 ml-3 shadow-xs"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Explicit Action Confirmation Modal */}
      <AnimatePresence>
        {actionTarget && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-sm rounded-2xl border border-border-strong bg-surface-1 p-5 shadow-2xl space-y-4 max-h-[85dvh] sm:max-h-[90dvh] overflow-y-auto"
            >
              <div className="flex items-center gap-3">
                <span
                  className={`flex size-10 items-center justify-center rounded-xl text-xl border shrink-0 ${
                    actionTarget.action === "DELETE" || actionTarget.action === "FORGET" || actionTarget.action === "REVOKE"
                      ? "bg-rose-500/20 text-rose-400 border-rose-500/30"
                      : actionTarget.action === "UNPAIR"
                      ? "bg-amber-500/20 text-amber-300 border-amber-500/30"
                      : "bg-surface-3 text-text-secondary border-border-subtle"
                  }`}
                >
                  {actionTarget.action === "DELETE"
                    ? "🗑️"
                    : actionTarget.action === "FORGET"
                    ? "⚠️"
                    : actionTarget.action === "REVOKE"
                    ? "🚫"
                    : actionTarget.action === "UNPAIR"
                    ? "🔗"
                    : "⏹️"}
                </span>
                <div>
                  <h3 className="text-sm font-bold text-text-primary capitalize">
                    {actionTarget.action.toLowerCase()} Device?
                  </h3>
                  <p className="text-xs text-text-muted mt-0.5 truncate max-w-xs">
                    {actionTarget.device.label}
                  </p>
                </div>
              </div>

              <p className="text-xs text-text-secondary leading-relaxed">
                {actionTarget.action === "DISCONNECT" &&
                  "This device will be marked offline. It can reconnect during its next application heartbeat."}
                {actionTarget.action === "UNPAIR" &&
                  "This terminates the pairing relationship. The device will no longer receive cross-device notifications."}
                {actionTarget.action === "REVOKE" &&
                  "This revokes permissions and blocks this device from participating in cross-device coordination (status: REVOKED)."}
                {actionTarget.action === "FORGET" &&
                  "This completely revokes credentials and device tokens. The device will be blocked until explicitly re-paired by the Owner."}
                {actionTarget.action === "DELETE" &&
                  "This will permanently remove the device record from PostgreSQL. This action cannot be undone."}
              </p>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setActionTarget(null)}
                  disabled={actionLoading}
                  className="px-3.5 py-1.5 rounded-xl text-xs font-medium text-text-muted hover:text-text-primary"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleConfirmAction}
                  disabled={actionLoading}
                  className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold text-white transition disabled:opacity-50 ${
                    actionTarget.action === "DELETE" || actionTarget.action === "FORGET" || actionTarget.action === "REVOKE"
                      ? "bg-rose-600 hover:bg-rose-500"
                      : actionTarget.action === "UNPAIR"
                      ? "bg-amber-600 hover:bg-amber-500"
                      : "bg-surface-4 hover:bg-surface-3 text-text-primary"
                  }`}
                >
                  {actionLoading ? "Processing..." : `Confirm ${actionTarget.action}`}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
