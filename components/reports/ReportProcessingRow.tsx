"use client";

// =============================================================================
// PensionView — Report processing row (in-flight reports)
//
// Renders one row in the reports list that represents a report still being
// processed by the WDK pipeline (or that has failed). Polling has been
// consolidated into ProcessingReportsProvider — this component is now a
// presentational consumer that reads per-row state via useProcessingReport().
//
// Retry button logic and its setTimeout cleanup remain local since they are
// per-row interactions that don't belong in the shared polling context.
// =============================================================================

import { useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Loader2, AlertCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useProcessingReport } from "./ProcessingReportsProvider";

type StepKey =
  | "download"
  | "decrypt"
  | "resolve_drive_folder"
  | "upload_drive"
  | "extract_page"
  | "validate"
  | "generate_insight"
  | "complete";

const STEP_KEYS: ReadonlySet<StepKey> = new Set<StepKey>([
  "download",
  "decrypt",
  "resolve_drive_folder",
  "upload_drive",
  "extract_page",
  "validate",
  "generate_insight",
  "complete",
]);

function isStepKey(value: string | null | undefined): value is StepKey {
  return !!value && STEP_KEYS.has(value as StepKey);
}

interface ReportProcessingRowReport {
  id: string;
  status: string;
  current_step: string | null;
  current_step_detail: Record<string, unknown> | null;
  report_date: string | null;
  created_at: string;
}

interface ReportProcessingRowProps {
  report: ReportProcessingRowReport;
}

interface PollState {
  status: string;
  current_step: string | null;
  current_step_detail: Record<string, unknown> | null;
  report_date: string | null;
}

export function ReportProcessingRow({ report }: ReportProcessingRowProps) {
  const t = useTranslations("reports.processing");
  const tSteps = useTranslations("reports.processing.steps");
  const locale = useLocale();
  const fullLocale = locale === "he" ? "he-IL" : "en-IL";

  // Read the latest poll state from the shared provider. Fall back to the
  // server-rendered row props on the first render (before the first tick).
  // report_date is included so the row reflects the date the moment the
  // pipeline writes it (extract step on the cover page, or validate as a
  // backstop) — without waiting for a full page refresh.
  const polled = useProcessingReport(report.id);
  const state: PollState = polled ?? {
    status: report.status,
    current_step: report.current_step,
    current_step_detail: report.current_step_detail,
    report_date: report.report_date,
  };

  // Retry state — local only, not part of the shared polling context.
  const [isRetrying, setIsRetrying] = useState(false);
  const [retryError, setRetryError] = useState<string | null>(null);
  const retryTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Clean up any pending retry timeout on unmount.
  useEffect(() => {
    return () => {
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
        retryTimeoutRef.current = null;
      }
    };
  }, []);

  async function handleRetry() {
    setIsRetrying(true);
    setRetryError(null);
    try {
      const res = await fetch(`/api/reports/${report.id}/retry`, {
        method: "POST",
      });
      if (!res.ok) {
        setIsRetrying(false);
        setRetryError("Retry failed");
        return;
      }
      // After 1s clear the optimistic "Retrying..." label; the shared provider
      // will pick up the status change on the next poll tick.
      retryTimeoutRef.current = setTimeout(() => {
        retryTimeoutRef.current = null;
        setIsRetrying(false);
      }, 1000);
    } catch {
      setIsRetrying(false);
      setRetryError("Retry failed");
    }
  }

  // Date may be null until the extract/validate step pulls it from the PDF
  // cover. We read it from the polled state so it updates live, falling back
  // to the server-rendered prop only on the first render.
  const dateLabel = state.report_date
    ? new Date(state.report_date).toLocaleDateString(fullLocale, {
        month: "long",
        year: "numeric",
      })
    : t("date_pending");

  const isFailed = state.status === "failed";

  return (
    <div
      className="group flex items-center gap-2 rounded-lg bg-surface"
      aria-busy={!isFailed}
      aria-live="polite"
    >
      <div className="flex flex-1 items-center justify-between gap-3 p-4">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-text-primary">{dateLabel}</p>
          <p className="mt-0.5 truncate text-xs text-text-muted">
            {isFailed
              ? isRetrying
                ? t("retrying")
                : retryError
                  ? t("failed_with_reason", { reason: retryError })
                  : renderFailureMessage(state, t)
              : renderStepLabel(state, t, tSteps)}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2 text-text-muted">
          {isFailed ? (
            <>
              <AlertCircle size={16} className="text-loss" />
              <Button
                variant="secondary"
                size="sm"
                onClick={handleRetry}
                disabled={isRetrying}
                aria-label={t("retry")}
              >
                <RefreshCw size={12} className={isRetrying ? "animate-spin" : ""} />
                <span className="ms-1">{t("retry")}</span>
              </Button>
            </>
          ) : (
            <Loader2 size={16} className="animate-spin" />
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Label helpers
// ---------------------------------------------------------------------------

type StepTranslator = ReturnType<typeof useTranslations<"reports.processing.steps">>;
type RootTranslator = ReturnType<typeof useTranslations<"reports.processing">>;

function renderStepLabel(
  state: PollState,
  t: RootTranslator,
  tSteps: StepTranslator
): string {
  const step = state.current_step;
  if (!isStepKey(step)) {
    return t("polling");
  }

  if (step === "extract_page") {
    const detail = state.current_step_detail ?? {};
    const page = typeof detail.page === "number" ? detail.page : 0;
    const total =
      typeof detail.total_pages === "number" ? detail.total_pages : 0;
    return tSteps("extract_page", { page, total });
  }

  return tSteps(step);
}

function renderFailureMessage(state: PollState, t: RootTranslator): string {
  const detail = state.current_step_detail ?? {};
  const reasonRaw =
    typeof detail.failure_reason === "string" ? detail.failure_reason : null;
  if (!reasonRaw) return t("failed_default");

  const MAX = 120;
  const reason =
    reasonRaw.length > MAX ? `${reasonRaw.slice(0, MAX - 1)}…` : reasonRaw;
  return t("failed_with_reason", { reason });
}
