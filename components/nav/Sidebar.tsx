"use client";

import { useTranslations, useLocale } from "next-intl";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { motion } from "motion/react";
import { Home, TrendingUp, FileText, Settings } from "lucide-react";
import { MemberSwitcher } from "@/components/members/MemberSwitcher";
import type { Member } from "@/lib/types";

const tabs = [
  { key: "home", href: "/dashboard", icon: Home },
  { key: "trends", href: "/trends", icon: TrendingUp },
  { key: "reports", href: "/reports", icon: FileText },
  { key: "settings", href: "/settings", icon: Settings },
] as const;

interface SidebarProps {
  members: Member[];
}

export function Sidebar({ members }: SidebarProps) {
  const t = useTranslations("nav");
  const pathname = usePathname();
  const locale = useLocale();

  return (
    <aside className="fixed top-0 start-0 hidden h-screen w-60 border-e border-surface bg-background/95 backdrop-blur-sm lg:flex lg:flex-col z-40">
      <motion.div
        initial={{ opacity: 0, scale: 0.92 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.45, ease: [0.32, 0.72, 0, 1] }}
        className="px-4 py-5"
      >
        <h1 className="px-2 text-base font-semibold text-text-primary mb-3">
          PensionView
        </h1>
        <MemberSwitcher members={members} variant="full" />
      </motion.div>
      <nav className="flex flex-col gap-1 px-3">
        {tabs.map(({ key, href, icon: Icon }) => {
          const fullHref = `/${locale}${href}`;
          const isActive = pathname.startsWith(fullHref);
          return (
            <motion.div
              key={key}
              whileHover={{ x: 2 }}
              transition={{ type: "spring", stiffness: 400, damping: 30 }}
            >
              <Link
                href={fullHref}
                className={`relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors cursor-pointer ${
                  isActive
                    ? "text-cta"
                    : "text-text-muted hover:text-text-primary"
                }`}
              >
                {isActive && (
                  <motion.div
                    layoutId="sidebar-active"
                    className="absolute inset-0 rounded-lg bg-surface"
                    transition={{ type: "spring", stiffness: 380, damping: 30 }}
                  />
                )}
                <span className="relative z-10 flex items-center gap-3">
                  <Icon size={18} />
                  <span>{t(key)}</span>
                </span>
              </Link>
            </motion.div>
          );
        })}
      </nav>
    </aside>
  );
}
