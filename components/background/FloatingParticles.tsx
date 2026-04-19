"use client";

import { motion } from "motion/react";
import { useEffect, useMemo, useState } from "react";

/**
 * Tiny dots that float up across the viewport like champagne bubbles. Purely
 * decorative — `pointer-events-none` and behind everything.
 *
 * SSR safe: positions and viewport height are only computed after mount.
 */
export function FloatingParticles({ count = 12 }: { count?: number }) {
  const [mounted, setMounted] = useState(false);
  const [viewportHeight, setViewportHeight] = useState(1000);

  useEffect(() => {
    setMounted(true);
    setViewportHeight(window.innerHeight);

    function onResize() {
      setViewportHeight(window.innerHeight);
    }
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // Stable per-mount positions so the particles don't all share the same path.
  const particles = useMemo(
    () =>
      Array.from({ length: count }).map((_, i) => ({
        id: i,
        x: Math.random() * 100,
        delay: Math.random() * 20,
        duration: 18 + Math.random() * 12,
        size: 2 + Math.random() * 3,
      })),
    [count]
  );

  if (!mounted) return null;

  const travel = -viewportHeight * 1.2;

  return (
    <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      {particles.map((p) => (
        <motion.span
          key={p.id}
          className="absolute rounded-full"
          style={{
            left: `${p.x}%`,
            bottom: -10,
            width: p.size,
            height: p.size,
            backgroundColor: "rgba(255, 255, 255, 0.15)",
          }}
          animate={{
            y: [0, travel],
            opacity: [0, 0.6, 0.6, 0],
          }}
          transition={{
            duration: p.duration,
            delay: p.delay,
            repeat: Infinity,
            ease: "linear",
          }}
        />
      ))}
    </div>
  );
}
