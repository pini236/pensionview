"use client";

import { useTranslations, useLocale } from "next-intl";
import { usePathname } from "next/navigation";
import Link from "next/link";
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
    <nav className="fixed bottom-0 start-0 end-0 z-50 border-t border-surface bg-background/95 backdrop-blur-sm lg:hidden">
      <div className="mx-auto flex max-w-lg items-center justify-around py-2">
        {tabs.map(({ key, href, icon: Icon }) => {
          const fullHref = `/${locale}${href}`;
          const isActive = pathname.startsWith(fullHref);

          return (
            <Link
              key={key}
              href={fullHref}
              className={`flex min-h-[44px] min-w-[44px] flex-col items-center gap-1 px-4 py-1 transition-colors cursor-pointer ${
                isActive ? "text-cta" : "text-text-muted"
              }`}
            >
              <Icon size={22} />
              <span className="text-xs">{t(key)}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
