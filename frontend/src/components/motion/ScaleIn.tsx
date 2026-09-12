"use client";

import React from "react";
import { motion, useReducedMotion, HTMLMotionProps } from "framer-motion";
import { scaleInVariants, reducedMotionVariants } from "../../lib/motion";

interface ScaleInProps extends Omit<HTMLMotionProps<"div">, "children"> {
  children: React.ReactNode;
  delay?: number;
}

export function ScaleIn({ children, delay = 0, className = "", ...props }: ScaleInProps) {
  const shouldReduceMotion = useReducedMotion();
  const variants = shouldReduceMotion ? reducedMotionVariants : scaleInVariants;

  return (
    <motion.div
      variants={variants}
      initial="initial"
      animate="animate"
      exit="exit"
      transition={{ delay }}
      className={className}
      {...props}
    >
      {children}
    </motion.div>
  );
}
