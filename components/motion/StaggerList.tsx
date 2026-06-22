"use client";

import { motion } from "motion/react";
import { useReducedMotion } from "./MotionProvider";

interface StaggerListProps {
  children: React.ReactNode;
  className?: string;
  stagger?: number;
}

export function StaggerList({ children, className, stagger = 0.05 }: StaggerListProps) {
  const reducedMotion = useReducedMotion();

  if (reducedMotion) {
    return <div className={className}>{children}</div>;
  }

  return (
    <motion.div
      initial="hidden"
      animate="visible"
      variants={{
        hidden: {},
        visible: { transition: { staggerChildren: stagger } },
      }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

export function StaggerItem({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const reducedMotion = useReducedMotion();

  if (reducedMotion) {
    return <div className={className}>{children}</div>;
  }

  return (
    <motion.div
      variants={{
        hidden: { opacity: 0, y: 6 },
        visible: { opacity: 1, y: 0, transition: { duration: 0.2 } },
      }}
      className={className}
    >
      {children}
    </motion.div>
  );
}
