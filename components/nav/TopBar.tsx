"use client";

import { motion } from "motion/react";
import { MemberSwitcher } from "@/components/members/MemberSwitcher";
import type { Member } from "@/lib/types";

interface TopBarProps {
  members: Member[];
}

export function TopBar({ members }: TopBarProps) {
  return (
    <motion.header
      initial={{ y: -56, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.4, ease: [0.32, 0.72, 0, 1] }}
      className="fixed top-0 start-0 end-0 z-50 border-b border-surface bg-background/95 backdrop-blur-sm lg:hidden"
    >
      <div className="mx-auto flex max-w-lg items-center justify-between gap-3 px-4 py-3">
        <div className="min-w-0 flex-1">
          <MemberSwitcher members={members} variant="compact" />
        </div>
      </div>
    </motion.header>
  );
}
