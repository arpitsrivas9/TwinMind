"use client";

import React, { forwardRef } from "react";
import { motion, useReducedMotion, HTMLMotionProps } from "framer-motion";

export interface MotionCardProps extends Omit<HTMLMotionProps<"div">, "ref" | "children"> {
  children?: React.ReactNode;
  elevated?: boolean;
  interactive?: boolean;
}

export const MotionCard = forwardRef<HTMLDivElement, MotionCardProps>(function MotionCard(
  {
    className = "",
    elevated = false,
    interactive = false,
    children,
    whileHover,
    ...props
  },
  ref,
) {
  const shouldReduceMotion = useReducedMotion();

  return (
    <motion.div
      ref={ref}
      whileHover={
        shouldReduceMotion || !interactive
          ? undefined
          : whileHover ?? {
              y: -2,
              transition: { duration: 0.2, ease: "easeOut" },
            }
      }
      className={`rounded-xl border border-border-subtle bg-surface-glass backdrop-blur-md transition-shadow duration-200 ${
        elevated ? "shadow-surface" : ""
      } ${interactive ? "hover:border-border-strong hover:shadow-[0_0_20px_rgba(34,211,238,0.1)] cursor-pointer" : ""} ${className}`}
      {...props}
    >
      {children}
    </motion.div>
  );
});
