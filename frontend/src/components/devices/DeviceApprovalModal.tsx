"use client";

import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useDevice } from "../../context/DeviceContext";
import { DeviceType } from "../../types/device";

const DEVICE_TYPE_ICONS: Record<DeviceType, string> = {
  LAPTOP: "💻",
  DESKTOP: "🖥️",
  PHONE: "📱",
  TABLET: "📟",
  SMARTWATCH: "⌚",
  SMART_GLASSES: "👓",
  SMART_HOME: "🏠",
};

export function DeviceApprovalModal() {
  const {
    incomingPairingRequest,
    approvePairing,
    rejectPairing,
    clearIncomingPairingRequest,
  } = useDevice();

  const [isProcessing, setIsProcessing] = useState<"APPROVE" | "REJECT" | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  if (!incomingPairingRequest) return null;

  const handleApprove = async () => {
    try {
      setIsProcessing("APPROVE");
      setFeedback(null);
      await approvePairing(incomingPairingRequest.sessionId);
    } catch (err: unknown) {
      const error = err as Error;
      setFeedback(error.message || "Failed to approve pairing request");
      setIsProcessing(null);
    }
  };

  const handleReject = async () => {
    try {
      setIsProcessing("REJECT");
      setFeedback(null);
      await rejectPairing(incomingPairingRequest.sessionId);
    } catch (err: unknown) {
      const error = err as Error;
      setFeedback(error.message || "Failed to reject pairing request");
      setIsProcessing(null);
    }
  };

  const candidate = incomingPairingRequest.candidateDevice;
  const platform = (candidate.platformInfo as { os?: string; browser?: string; model?: string }) || {};

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 15 }}
          transition={{ duration: 0.2 }}
          className="w-full max-w-md bg-slate-900 border border-cyan-500/40 rounded-2xl shadow-2xl overflow-hidden max-h-[85dvh] sm:max-h-[90dvh] flex flex-col"
        >
          {/* Header */}
          <div className="p-4 sm:p-5 border-b border-slate-800 bg-slate-950/50 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="size-10 rounded-xl bg-cyan-500/20 border border-cyan-500/30 flex items-center justify-center text-xl text-cyan-400 shadow-inner">
                🔐
              </div>
              <div>
                <h3 className="text-base font-bold text-white tracking-tight flex items-center gap-2">
                  <span>Pairing Request</span>
                  <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30 animate-pulse">
                    APPROVAL REQUIRED
                  </span>
                </h3>
                <p className="text-xs text-slate-400">
                  A device on your Wi-Fi is requesting to connect
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={clearIncomingPairingRequest}
              disabled={isProcessing !== null}
              className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition"
              title="Dismiss prompt"
            >
              ✕
            </button>
          </div>

          {/* Modal Body */}
          <div className="p-4 sm:p-5 space-y-4 overflow-y-auto flex-1">
            {/* Device Overview Card */}
            <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800 space-y-2.5 text-xs">
              <div className="flex items-center justify-between border-b border-slate-800/80 pb-2">
                <span className="text-slate-400 font-medium">Candidate Device:</span>
                <span className="font-bold text-white text-sm">
                  {candidate.name || "Mobile Device"}
                </span>
              </div>

              <div className="flex items-center justify-between border-b border-slate-800/80 pb-2">
                <span className="text-slate-400 font-medium">Device Category:</span>
                <span className="font-semibold text-cyan-400 flex items-center gap-1.5">
                  <span>{DEVICE_TYPE_ICONS[candidate.type] || "📱"}</span>
                  <span>{candidate.type}</span>
                </span>
              </div>

              {platform.os && (
                <div className="flex items-center justify-between border-b border-slate-800/80 pb-2">
                  <span className="text-slate-400 font-medium">OS & Platform:</span>
                  <span className="font-mono text-slate-300">
                    {platform.os} {platform.browser ? `• ${platform.browser}` : ""}
                  </span>
                </div>
              )}

              {candidate.ipAddress && (
                <div className="flex items-center justify-between border-b border-slate-800/80 pb-2">
                  <span className="text-slate-400 font-medium">Network Address:</span>
                  <span className="font-mono text-cyan-300">
                    {candidate.ipAddress}
                  </span>
                </div>
              )}

              <div className="flex items-center justify-between">
                <span className="text-slate-400 font-medium">Pairing PIN:</span>
                <span className="font-mono font-bold text-emerald-400 tracking-wider">
                  {incomingPairingRequest.pairingCode}
                </span>
              </div>
            </div>

            {/* Security Explanation */}
            <div className="p-3.5 rounded-xl bg-cyan-950/20 border border-cyan-500/20 text-xs text-slate-300 space-y-1">
              <div className="flex items-center gap-1.5 font-semibold text-cyan-300">
                <span>🛡️</span>
                <span>Zero-Trust Security Verification</span>
              </div>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                Approving grants this device secure pairing to participate in notifications, memory syncing, and cross-device actions. You can revoke access or unpair at any time.
              </p>
            </div>

            {feedback && (
              <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
                <span>⚠️</span>
                <span>{feedback}</span>
              </div>
            )}
          </div>

          {/* Footer Actions */}
          <div className="p-4 sm:p-5 border-t border-slate-800 bg-slate-950/50 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={handleReject}
              disabled={isProcessing !== null}
              className="px-4 py-2.5 rounded-xl text-xs font-semibold text-rose-300 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 transition disabled:opacity-50 flex items-center gap-1.5"
            >
              {isProcessing === "REJECT" ? (
                <>
                  <span className="size-3.5 rounded-full border-2 border-rose-300 border-t-transparent animate-spin" />
                  <span>Declining...</span>
                </>
              ) : (
                <span>Decline Request</span>
              )}
            </button>

            <button
              type="button"
              onClick={handleApprove}
              disabled={isProcessing !== null}
              className="px-5 py-2.5 rounded-xl text-xs font-semibold text-slate-950 bg-cyan-400 hover:bg-cyan-300 transition shadow-lg shadow-cyan-500/25 disabled:opacity-50 flex items-center gap-1.5"
            >
              {isProcessing === "APPROVE" ? (
                <>
                  <span className="size-3.5 rounded-full border-2 border-slate-950 border-t-transparent animate-spin" />
                  <span>Approving Device...</span>
                </>
              ) : (
                <>
                  <span>✓</span>
                  <span>Approve & Pair Device</span>
                </>
              )}
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
