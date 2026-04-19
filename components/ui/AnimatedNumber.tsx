"use client";
import { motion, useMotionValue, useTransform, animate } from "motion/react";
import { useEffect } from "react";

interface AnimatedNumberProps {
  value: number;
  format: (n: number) => string;
  duration?: number;
}

export function AnimatedNumber({ value, format, duration = 1.2 }: AnimatedNumberProps) {
  const motionValue = useMotionValue(0);
  const display = useTransform(motionValue, (latest) => format(Math.round(latest)));

  useEffect(() => {
    const controls = animate(motionValue, value, {
      duration,
      ease: [0.32, 0.72, 0, 1], // ease-out-cubic-ish
    });
    return () => controls.stop();
  }, [value, duration, motionValue]);

  return <motion.span>{display}</motion.span>;
}
