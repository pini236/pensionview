"use client";

import { motion, type HTMLMotionProps } from "motion/react";
import { clsx } from "clsx";
import { forwardRef, type ReactNode } from "react";

interface ButtonProps extends HTMLMotionProps<"button"> {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md" | "lg";
}

const base =
  "relative inline-flex items-center justify-center overflow-hidden rounded-lg font-medium transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed";

const variants: Record<NonNullable<ButtonProps["variant"]>, string> = {
  primary: "bg-gradient-to-br from-cta to-[#16a34a] text-background hover:opacity-95",
  secondary: "bg-surface text-text-primary hover:bg-surface-hover",
  ghost: "text-text-muted hover:text-text-primary hover:bg-surface",
  danger: "bg-gradient-to-br from-danger to-[#B91C1C] text-white hover:opacity-95",
};

const sizes: Record<NonNullable<ButtonProps["size"]>, string> = {
  sm: "px-3 py-1.5 text-xs",
  md: "px-4 py-2 text-sm",
  lg: "px-6 py-3 text-sm",
};

const buttonVariants = {
  rest: { scale: 1 },
  hover: { scale: 1.02 },
  tap: { scale: 0.97 },
};

const shineVariants = {
  rest: { x: "-100%" },
  hover: { x: "100%" },
  tap: { x: "100%" },
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "primary", size = "md", className, children, ...props },
  ref
) {
  return (
    <motion.button
      ref={ref}
      initial="rest"
      animate="rest"
      whileHover="hover"
      whileTap="tap"
      variants={buttonVariants}
      transition={{ type: "spring", stiffness: 500, damping: 30 }}
      className={clsx(base, variants[variant], sizes[size], className)}
      {...props}
    >
      <motion.span
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent"
        variants={shineVariants}
        transition={{ duration: 0.6, ease: "easeOut" }}
      />
      <span className="relative z-10 inline-flex items-center justify-center">{children as ReactNode}</span>
    </motion.button>
  );
});
