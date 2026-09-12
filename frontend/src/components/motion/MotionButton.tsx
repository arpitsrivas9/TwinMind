"use client";

import React, { forwardRef } from "react";
import { motion, useReducedMotion, HTMLMotionProps } from "framer-motion";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

export interface MotionButtonProps extends Omit<HTMLMotionProps<"button">, "ref" | "children"> {
  children?: React.ReactNode;
  variant?: ButtonVariant;
  loading?: boolean;
}

const buttonBase =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-md px-4 py-2.5 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-3 disabled:pointer-events-none disabled:opacity-50 select-none cursor-pointer";

const buttonVariants: Record<ButtonVariant, string> = {
  primary:
    "bg-accent-cyan text-slate-950 hover:bg-accent-cyan-strong focus-visible:outline-focus-ring shadow-[0_0_15px_rgba(34,211,238,0.2)]",
  secondary:
    "border border-border-default bg-surface-2 text-text-primary hover:border-border-strong hover:bg-surface-3 focus-visible:outline-focus-ring",
  ghost:
    "text-text-secondary hover:bg-white/5 hover:text-text-primary focus-visible:outline-focus-ring",
  danger:
    "border border-rose-400/30 bg-rose-400/10 text-rose-200 hover:bg-rose-400/20 focus-visible:outline-danger",
};

export const MotionButton = forwardRef<HTMLButtonElement, MotionButtonProps>(
  function MotionButton(
    {
      className = "",
      variant = "primary",
      type = "button",
      loading = false,
      disabled,
      children,
      whileHover,
      whileTap,
      ...props
    },
    ref,
  ) {
    const shouldReduceMotion = useReducedMotion();

    return (
      <motion.button
        ref={ref}
        type={type}
        disabled={disabled || loading}
        aria-busy={loading}
        whileHover={
          shouldReduceMotion || disabled || loading
            ? undefined
            : whileHover ?? { y: -1, transition: { duration: 0.15, ease: "easeOut" } }
        }
        whileTap={
          shouldReduceMotion || disabled || loading
            ? undefined
            : whileTap ?? { scale: 0.97, transition: { duration: 0.1, ease: "easeIn" } }
        }
        className={`${buttonBase} ${buttonVariants[variant]} ${className}`}
        {...props}
      >
        {loading && (
          <span
            className="size-3.5 shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent"
            aria-hidden="true"
          />
        )}
        {children}
      </motion.button>
    );
  },
);
