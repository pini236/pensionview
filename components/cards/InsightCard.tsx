"use client";

import { motion } from "motion/react";
import { Sparkles } from "lucide-react";

interface InsightCardProps {
  text: string;
  label: string;
}

/**
 * AI insight surface with an animated rotating conic-gradient border. The
 * border rotates slowly (8s loop) so the card feels alive without distracting
 * from the text inside.
 */
export function InsightCard({ text, label }: InsightCardProps) {
  return (
    <div className="relative h-full overflow-hidden rounded-xl p-[1px]">
      {/* Animated rotating gradient border */}
      <motion.div
        className="absolute inset-[-50%]"
        style={{
          background:
            "conic-gradient(from 0deg, transparent 0%, rgba(34, 197, 94, 0.5) 25%, transparent 50%, rgba(251, 191, 36, 0.4) 75%, transparent 100%)",
        }}
        animate={{ rotate: 360 }}
        transition={{ duration: 8, repeat: Infinity, ease: "linear" }}
      />
      <div className="relative h-full rounded-xl bg-surface p-4">
        <div className="mb-2 flex items-center gap-2 text-sm text-gain min-w-0">
          <Sparkles size={16} className="flex-shrink-0" />
          <span className="font-medium truncate">{label}</span>
        </div>
        <p className="text-sm leading-relaxed text-text-primary break-words">{text}</p>
      </div>
    </div>
  );
}
