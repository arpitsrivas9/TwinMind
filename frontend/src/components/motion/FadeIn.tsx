"use client";

import React from "react";
import { motion, useReducedMotion, HTMLMotionProps } from "framer-motion";
import { fadeInVariants, reducedMotionVariants } from "../../lib/motion";

interface FadeInProps extends Omit<HTMLMotionProps<"div">, "children"> {
  children: React.ReactNode;
  delay?: number;
}

export function FadeIn({ children, delay = 0, className = "", ...props }: FadeInProps) {
  const shouldReduceMotion = useReducedMotion();
  const variants = shouldReduceMotion ? reducedMotionVariants : fadeInVariants;

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
