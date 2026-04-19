"use client";

import { useTranslations, useLocale } from "next-intl";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { motion } from "motion/react";
import { Home, TrendingUp, FileText } from "lucide-react";

const tabs = [
  { key: "home", href: "/dashboard", icon: Home },
  { key: "trends", href: "/trends", icon: TrendingUp },
  { key: "reports", href: "/reports", icon: FileText },
] as const;

export function BottomNav() {
  const t = useTranslations("nav");
  const pathname = usePathname();
  const locale = useLocale();

  return (
    <motion.nav
      initial={{ y: 60, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.4, ease: [0.32, 0.72, 0, 1], delay: 0.1 }}
      className="fixed bottom-0 start-0 end-0 z-50 border-t border-surface bg-background/95 backdrop-blur-sm lg:hidden"
    >
      <div className="mx-auto flex max-w-lg items-center justify-around py-2">
        {tabs.map(({ key, href, icon: Icon }) => {
          const fullHref = `/${locale}${href}`;
          const isActive = pathname.startsWith(fullHref);

          return (
            <Link
              key={key}
              href={fullHref}
              className={`relative flex min-h-[44px] min-w-[44px] flex-col items-center gap-1 px-4 py-1 transition-colors cursor-pointer ${
                isActive ? "text-cta" : "text-text-muted"
              }`}
            >
              {isActive && (
                <motion.div
                  layoutId="bottomnav-active"
                  className="absolute inset-x-2 inset-y-1 rounded-full bg-surface"
                  transition={{ type: "spring", stiffness: 380, damping: 30 }}
                />
              )}
              <span className="relative z-10 flex flex-col items-center gap-1">
                <motion.span
                  whileTap={{ scale: 0.85 }}
                  transition={{ type: "spring", stiffness: 500, damping: 30 }}
                  className="inline-flex"
                >
                  <Icon size={22} />
                </motion.span>
                <span className="text-xs">{t(key)}</span>
              </span>
            </Link>
          );
        })}
      </div>
    </motion.nav>
  );
}
