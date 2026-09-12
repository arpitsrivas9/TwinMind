"use client";

import React from "react";
import { motion, useReducedMotion } from "framer-motion";
import { pageTransitionVariants, reducedMotionVariants } from "../../lib/motion";

interface PageTransitionProps {
  children: React.ReactNode;
  className?: string;
  keyName?: string;
}

export function PageTransition({ children, className = "", keyName }: PageTransitionProps) {
  const shouldReduceMotion = useReducedMotion();
  const variants = shouldReduceMotion ? reducedMotionVariants : pageTransitionVariants;

  return (
    <motion.div
      key={keyName}
      variants={variants}
      initial="initial"
      animate="animate"
      exit="exit"
      className={`w-full ${className}`}
    >
      {children}
    </motion.div>
  );
}

