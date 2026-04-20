"use client";
import Link from "next/link";
import { motion } from "motion/react";
import { Upload, Mail, Sparkles } from "lucide-react";
import { useLocale } from "next-intl";

export function NoReportsState({ memberName }: { memberName?: string }) {
  const locale = useLocale();
  const isHebrew = locale === "he";
  const greeting = memberName ? (isHebrew ? `שלום ${memberName}` : `Hi ${memberName}`) : null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="mx-auto max-w-md py-12 text-center"
    >
      <div className="relative mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-2xl bg-surface">
        <motion.div
          className="absolute inset-0 rounded-2xl"
          style={{
            background:
              "conic-gradient(from 0deg, transparent 0%, rgba(34,197,94,0.4) 25%, transparent 50%, rgba(251,191,36,0.3) 75%, transparent 100%)",
          }}
          animate={{ rotate: 360 }}
          transition={{ duration: 8, repeat: Infinity, ease: "linear" }}
        />
        <div className="relative flex h-full w-full items-center justify-center rounded-2xl bg-surface">
          <Sparkles className="h-8 w-8 text-cta" />
        </div>
      </div>

      {greeting && <p className="mb-1 text-sm text-text-muted">{greeting}</p>}
      <h2 className="text-2xl font-semibold text-text-primary">
        {isHebrew ? "מתחילים לעקוב" : "Let's get started"}
      </h2>
      <p className="mt-3 text-sm leading-relaxed text-text-muted">
        {isHebrew
          ? "הוסף את הדוח החודשי הראשון שלך כדי להתחיל לראות את התובנות"
          : "Upload your first monthly report to start seeing insights"}
      </p>

      <div className="mt-6 flex flex-col items-stretch gap-2">
        <Link
          href={`/${locale}/admin/backfill`}
          className="group flex items-center justify-center gap-2 rounded-lg bg-cta px-6 py-3 font-medium text-background transition-opacity hover:opacity-90 cursor-pointer"
        >
          <Upload className="h-4 w-4 transition-transform group-hover:-translate-y-0.5" />
          {isHebrew ? "טען דוחות" : "Upload reports"}
        </Link>
        <Link
          href={`/${locale}/settings`}
          className="flex items-center justify-center gap-2 rounded-lg bg-surface px-6 py-3 font-medium text-text-primary transition-colors hover:bg-surface-hover cursor-pointer"
        >
          <Mail className="h-4 w-4" />
          {isHebrew ? "חבר Gmail לעדכון אוטומטי" : "Connect Gmail for auto-updates"}
        </Link>
      </div>

      <p className="mt-6 text-xs text-text-muted">
        {isHebrew
          ? "PDF מהסוכן שלך? אנחנו נחלץ הכל תוך שניות."
          : "PDF from your insurance agent? We extract everything in seconds."}
      </p>
    </motion.div>
  );
}
