"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { motion, AnimatePresence } from "motion/react";
import { ExternalLink, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { formatCurrency } from "@/lib/format";

type Phase = "confirm" | "drive_failed" | "submitting";

interface DeleteReportDialogProps {
  reportId: string;
  reportDate: string;
  totalSavings: number;
  ownerName?: string | null;
  onClose: () => void;
  onDeleted?: () => void;
}

export function DeleteReportDialog({
  reportId,
  reportDate,
  totalSavings,
  ownerName,
  onClose,
  onDeleted,
}: DeleteReportDialogProps) {
  const t = useTranslations("reports.delete");
  const locale = useLocale();
  const fullLocale = locale === "he" ? "he-IL" : "en-IL";
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement | null>(null);

  const [phase, setPhase] = useState<Phase>("confirm");
  const [error, setError] = useState<string | null>(null);
  const [driveUrl, setDriveUrl] = useState<string | null>(null);

  // Esc to close
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && phase !== "submitting") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose, phase]);

  // Lock body scroll while open
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  const dateLabel = new Date(reportDate).toLocaleDateString(fullLocale, {
    month: "long",
    year: "numeric",
  });

  async function handleConfirm() {
    setError(null);
    setPhase("submitting");
    try {
      const res = await fetch(`/api/reports/${reportId}`, { method: "DELETE" });
      // 404 is treated as success — the report is already gone from someone's POV.
      if (res.status === 404) {
        onDeleted?.();
        onClose();
        return;
      }
      if (!res.ok) {
        setPhase("confirm");
        setError(t("errorGeneric"));
        return;
      }
      const body = (await res.json()) as {
        ok: true;
        drive: "deleted" | "missing" | "skipped" | "failed";
        driveUrl?: string;
      };
      if (body.drive === "failed" && body.driveUrl) {
        setDriveUrl(body.driveUrl);
        setPhase("drive_failed");
        return;
      }
      onDeleted?.();
      onClose();
    } catch {
      setPhase("confirm");
      setError(t("errorGeneric"));
    }
  }

  function handleDriveFailedDone() {
    onDeleted?.();
    onClose();
  }

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.15 }}
        className="fixed inset-0 z-[100] flex items-end justify-center bg-black/60 p-0 backdrop-blur-sm sm:items-center sm:p-4"
        onClick={(e) => {
          if (e.target === e.currentTarget && phase !== "submitting") onClose();
        }}
      >
        <motion.div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          initial={{ y: 20, opacity: 0, scale: 0.98 }}
          animate={{ y: 0, opacity: 1, scale: 1 }}
          exit={{ y: 20, opacity: 0, scale: 0.98 }}
          transition={{ duration: 0.2, ease: [0.32, 0.72, 0, 1] }}
          className="flex w-full max-h-[90vh] max-w-md flex-col overflow-hidden rounded-t-2xl bg-surface shadow-2xl sm:rounded-2xl"
        >
          <div className="flex flex-shrink-0 items-center justify-between border-b border-background/40 p-6 pb-4">
            <h2
              id={titleId}
              className="text-lg font-semibold text-text-primary"
            >
              {phase === "drive_failed" ? t("successTitle") : t("title")}
            </h2>
            <button
              type="button"
              onClick={onClose}
              disabled={phase === "submitting"}
              aria-label="Close"
              className="flex h-8 w-8 items-center justify-center rounded-full text-text-muted transition-colors hover:bg-surface-hover hover:text-text-primary cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <X size={16} />
            </button>
          </div>

          <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-6">
            {phase !== "drive_failed" && (
              <>
                <p className="text-sm text-text-muted">{t("body")}</p>
                <div className="rounded-lg bg-background p-4">
                  <p className="text-sm font-medium text-text-primary">
                    {dateLabel}
                    {ownerName ? ` · ${ownerName}` : ""}
                  </p>
                  <p className="mt-1 text-sm text-text-muted">
                    <bdi>{formatCurrency(totalSavings, fullLocale)}</bdi>
                  </p>
                </div>
                {error && (
                  <p className="text-sm text-loss" role="alert">
                    {error}
                  </p>
                )}
              </>
            )}

            {phase === "drive_failed" && driveUrl && (
              <>
                <p className="text-sm text-text-muted">{t("driveFailedBody")}</p>
                <a
                  href={driveUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 rounded-lg bg-background px-3 py-2 text-sm font-medium text-text-primary hover:bg-surface-hover"
                >
                  <ExternalLink size={14} />
                  {t("openInDrive")}
                </a>
              </>
            )}
          </div>

          <div className="flex flex-shrink-0 items-center justify-end gap-2 border-t border-background/40 p-6 pt-4">
            {phase === "drive_failed" ? (
              <Button type="button" variant="primary" onClick={handleDriveFailedDone}>
                {t("done")}
              </Button>
            ) : (
              <>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={onClose}
                  disabled={phase === "submitting"}
                >
                  {t("cancel")}
                </Button>
                <Button
                  type="button"
                  variant="danger"
                  onClick={handleConfirm}
                  disabled={phase === "submitting"}
                >
                  {phase === "submitting" ? t("submitting") : t("confirm")}
                </Button>
              </>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
