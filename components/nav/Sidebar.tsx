"use client";

import { useTranslations, useLocale } from "next-intl";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { Home, TrendingUp, FileText, Settings } from "lucide-react";

const tabs = [
  { key: "home", href: "/dashboard", icon: Home },
  { key: "trends", href: "/trends", icon: TrendingUp },
  { key: "reports", href: "/reports", icon: FileText },
  { key: "settings", href: "/settings", icon: Settings },
] as const;

export function Sidebar() {
  const t = useTranslations("nav");
  const pathname = usePathname();
  const locale = useLocale();

  return (
    <aside className="fixed top-0 start-0 hidden h-screen w-60 border-e border-surface bg-background/95 backdrop-blur-sm lg:flex lg:flex-col z-40">
      <div className="px-6 py-5">
        <h1 className="text-xl font-semibold text-text-primary">PensionView</h1>
      </div>
      <nav className="flex flex-col gap-1 px-3">
        {tabs.map(({ key, href, icon: Icon }) => {
          const fullHref = `/${locale}${href}`;
          const isActive = pathname.startsWith(fullHref);
          return (
            <Link
              key={key}
              href={fullHref}
              className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors cursor-pointer ${
                isActive
                  ? "bg-surface text-cta"
                  : "text-text-muted hover:bg-surface hover:text-text-primary"
              }`}
            >
              <Icon size={18} />
              <span>{t(key)}</span>
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
