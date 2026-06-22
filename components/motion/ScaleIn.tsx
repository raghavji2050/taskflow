"use client";

import { motion } from "motion/react";
import { useReducedMotion } from "./MotionProvider";

interface ScaleInProps {
  children: React.ReactNode;
  className?: string;
}

export function ScaleIn({ children, className }: ScaleInProps) {
  const reducedMotion = useReducedMotion();

  if (reducedMotion) {
    return <div className={className}>{children}</div>;
  }

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.96 }}
      transition={{ type: "spring", stiffness: 400, damping: 30 }}
      className={className}
    >
      {children}
    </motion.div>
  );
}
