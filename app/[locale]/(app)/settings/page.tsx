"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useTheme } from "next-themes";
import { useRouter, usePathname } from "next/navigation";
import { Globe, Mail, Sun, Moon } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export default function SettingsPage() {
  const t = useTranslations("settings");
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [gmailConnected, setGmailConnected] = useState<boolean | null>(null);

  useEffect(() => {
    setMounted(true);
    const checkConnection = async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user?.email) return;

      const { data } = await supabase.from("profiles")
        .select("google_access_token")
        .eq("email", user.email)
        .single();

      setGmailConnected(!!data?.google_access_token);
    };
    checkConnection();
  }, []);

  function switchLanguage(newLocale: "he" | "en") {
    const newPath = pathname.replace(/^\/(he|en)/, `/${newLocale}`);
    router.push(newPath);
  }

  function connectGmail() {
    window.location.href = "/api/auth/google/connect";
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-text-primary">{t("language") === "Language" ? "Settings" : "הגדרות"}</h1>

      <section className="rounded-xl bg-surface p-4">
        <div className="mb-3 flex items-center gap-2 text-sm font-medium text-text-primary">
          <Globe size={18} className="text-text-muted" />
          {t("language")}
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => switchLanguage("he")}
            className={`rounded-lg px-4 py-2 text-sm transition-colors cursor-pointer ${
              locale === "he" ? "bg-cta text-background" : "bg-background text-text-muted hover:text-text-primary"
            }`}
          >
            עברית
          </button>
          <button
            onClick={() => switchLanguage("en")}
            className={`rounded-lg px-4 py-2 text-sm transition-colors cursor-pointer ${
              locale === "en" ? "bg-cta text-background" : "bg-background text-text-muted hover:text-text-primary"
            }`}
          >
            English
          </button>
        </div>
      </section>

      <section className="rounded-xl bg-surface p-4">
        <div className="mb-3 flex items-center gap-2 text-sm font-medium text-text-primary">
          {mounted && theme === "dark" ? <Moon size={18} className="text-text-muted" /> : <Sun size={18} className="text-text-muted" />}
          {t("theme")}
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setTheme("dark")}
            className={`rounded-lg px-4 py-2 text-sm transition-colors cursor-pointer ${
              mounted && theme === "dark" ? "bg-cta text-background" : "bg-background text-text-muted hover:text-text-primary"
            }`}
          >
            {t("dark")}
          </button>
          <button
            onClick={() => setTheme("light")}
            className={`rounded-lg px-4 py-2 text-sm transition-colors cursor-pointer ${
              mounted && theme === "light" ? "bg-cta text-background" : "bg-background text-text-muted hover:text-text-primary"
            }`}
          >
            {t("light")}
          </button>
        </div>
      </section>

      <section className="rounded-xl bg-surface p-4">
        <div className="mb-3 flex items-center gap-2 text-sm font-medium text-text-primary">
          <Mail size={18} className="text-text-muted" />
          Gmail
        </div>
        {gmailConnected === null ? (
          <p className="text-sm text-text-muted">...</p>
        ) : gmailConnected ? (
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-gain" />
            <span className="text-sm text-text-primary">{t("connected")}</span>
            <button
              onClick={connectGmail}
              className="ms-auto text-sm text-text-muted hover:text-text-primary cursor-pointer"
            >
              {t("connectGmail")}
            </button>
          </div>
        ) : (
          <button
            onClick={connectGmail}
            className="rounded-lg bg-cta px-4 py-2 text-sm font-medium text-background hover:opacity-90 cursor-pointer"
          >
            {t("connectGmail")}
          </button>
        )}
      </section>
    </div>
  );
}
