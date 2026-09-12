"use client";

import React from "react";
import { motion, useReducedMotion, HTMLMotionProps } from "framer-motion";
import { staggerContainerVariants, reducedMotionVariants } from "../../lib/motion";

interface StaggerContainerProps extends Omit<HTMLMotionProps<"div">, "children"> {
  children: React.ReactNode;
  staggerDelay?: number;
}

export function StaggerContainer({
  children,
  staggerDelay = 0.05,
  className = "",
  ...props
}: StaggerContainerProps) {
  const shouldReduceMotion = useReducedMotion();

  const variants = shouldReduceMotion
    ? reducedMotionVariants
    : {
        ...staggerContainerVariants,
        animate: {
          transition: {
            staggerChildren: staggerDelay,
            delayChildren: 0.02,
          },
        },
      };

  return (
    <motion.div
      variants={variants}
      initial="initial"
      animate="animate"
      className={className}
      {...props}
    >
      {children}
    </motion.div>
  );
}
