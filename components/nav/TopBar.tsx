"use client";

import { useLocale } from "next-intl";
import Link from "next/link";
import { Settings } from "lucide-react";

export function TopBar() {
  const locale = useLocale();

  return (
    <header className="fixed top-0 start-0 end-0 z-50 border-b border-surface bg-background/95 backdrop-blur-sm lg:hidden">
      <div className="mx-auto flex max-w-lg items-center justify-between px-4 py-3">
        <h1 className="text-lg font-semibold text-text-primary">PensionView</h1>
        <Link
          href={`/${locale}/settings`}
          className="flex min-h-[44px] min-w-[44px] items-center justify-center text-text-muted transition-colors hover:text-text-primary cursor-pointer"
        >
          <Settings size={22} />
        </Link>
      </div>
    </header>
  );
}
