"use client";

import { motion } from "motion/react";
import { useReducedMotion } from "./MotionProvider";

interface PressableProps {
  children: React.ReactNode;
  className?: string;
}

export function Pressable({ children, className }: PressableProps) {
  const reducedMotion = useReducedMotion();

  if (reducedMotion) {
    return <div className={className}>{children}</div>;
  }

  return (
    <motion.div
      whileTap={{ scale: 0.98 }}
      transition={{ duration: 0.1 }}
      className={className}
    >
      {children}
    </motion.div>
  );
}
