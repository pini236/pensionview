"use client";

// =============================================================================
// PensionView — ReportUploadModal
//
// Inline upload UX surfaced on the reports list page (and from empty state /
// drag-anywhere overlay). Reuses useReportUpload for the actual POSTs, so
// behaviour is identical to /admin/backfill aside from the post-upload flow:
// here we *don't* redirect — the ProcessingReportsProvider polling on the
// underlying reports page picks up the new in-flight rows automatically.
//
// Auto-close happens 1s after every file has settled (success or error).
// =============================================================================

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { useTranslations } from "next-intl";
import { motion, AnimatePresence } from "motion/react";
import {
  CheckCircle,
  Circle,
  Loader2,
  UploadCloud,
  User,
  Calendar,
  X,
  XCircle,
} from "lucide-react";
import {
  useReportUpload,
  type UploadStatus,
} from "@/lib/hooks/use-report-upload";

interface Profile {
  id: string;
  name: string | null;
  email?: string;
}

export interface ReportUploadModalProps {
  /** Profiles to show in the picker. */
  profiles: Profile[];
  /** When set, picker is hidden and the file is uploaded against this id. */
  defaultProfileId?: string | null;
  /** Files to seed the dropzone with (e.g. dropped on the page). */
  initialFiles?: File[];
  onClose: () => void;
}

const AUTO_CLOSE_MS = 1000;

