"use client";

import { useLocale } from "next-intl";
import Link from "next/link";
import { motion } from "motion/react";
import { Settings } from "lucide-react";
import { MemberSwitcher } from "@/components/members/MemberSwitcher";
import type { Member } from "@/lib/types";

interface TopBarProps {
  members: Member[];
}

export function TopBar({ members }: TopBarProps) {
  const locale = useLocale();

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
        <Link
          href={`/${locale}/settings`}
          className="flex min-h-[44px] min-w-[44px] items-center justify-center text-text-muted transition-colors hover:text-text-primary cursor-pointer"
        >
          <Settings size={22} />
        </Link>
      </div>
    </motion.header>
  );
}
