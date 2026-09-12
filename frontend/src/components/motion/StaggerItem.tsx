"use client";

import React from "react";
import { motion, useReducedMotion, HTMLMotionProps } from "framer-motion";
import { staggerItemVariants, reducedMotionVariants } from "../../lib/motion";

interface StaggerItemProps extends Omit<HTMLMotionProps<"div">, "children"> {
  children: React.ReactNode;
}

export function StaggerItem({ children, className = "", ...props }: StaggerItemProps) {
  const shouldReduceMotion = useReducedMotion();
  const variants = shouldReduceMotion ? reducedMotionVariants : staggerItemVariants;

  return (
    <motion.div variants={variants} className={className} {...props}>
      {children}
    </motion.div>
  );
}
