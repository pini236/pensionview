"use client";

import { motion, useReducedMotion } from "motion/react";

/**
 * Ambient animated background — subtle aurora / gradient mesh that slowly drifts
 * behind all app content. Pure CSS blobs, no canvas, very lightweight.
 *
 * Now with a 4th gold-tinted blob for warmth and a noise grain overlay so the
 * surfaces feel premium rather than flat.
 *
 * Respects `prefers-reduced-motion`: when reduced, the static blobs still
 * render (so the visual texture stays) but the drift/scale animations are
 * skipped.
 */
export function AnimatedBackground() {
  const reduced = useReducedMotion();

  return (
    <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      {/* Top-end blob (cta / green tint) */}
      <motion.div
        className="absolute -top-32 end-0 h-[500px] w-[500px] rounded-full bg-cta/10 blur-3xl"
        animate={
          reduced
            ? undefined
            : {
                x: [0, 60, -40, 0],
                y: [0, -30, 40, 0],
              }
        }
        transition={{ duration: 25, repeat: Infinity, ease: "easeInOut" }}
      />
      {/* Bottom-start blob (purple tint for variety) */}
      <motion.div
        className="absolute -bottom-32 start-0 h-[600px] w-[600px] rounded-full bg-fund-education/10 blur-3xl"
        animate={
          reduced
            ? undefined
            : {
                x: [0, -50, 60, 0],
                y: [0, 40, -30, 0],
              }
        }
        transition={{ duration: 30, repeat: Infinity, ease: "easeInOut" }}
      />
      {/* Center subtle blue */}
      <motion.div
        className="absolute top-1/2 start-1/2 h-[400px] w-[400px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-fund-pension/10 blur-3xl"
        animate={
          reduced
            ? undefined
            : { scale: [1, 1.15, 1], opacity: [0.3, 0.5, 0.3] }
        }
        transition={{ duration: 12, repeat: Infinity, ease: "easeInOut" }}
      />
      {/* Gold-tinted blob — adds warmth and a luxurious accent */}
      <motion.div
        className="absolute top-1/3 end-1/4 h-[450px] w-[450px] rounded-full blur-3xl"
        style={{ backgroundColor: "rgba(251, 191, 36, 0.08)" }}
        animate={
          reduced
            ? undefined
            : {
                x: [0, 40, -30, 0],
                y: [0, -50, 30, 0],
                scale: [1, 1.1, 0.95, 1],
              }
        }
        transition={{ duration: 28, repeat: Infinity, ease: "easeInOut" }}
      />
      {/* Noise grain overlay — premium texture */}
      <div
        className="absolute inset-0 opacity-[0.015]"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`,
        }}
      />
    </div>
  );
}
