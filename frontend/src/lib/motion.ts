import type { Variants, Transition } from "framer-motion";

/**
 * Standard TwinMind Cognitive Motion Tokens
 */
export const MOTION_DURATIONS = {
  instant: 0,
  fast: 0.18,
  normal: 0.28,
  cinematic: 0.42,
  ambient: 6.0,
} as const;

export const MOTION_EASINGS = {
  easeOutCubic: [0.215, 0.61, 0.355, 1] as const,
  easeInOutCubic: [0.645, 0.045, 0.355, 1] as const,
  springResponsive: { type: "spring", stiffness: 420, damping: 30 } satisfies Transition,
  springGentle: { type: "spring", stiffness: 220, damping: 25 } satisfies Transition,
  springSnappy: { type: "spring", stiffness: 500, damping: 35 } satisfies Transition,
};

/**
 * Global Page Transition Variant
 * Fast, subtle fade + 6px translateY + micro-scale
 */
export const pageTransitionVariants: Variants = {
  initial: {
    opacity: 0,
    y: 8,
    scale: 0.995,
  },
  animate: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: {
      duration: MOTION_DURATIONS.normal,
      ease: [0.215, 0.61, 0.355, 1],
    },
  },
  exit: {
    opacity: 0,
    y: -6,
    scale: 0.995,
    transition: {
      duration: 0.2,
      ease: "easeIn",
    },
  },
};

/**
 * Subtle Fade In Variant
 */
export const fadeInVariants: Variants = {
  initial: { opacity: 0 },
  animate: {
    opacity: 1,
    transition: { duration: MOTION_DURATIONS.normal, ease: "easeOut" },
  },
  exit: {
    opacity: 0,
    transition: { duration: MOTION_DURATIONS.fast, ease: "easeIn" },
  },
};

/**
 * Gentle Upward Entrance Variant
 */
export const fadeUpVariants: Variants = {
  initial: { opacity: 0, y: 12 },
  animate: {
    opacity: 1,
    y: 0,
    transition: {
      duration: MOTION_DURATIONS.cinematic,
      ease: [0.215, 0.61, 0.355, 1],
    },
  },
  exit: {
    opacity: 0,
    y: 8,
    transition: { duration: MOTION_DURATIONS.fast, ease: "easeIn" },
  },
};

/**
 * Smooth Scale-In Variant
 */
export const scaleInVariants: Variants = {
  initial: { opacity: 0, scale: 0.95 },
  animate: {
    opacity: 1,
    scale: 1,
    transition: {
      duration: MOTION_DURATIONS.normal,
      ease: [0.215, 0.61, 0.355, 1],
    },
  },
  exit: {
    opacity: 0,
    scale: 0.95,
    transition: { duration: MOTION_DURATIONS.fast, ease: "easeIn" },
  },
};

/**
 * Stagger Container & Items
 * Delays each item by 45-60ms for a synchronized neural cascade
 */
export const staggerContainerVariants: Variants = {
  initial: {},
  animate: {
    transition: {
      staggerChildren: 0.05,
      delayChildren: 0.02,
    },
  },
};

export const staggerItemVariants: Variants = {
  initial: { opacity: 0, y: 10 },
  animate: {
    opacity: 1,
    y: 0,
    transition: {
      duration: MOTION_DURATIONS.normal,
      ease: [0.215, 0.61, 0.355, 1],
    },
  },
};

/**
 * Modal Dialog & Drawer Variants
 */
export const modalBackdropVariants: Variants = {
  initial: { opacity: 0 },
  animate: {
    opacity: 1,
    transition: { duration: 0.22, ease: "easeOut" },
  },
  exit: {
    opacity: 0,
    transition: { duration: 0.18, ease: "easeIn" },
  },
};

export const modalCardVariants: Variants = {
  initial: { opacity: 0, scale: 0.96, y: 10 },
  animate: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: {
      duration: 0.26,
      ease: [0.16, 1, 0.3, 1],
    },
  },
  exit: {
    opacity: 0,
    scale: 0.96,
    y: 8,
    transition: { duration: 0.18, ease: "easeIn" },
  },
};

export const drawerSlideVariants: Variants = {
  initial: { x: "-100%", opacity: 0.5 },
  animate: {
    x: 0,
    opacity: 1,
    transition: {
      type: "spring",
      stiffness: 380,
      damping: 32,
    },
  },
  exit: {
    x: "-100%",
    opacity: 0,
    transition: { duration: 0.2, ease: "easeIn" },
  },
};

/**
 * Micro-Interaction Hover & Tap Physics
 */
export const buttonMotionProps = {
  whileHover: { y: -1, transition: { duration: 0.15, ease: "easeOut" } },
  whileTap: { scale: 0.97, transition: { duration: 0.1, ease: "easeIn" } },
};

export const cardMotionProps = {
  whileHover: { y: -2, transition: { duration: 0.2, ease: "easeOut" } },
};

/**
 * Reduced Motion Fallback Variants (instant opacity with zero displacement)
 */
export const reducedMotionVariants: Variants = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: { duration: 0.1 } },
  exit: { opacity: 0, transition: { duration: 0.1 } },
};

/**
 * Voice HUD and Audio Waveform Variants
 */
export const voiceOverlayVariants: Variants = {
  initial: { opacity: 0, scale: 0.96 },
  animate: {
    opacity: 1,
    scale: 1,
    transition: {
      duration: MOTION_DURATIONS.cinematic,
      ease: [0.16, 1, 0.3, 1],
    },
  },
  exit: {
    opacity: 0,
    scale: 0.96,
    transition: { duration: MOTION_DURATIONS.fast, ease: "easeIn" },
  },
};

export const voiceWaveformVariants: Variants = {
  idle: { scaleY: 0.3, opacity: 0.4 },
  listening: {
    scaleY: [0.3, 1.2, 0.4, 1.5, 0.3],
    opacity: [0.6, 1, 0.7, 1, 0.6],
    transition: {
      repeat: Infinity,
      duration: 1.2,
      ease: "easeInOut",
    },
  },
  speaking: {
    scaleY: [0.4, 1.8, 0.6, 2.0, 0.5],
    opacity: [0.8, 1, 0.9, 1, 0.8],
    transition: {
      repeat: Infinity,
      duration: 0.8,
      ease: "easeInOut",
    },
  },
  interrupted: {
    scaleY: 0.2,
    opacity: 0.3,
    transition: { duration: 0.15 },
  },
};


