"use client";

import React from "react";
import { motion } from "framer-motion";
import { useTrust } from "../../context/TrustContext";

interface GuestPrivacyShieldProps {
  title: string;
  description?: string;
  icon?: string;
}

export function GuestPrivacyShield({
  title,
  description = "This module contains private owner data and is locked in Guest Mode. Biometric owner verification or passkey authentication is required to access.",
  icon = "🛡️",
}: GuestPrivacyShieldProps) {
  const { openModal } = useTrust();

  return (
    <div className="flex min-h-[60vh] w-full items-center justify-center p-6">
      <motion.div
        initial={{ opacity: 0, y: 16, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.25, ease: "easeOut" }}
        className="relative mx-auto w-full max-w-lg overflow-hidden rounded-2xl border border-amber-500/30 bg-surface-1/90 p-8 text-center shadow-2xl backdrop-blur-xl"
      >
        {/* Glowing background aura */}
        <div
          className="pointer-events-none absolute -top-24 left-1/2 -translate-x-1/2 size-48 rounded-full bg-amber-500/10 blur-3xl"
          aria-hidden="true"
        />

        {/* Shield Icon */}
        <div className="mx-auto mb-5 flex size-16 items-center justify-center rounded-2xl border border-amber-500/40 bg-amber-500/10 shadow-[0_0_24px_rgba(245,158,11,0.2)]">
          <span className="text-3xl">{icon}</span>
        </div>

        {/* Status Tag */}
        <div className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-[11px] font-semibold text-amber-400">
          <span className="size-1.5 rounded-full bg-amber-400 animate-pulse" />
          <span>GUEST MODE PRIVACY SHIELD</span>
        </div>

        <h3 className="mt-4 text-xl font-bold tracking-tight text-text-primary">
          {title} Protected
        </h3>

        <p className="mt-2 text-xs text-text-secondary leading-relaxed max-w-md mx-auto">
          {description}
        </p>

        {/* Privacy guarantees */}
        <div className="mt-6 space-y-2 rounded-xl border border-border-subtle bg-surface-2/60 p-4 text-left text-[11px] text-text-muted">
          <div className="flex items-center gap-2">
            <span className="text-emerald-400 font-bold">✓</span>
            <span>Owner memories, documents, and personal graphs are hidden</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-emerald-400 font-bold">✓</span>
            <span>Zero owner data leakage to unauthorized speakers or guests</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-emerald-400 font-bold">✓</span>
            <span>Conversations in Guest Mode are isolated from owner archives</span>
          </div>
        </div>

        {/* CTA Button */}
        <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            type="button"
            onClick={openModal}
            className="flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 px-6 py-3 text-xs font-semibold text-white shadow-lg shadow-amber-500/25 transition-all hover:from-amber-400 hover:to-amber-500 focus-visible:outline-2 focus-visible:outline-amber-500"
          >
            <span>🔐</span>
            <span>Verify Owner Identity</span>
          </motion.button>
        </div>
      </motion.div>
    </div>
  );
}

