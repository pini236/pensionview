"use client";

// =============================================================================
// PensionView — EditReportDateDialog
//
// Lets the user fix a report's date after processing — either because the PDF
// extractor left it null, or because the extracted date was wrong. Submits to
// PATCH /api/reports/[id] and surfaces the duplicate-date conflict (HTTP 409)
// inline so the user knows there's already a report at the picked date.
// =============================================================================

import { useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { motion, AnimatePresence } from "motion/react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/Button";

interface EditReportDateDialogProps {
  reportId: string;
  initialDate: string | null;
  onClose: () => void;
}

export function EditReportDateDialog({
  reportId,
  initialDate,
  onClose,
}: EditReportDateDialogProps) {
  const t = useTranslations("reports.editDate");
  const titleId = useId();
  const router = useRouter();
  const dialogRef = useRef<HTMLDivElement | null>(null);

  const [value, setValue] = useState(initialDate ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && !submitting) onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose, submitting]);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  async function handleSubmit() {
    if (!value) {
      setError(t("error_required"));
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/reports/${reportId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ report_date: value }),
      });
      if (res.status === 409) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setError(body.error ?? t("error_duplicate"));
        setSubmitting(false);
        return;
      }
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setError(body.error ?? t("error_generic"));
        setSubmitting(false);
        return;
      }
      onClose();
      router.refresh();
    } catch {
      setError(t("error_generic"));
      setSubmitting(false);
    }
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
          if (e.target === e.currentTarget && !submitting) onClose();
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
            <h2 id={titleId} className="text-lg font-semibold text-text-primary">
              {t("title")}
            </h2>
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              aria-label={t("close")}
              className="flex h-8 w-8 items-center justify-center rounded-full text-text-muted transition-colors hover:bg-surface-hover hover:text-text-primary cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <X size={16} />
            </button>
          </div>

          <div className="flex flex-1 flex-col gap-3 overflow-y-auto p-6">
            <p className="text-sm text-text-muted">{t("body")}</p>
            <input
              type="date"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              disabled={submitting}
              className="w-full rounded-lg border border-surface-hover bg-background p-2 text-sm text-text-primary"
            />
            {error && (
              <p className="text-sm text-loss" role="alert">
                {error}
              </p>
            )}
          </div>

          <div className="flex flex-shrink-0 items-center justify-end gap-2 border-t border-background/40 p-6 pt-4">
            <Button
              type="button"
              variant="ghost"
              onClick={onClose}
              disabled={submitting}
            >
              {t("cancel")}
            </Button>
            <Button
              type="button"
              variant="primary"
              onClick={handleSubmit}
              disabled={submitting || !value}
            >
              {submitting ? t("submitting") : t("save")}
            </Button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
