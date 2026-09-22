"use client";

import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useDevice } from "../../context/DeviceContext";
import { useTrust } from "../../context/TrustContext";
import { GuestPrivacyShield } from "../trust/GuestPrivacyShield";
import {
  DeviceRecord,
  DeviceType,
  DeviceCommandType,
  ALLOWED_DEVICE_COMMANDS,
} from "../../types/device";

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
    clearNotification,
    refreshDevices,
    registerDevice,
    revokeDevice,
    updateDevice,
    routeCommand,
    simulateDevice,
  } = useDevice();

  // Modals state
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

  // Rename state
  const [editingDeviceId, setEditingDeviceId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState("");

  // Simulator state
  const [simulatorLoading, setSimulatorLoading] = useState(false);

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
  const trustedDevicesCount = devices.filter((d) => d.isTrusted && d.status !== "REVOKED").length;

  const handleOpenCommandModal = (targetId?: string) => {
    const defaultTarget = targetId || devices.find((d) => d.id !== currentDevice?.id)?.id || devices[0]?.id || "";
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
      await simulateDevice(type, label);
    } catch (err: unknown) {
      alert((err as Error).message || "Failed to spawn simulator device");
    } finally {
      setSimulatorLoading(false);
    }
  };

  const handleSaveRename = async (id: string) => {
    if (!editLabel.trim()) return;
    try {
      await updateDevice(id, { label: editLabel });
      setEditingDeviceId(null);
    } catch (err: unknown) {
      alert((err as Error).message || "Failed to rename device");
    }
  };

  return (
    <div className="w-full max-w-6xl mx-auto space-y-8 pb-12">
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
            Unified personal AI operating system layer across all your hardware. Realtime presence, allowlisted command routing, and zero OS modifications.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
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

      {/* Development Device Simulator Hub */}
      <div className="p-5 rounded-2xl border border-border-subtle bg-surface-2/50 space-y-3">
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
              className="px-2.5 py-1.5 rounded-lg text-xs font-medium border border-border-subtle bg-surface-3 hover:bg-surface-4 text-text-primary transition flex items-center gap-1.5"
            >
              <span>📱</span> + Sim Phone
            </button>
            <button
              onClick={() => handleSpawnSimulator("TABLET", "Simulated iPad Pro")}
              disabled={simulatorLoading}
              className="px-2.5 py-1.5 rounded-lg text-xs font-medium border border-border-subtle bg-surface-3 hover:bg-surface-4 text-text-primary transition flex items-center gap-1.5"
            >
              <span>📟</span> + Sim Tablet
            </button>
            <button
              onClick={() => handleSpawnSimulator("DESKTOP", "Simulated Mac Studio")}
              disabled={simulatorLoading}
              className="px-2.5 py-1.5 rounded-lg text-xs font-medium border border-border-subtle bg-surface-3 hover:bg-surface-4 text-text-primary transition flex items-center gap-1.5"
            >
              <span>🖥️</span> + Sim Desktop
            </button>
          </div>
        </div>
      </div>

      {/* Connected Devices Grid */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-text-primary flex items-center gap-2">
            <span>Hardware Devices</span>
            <span className="text-xs font-normal text-text-muted">({devices.length})</span>
          </h2>
          <span className="text-xs text-text-muted">
            Current Browser: <span className="text-accent-cyan font-medium">{currentDevice?.label || "Registering..."}</span>
          </span>
        </div>

        {devices.length === 0 ? (
          <div className="p-8 rounded-2xl border border-dashed border-border-subtle bg-surface-2/30 text-center space-y-3">
            <div className="text-3xl">📱</div>
            <div className="text-sm font-medium text-text-primary">No devices connected</div>
            <p className="text-xs text-text-muted max-w-sm mx-auto">
              Your device will automatically register once the application starts. You can also use the simulator buttons above to spawn simulated devices.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {devices.map((device) => {
              const isCurrent = device.id === currentDevice?.id;
              const isOnline = device.presence === "ONLINE";
              const isRevoked = device.status === "REVOKED";

              return (
                <div
                  key={device.id}
                  className={`p-4 rounded-2xl border transition relative flex flex-col justify-between ${
                    isRevoked
                      ? "border-rose-500/20 bg-rose-500/5 opacity-60"
                      : isCurrent
                      ? "border-accent-cyan/40 bg-surface-2/90 shadow-lg shadow-cyan-950/20"
                      : "border-border-subtle bg-surface-2/60 hover:border-border-strong"
                  }`}
                >
                  <div className="space-y-3">
                    {/* Top Row: Icon, Label, Presence Badge */}
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
                              : isOnline
                              ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
                              : "bg-surface-3 border-border-subtle text-text-muted"
                          }`}
                        >
                          <span
                            className={`size-1.5 rounded-full ${
                              isRevoked ? "bg-rose-400" : isOnline ? "bg-emerald-400 animate-pulse" : "bg-zinc-500"
                            }`}
                          />
                          {isRevoked ? "REVOKED" : isOnline ? "ONLINE" : "OFFLINE"}
                        </span>

                        {isCurrent && (
                          <span className="text-[9px] px-1.5 py-0.2 rounded bg-cyan-500/20 text-accent-cyan border border-cyan-500/30 font-semibold">
                            THIS DEVICE
                          </span>
                        )}
                        {device.isSimulator && (
                          <span className="text-[9px] px-1.5 py-0.2 rounded bg-purple-500/20 text-purple-300 border border-purple-500/30">
                            SIMULATOR
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
                      Last seen: {new Date(device.lastSeenAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>

                    <div className="flex items-center gap-1.5">
                      {!isRevoked && (
                        <button
                          onClick={() => handleOpenCommandModal(device.id)}
                          className="px-2.5 py-1 rounded-lg text-[11px] font-medium bg-surface-3 hover:bg-surface-4 text-accent-cyan border border-border-subtle transition flex items-center gap-1"
                        >
                          <span>⚡</span> Command
                        </button>
                      )}

                      {!isCurrent && !isRevoked && (
                        <button
                          onClick={() => {
                            if (confirm(`Revoke trust from ${device.label}?`)) {
                              revokeDevice(device.id);
                            }
                          }}
                          className="px-2 py-1 rounded-lg text-[11px] font-medium text-rose-400 hover:bg-rose-500/10 transition"
                        >
                          Revoke
                        </button>
                      )}
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
                      cmd.state === "COMPLETED"
                        ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
                        : cmd.state === "ROUTING"
                        ? "bg-amber-500/10 border-amber-500/30 text-amber-400"
                        : "bg-surface-3 border-border-subtle text-text-muted"
                    }`}
                  >
                    {cmd.state}
                  </span>
                  <span className="text-[10px] text-text-muted hidden sm:inline">
                    {new Date(cmd.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
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
              className="w-full max-w-lg rounded-2xl border border-border-strong bg-surface-1 p-6 shadow-2xl space-y-5"
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
                  <select
                    value={targetDeviceId}
                    onChange={(e) => setTargetDeviceId(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-surface-2 border border-border-subtle text-sm text-text-primary focus:outline-none focus:border-accent-cyan"
                    required
                  >
                    {devices.map((d) => (
                      <option key={d.id} value={d.id} disabled={d.presence !== "ONLINE"}>
                        {d.label} ({d.type}) — {d.presence} {d.id === currentDevice?.id ? " [Current]" : ""}
                      </option>
                    ))}
                  </select>
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
                    <span>⚠</span> {commandError}
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
                    disabled={commandSending}
                    className="px-4 py-2 rounded-xl text-xs font-semibold bg-accent-cyan text-surface-0 hover:bg-accent-cyan/90 transition disabled:opacity-50"
                  >
                    {commandSending ? "Routing..." : "Dispatch Command"}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