export function ReportUploadModal({
  profiles,
  defaultProfileId,
  initialFiles,
  onClose,
}: ReportUploadModalProps) {
  const t = useTranslations("reports.upload");
  const titleId = useId();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // If only one profile exists in the household, auto-select it so the user
  // doesn't have to confirm "yes I want to upload to my one and only profile".
  const initialProfileId = useMemo(() => {
    if (defaultProfileId) return defaultProfileId;
    if (profiles.length === 1) return profiles[0]!.id;
    return "";
  }, [defaultProfileId, profiles]);

  const [profileId, setProfileId] = useState(initialProfileId);
  const [files, setFiles] = useState<File[]>(initialFiles ?? []);
  const [reportDate, setReportDate] = useState("");
  const [isDragging, setIsDragging] = useState(false);

  const autoCloseRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);

  const { upload, isUploading, results } = useReportUpload({
    successMessage: t("processing_started"),
    fallbackErrorMessage: t("error"),
    onComplete: () => {
      // Auto-close after a beat so users can register the success ticks.
      // Polling on the underlying reports page surfaces the in-flight rows.
      autoCloseRef.current = setTimeout(() => {
        closeRef.current();
      }, AUTO_CLOSE_MS);
    },
  });

  // Esc to close (block while uploading so we don't lose progress UI mid-run).
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && !isUploading) onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [isUploading, onClose]);

  // Lock body scroll while open.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  // Cancel any pending auto-close on unmount.
  useEffect(() => {
    return () => {
      if (autoCloseRef.current) {
        clearTimeout(autoCloseRef.current);
        autoCloseRef.current = null;
      }
    };
  }, []);

  const addFiles = useCallback((newFiles: File[]) => {
    const pdfs = newFiles.filter(
      (f) => f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf"),
    );
    setFiles((prev) => {
      const existing = new Set(prev.map((f) => f.name + f.size));
      const filtered = pdfs.filter((f) => !existing.has(f.name + f.size));
      return [...prev, ...filtered];
    });
  }, []);

  function onFileInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(e.target.files || []);
    addFiles(selected);
    e.target.value = "";
  }

  function onDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    const dropped = Array.from(e.dataTransfer.files || []);
    addFiles(dropped);
  }

  function onDragOver(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }

  function onDragLeave(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }

  function openPicker() {
    fileInputRef.current?.click();
  }

  async function handleUpload() {
    if (!profileId || files.length === 0) return;
    await upload({
      files,
      profileId,
      reportDate: reportDate || undefined,
    });
  }

  const submitLabel = isUploading
    ? t("uploading")
    : files.length === 1
      ? t("submit_one")
      : t("submit_many", { count: files.length });

  const dropzoneClasses = [
    "relative flex flex-col items-center justify-center rounded-2xl border-2 border-dashed p-8 text-center transition-colors cursor-pointer",
    isDragging
      ? "border-cta bg-cta/10"
      : "border-surface-hover hover:border-cta hover:bg-surface/50",
  ].join(" ");

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.15 }}
        className="fixed inset-0 z-[100] flex items-end justify-center bg-black/60 p-0 backdrop-blur-sm sm:items-center sm:p-4"
        onClick={(e) => {
          if (e.target === e.currentTarget && !isUploading) onClose();
        }}
      >
        <motion.div
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          initial={{ y: 20, opacity: 0, scale: 0.98 }}
          animate={{ y: 0, opacity: 1, scale: 1 }}
          exit={{ y: 20, opacity: 0, scale: 0.98 }}
          transition={{ duration: 0.2, ease: [0.32, 0.72, 0, 1] }}
          className="flex w-full max-h-[90vh] max-w-xl flex-col overflow-hidden rounded-t-2xl bg-surface shadow-2xl sm:rounded-2xl"
        >
          <div className="flex flex-shrink-0 items-center justify-between border-b border-background/40 p-6 pb-4">
            <h2
              id={titleId}
              className="text-lg font-semibold text-text-primary"
            >
              {t("modal_title")}
            </h2>
            <button
              type="button"
              onClick={onClose}
              disabled={isUploading}
              aria-label={t("close")}
              className="flex h-8 w-8 items-center justify-center rounded-full text-text-muted transition-colors hover:bg-surface-hover hover:text-text-primary cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <X size={16} />
            </button>
          </div>

          <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-6">
            {profiles.length > 1 && !defaultProfileId && (
              <section className="space-y-2">
                <div className="flex items-center gap-2 text-sm font-medium text-text-primary">
                  <User size={16} className="text-text-muted" />
                  {t("choose_profile")}
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  {profiles.map((p) => {
                    const selected = p.id === profileId;
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => setProfileId(p.id)}
                        className={[
                          "flex flex-col items-start gap-0.5 rounded-lg border p-3 text-start transition-colors cursor-pointer",
                          selected
                            ? "border-cta bg-cta/10"
                            : "border-surface-hover bg-background hover:border-cta/50",
                        ].join(" ")}
                      >
                        <span className="text-sm font-medium text-text-primary">
                          {p.name || "—"}
                        </span>
                        {p.email && (
                          <span className="text-xs text-text-muted">
                            {p.email}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </section>
            )}

            <section className="space-y-2">
              <label
                htmlFor="upload-report-date"
                className="flex items-center gap-2 text-sm font-medium text-text-primary"
              >
                <Calendar size={16} className="text-text-muted" />
                {t("report_date_label")}
              </label>
              <input
                id="upload-report-date"
                type="date"
                value={reportDate}
                onChange={(e) => setReportDate(e.target.value)}
                className="w-full rounded-lg border border-surface-hover bg-background p-2 text-sm text-text-primary"
              />
              <p className="text-xs text-text-muted">{t("report_date_hint")}</p>
            </section>

            <section>
              <div
                role="button"
                tabIndex={0}
                onClick={openPicker}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    openPicker();
                  }
                }}
                onDrop={onDrop}
                onDragOver={onDragOver}
                onDragEnter={onDragOver}
                onDragLeave={onDragLeave}
                className={dropzoneClasses}
                aria-label={t("dropzone_hint")}
              >
                <UploadCloud size={36} className="text-text-muted" />
                <p className="mt-3 text-sm font-medium text-text-primary">
                  {isDragging ? t("dropzone_drag_active") : t("dropzone_hint")}
                </p>
                {files.length > 0 && (
                  <p className="mt-2 text-xs text-text-muted">
                    {files.length === 1
                      ? files[0]!.name
                      : `${files.length} files`}
                  </p>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept=".pdf,application/pdf"
                  onChange={onFileInputChange}
                  className="hidden"
                />
              </div>
            </section>

            {results.length > 0 && (
              <section className="space-y-2">
                <AnimatePresence initial={false}>
                  {results.map((r, i) => (
                    <motion.div
                      key={`${r.fileName}-${i}`}
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.2, delay: i * 0.03 }}
                      className="flex items-center gap-3 rounded-lg bg-background p-3"
                    >
                      <StatusIcon status={r.status} />
                      <span className="flex-1 truncate text-sm text-text-primary">
                        {r.fileName}
                      </span>
                      {r.message && (
                        <span
                          className={[
                            "text-xs",
                            r.status === "error"
                              ? "text-loss"
                              : "text-text-muted",
                          ].join(" ")}
                        >
                          {r.message}
                        </span>
                      )}
                    </motion.div>
                  ))}
                </AnimatePresence>
              </section>
            )}
          </div>

          <div className="flex flex-shrink-0 items-center justify-end gap-2 border-t border-background/40 p-6 pt-4">
            <button
              type="button"
              onClick={handleUpload}
              disabled={isUploading || !profileId || files.length === 0}
              className="cursor-pointer rounded-lg bg-cta px-6 py-3 text-sm font-medium text-background transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitLabel}
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

function StatusIcon({ status }: { status: UploadStatus }) {
  if (status === "processing") {
    return <Loader2 size={18} className="animate-spin text-cta" />;
  }
  if (status === "done") {
    return <CheckCircle size={18} className="text-gain" />;
  }
  if (status === "error") {
    return <XCircle size={18} className="text-loss" />;
  }
  return <Circle size={18} className="text-text-muted" />;
}
