"use client";

import { motion } from "motion/react";

/**
 * Ambient animated background — subtle aurora / gradient mesh that slowly drifts
 * behind all app content. Pure CSS blobs, no canvas, very lightweight.
 */
export function AnimatedBackground() {
  return (
    <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      {/* Top-end blob (cta / green tint) */}
      <motion.div
        className="absolute -top-32 end-0 h-[500px] w-[500px] rounded-full bg-cta/10 blur-3xl"
        animate={{
          x: [0, 60, -40, 0],
          y: [0, -30, 40, 0],
        }}
        transition={{ duration: 25, repeat: Infinity, ease: "easeInOut" }}
      />
      {/* Bottom-start blob (purple tint for variety) */}
      <motion.div
        className="absolute -bottom-32 start-0 h-[600px] w-[600px] rounded-full bg-fund-education/10 blur-3xl"
        animate={{
          x: [0, -50, 60, 0],
          y: [0, 40, -30, 0],
        }}
        transition={{ duration: 30, repeat: Infinity, ease: "easeInOut" }}
      />
      {/* Center subtle blue */}
      <motion.div
        className="absolute top-1/2 start-1/2 h-[400px] w-[400px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-fund-pension/10 blur-3xl"
        animate={{ scale: [1, 1.15, 1], opacity: [0.3, 0.5, 0.3] }}
        transition={{ duration: 12, repeat: Infinity, ease: "easeInOut" }}
      />
    </div>
  );
}
