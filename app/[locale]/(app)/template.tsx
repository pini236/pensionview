"use client";

import { motion } from "motion/react";

/**
 * Re-runs on every navigation (unlike layout.tsx) — gives every route change a
 * smooth fade + slight upward slide so transitions feel premium.
 */
export default function Template({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.32, 0.72, 0, 1] }}
    >
      {children}
    </motion.div>
  );
}
