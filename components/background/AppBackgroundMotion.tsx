"use client";

import { motion, useReducedMotion } from "motion/react";
import { useEffect, useState } from "react";

/**
 * Three-layer luxurious ambient background mounted once per app session.
 *
 *   Layer 1 — Aurora: 3 large drifting radial gradients (cta, deep teal,
 *             midnight indigo). Slow morphing atmosphere at low opacity.
 *   Layer 2 — Orbs: 4 floating SVG circles with soft radial-gradient fills,
 *             drifting on independent 25–45s loops.
 *   Layer 3 — Growth line: a single bezier path that periodically draws
 *             itself across the bottom third (savings growth metaphor),
 *             then fades and resets with a slightly different curve.
 *
 * Respects `prefers-reduced-motion` — when reduced, the static SVG layout
 * still renders so the texture stays, but no animations run.
 *
 * Pure decoration: `aria-hidden`, `pointer-events: none`, `z-index: -10`,
 * never receives focus, contributes no a11y tree nodes.
 */
export function AppBackgroundMotion() {
  const reduced = useReducedMotion();

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 -z-10 overflow-hidden"
    >
      <AuroraLayer reduced={!!reduced} />
      <OrbsLayer reduced={!!reduced} />
      <GrowthLineLayer reduced={!!reduced} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Layer 1 — Aurora gradients
// ---------------------------------------------------------------------------

function AuroraLayer({ reduced }: { reduced: boolean }) {
  // Large radial gradients in deep saturated colors. Each one drifts on its
  // own slow timeline (mismatched durations avoid synchronized "pulses").
  const blobs: Array<{
    style: React.CSSProperties;
    animate: { x: number[]; y: number[] };
    duration: number;
  }> = [
    {
      // cta accent — green-leaning glow at top-end
      style: {
        top: "-20%",
        right: "-10%",
        width: "60vmax",
        height: "60vmax",
        background:
          "radial-gradient(circle at 30% 30%, rgba(34,197,94,0.18), rgba(34,197,94,0) 60%)",
      },
      animate: { x: [0, 40, -30, 0], y: [0, 30, -20, 0] },
      duration: 38,
    },
    {
      // deep teal/cyan complement, bottom-start
      style: {
        bottom: "-25%",
        left: "-15%",
        width: "65vmax",
        height: "65vmax",
        background:
          "radial-gradient(circle at 60% 40%, rgba(6,182,212,0.16), rgba(6,182,212,0) 65%)",
      },
      animate: { x: [0, -50, 30, 0], y: [0, -40, 20, 0] },
      duration: 52,
    },
    {
      // midnight indigo, mid-screen
      style: {
        top: "20%",
        left: "30%",
        width: "55vmax",
        height: "55vmax",
        background:
          "radial-gradient(circle at 50% 50%, rgba(99,102,241,0.14), rgba(99,102,241,0) 60%)",
      },
      animate: { x: [0, 30, -40, 0], y: [0, -30, 40, 0] },
      duration: 46,
    },
  ];

  return (
    <div className="absolute inset-0">
      {blobs.map((b, i) => (
        <motion.div
          key={i}
          className="absolute rounded-full blur-3xl"
          style={b.style}
          animate={reduced ? undefined : b.animate}
          transition={
            reduced
              ? undefined
              : { duration: b.duration, repeat: Infinity, ease: "easeInOut" }
          }
        />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Layer 2 — Floating soft orbs
// ---------------------------------------------------------------------------

interface OrbSpec {
  size: number;
  startX: number;
  startY: number;
  color: string;
  duration: number;
  drift: { x: number[]; y: number[] };
}

function OrbsLayer({ reduced }: { reduced: boolean }) {
  // Random orb specs are computed once on mount (in an effect) so render
  // stays pure and SSR/CSR markup matches before the orbs hydrate.
  const [orbs, setOrbs] = useState<OrbSpec[]>([]);
  useEffect(() => {
    const palette = [
      "rgba(34,197,94,0.35)", // cta green
      "rgba(167,139,250,0.32)", // soft purple
      "rgba(6,182,212,0.30)", // teal
      "rgba(251,191,36,0.28)", // warm amber
    ];
    setOrbs(
      Array.from({ length: 4 }).map((_, i) => ({
        size: 80 + Math.round(Math.random() * 140),
        duration: 25 + Math.random() * 20,
        startX: Math.round(Math.random() * 90),
        startY: Math.round(Math.random() * 90),
        color: palette[i % palette.length],
        drift: {
          x: [0, Math.round(Math.random() * 120) - 60, Math.round(Math.random() * 120) - 60, 0],
          y: [0, Math.round(Math.random() * 120) - 60, Math.round(Math.random() * 120) - 60, 0],
        },
      }))
    );
  }, []);

  return (
    <div className="absolute inset-0">
      {orbs.map((orb, i) => (
        <motion.svg
          key={i}
          className="absolute"
          style={{
            left: `${orb.startX}%`,
            top: `${orb.startY}%`,
            width: orb.size,
            height: orb.size,
            opacity: 0.55,
          }}
          width={orb.size}
          height={orb.size}
          viewBox="0 0 100 100"
          animate={reduced ? undefined : orb.drift}
          transition={
            reduced
              ? undefined
              : {
                  duration: orb.duration,
                  repeat: Infinity,
                  repeatType: "mirror",
                  ease: "easeInOut",
                }
          }
        >
          <defs>
            <radialGradient id={`orb-${i}`} cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor={orb.color} stopOpacity="1" />
              <stop offset="60%" stopColor={orb.color} stopOpacity="0.4" />
              <stop offset="100%" stopColor={orb.color} stopOpacity="0" />
            </radialGradient>
          </defs>
          <circle cx="50" cy="50" r="50" fill={`url(#orb-${i})`} />
        </motion.svg>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Layer 3 — Growth-line trace
// ---------------------------------------------------------------------------

function buildCurve(): string {
  // Curve lives in the bottom third of a 100×100 viewBox: starts at the
  // bottom-left and trends toward the top-right. Control points are
  // randomized within tight bands so each iteration feels organic but never
  // dips off-canvas.
  const startY = 92;
  const endY = 60 + Math.random() * 12; // 60–72
  const c1x = 25 + Math.random() * 10; // 25–35
  const c1y = 80 + Math.random() * 8; // 80–88
  const c2x = 60 + Math.random() * 10; // 60–70
  const c2y = 65 + Math.random() * 10; // 65–75
  return `M 0 ${startY} C ${c1x} ${c1y}, ${c2x} ${c2y}, 100 ${endY}`;
}

function GrowthLineLayer({ reduced }: { reduced: boolean }) {
  // Each iteration we generate a new curve in an effect (Math.random is
  // impure — it must not run during render). `iteration` is bumped via a
  // setTimeout that mirrors the full draw → hold → fade cycle.
  const [iteration, setIteration] = useState(0);
  const [path, setPath] = useState<string | null>(null);

  useEffect(() => {
    setPath(buildCurve());
    if (reduced) return;
    const total = (25 + 5 + 3) * 1000;
    const timer = window.setTimeout(() => setIteration((n) => n + 1), total);
    return () => window.clearTimeout(timer);
  }, [iteration, reduced]);

  if (!path) return null;

  return (
    <svg
      className="absolute inset-x-0 bottom-0 h-1/3 w-full"
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
    >
      <motion.path
        key={iteration}
        d={path}
        stroke="var(--color-gain)"
        strokeWidth="0.4"
        strokeLinecap="round"
        fill="none"
        opacity={0.18}
        initial={reduced ? { pathLength: 1, opacity: 0.18 } : { pathLength: 0, opacity: 0.18 }}
        animate={
          reduced
            ? undefined
            : {
                pathLength: [0, 1, 1, 1],
                opacity: [0.18, 0.18, 0.18, 0],
              }
        }
        transition={
          reduced
            ? undefined
            : {
                duration: 33, // 25 draw + 5 hold + 3 fade
                times: [0, 25 / 33, 30 / 33, 1],
                ease: "easeOut",
              }
        }
      />
    </svg>
  );
}
