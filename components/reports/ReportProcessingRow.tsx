"use client";

// =============================================================================
// PensionView — Report processing row (in-flight reports)
//
// Renders one row in the reports list that represents a report still being
// processed by the WDK pipeline (or that has failed). For "processing" rows
// we poll /api/reports/[id] every 3s and refresh the parent server component
// once the row transitions to "done", so the row re-renders as a normal
// completed report on the next pass.
//
// Step labels come from i18n (`reports.processing.steps.*`) and `extract_page`
// is parameterized with the page / total_pages we read from
// current_step_detail. Failed rows show the failure_reason if the pipeline
// recorded one (set by lib/workflow/pipeline.ts on the catch path).
// =============================================================================

import { useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { Loader2, AlertCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/Button";

const POLL_INTERVAL_MS = 3000;

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
  report_date: string;
  created_at: string;
}

interface ReportProcessingRowProps {
  report: ReportProcessingRowReport;
}

interface PollState {
  status: string;
  current_step: string | null;
  current_step_detail: Record<string, unknown> | null;
}

export function ReportProcessingRow({ report }: ReportProcessingRowProps) {
  const t = useTranslations("reports.processing");
  const tSteps = useTranslations("reports.processing.steps");
  const router = useRouter();
  const locale = useLocale();
  const fullLocale = locale === "he" ? "he-IL" : "en-IL";

  // Latest known status — seeded from the server-rendered row, refreshed by
  // polling. We never start with a "done" row here (the parent only renders
  // this component for processing/failed reports), but we still treat "done"
  // as a terminal transition since that's the whole point of polling.
  const [state, setState] = useState<PollState>({
    status: report.status,
    current_step: report.current_step,
    current_step_detail: report.current_step_detail,
  });

  const [isRetrying, setIsRetrying] = useState(false);

  // Refs so the polling effect can read the latest values without resubscribing
  // every time `state` changes (which would otherwise reset the interval).
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    // Failed rows never poll — there is nothing left to learn.
    if (state.status !== "processing") {
      return;
    }

    let cancelled = false;

    async function pollOnce() {
      try {
        const res = await fetch(`/api/reports/${report.id}`, {
          cache: "no-store",
        });
        if (!res.ok) return;
        const body = (await res.json()) as {
          status: string;
          current_step: string | null;
          current_step_detail: Record<string, unknown> | null;
        };
        if (cancelled) return;

        const prev = stateRef.current;
        if (
          body.status !== prev.status ||
          body.current_step !== prev.current_step ||
          JSON.stringify(body.current_step_detail) !==
            JSON.stringify(prev.current_step_detail)
        ) {
          setState({
            status: body.status,
            current_step: body.current_step,
            current_step_detail: body.current_step_detail,
          });
        }

        if (body.status === "done") {
          // Server component will re-render this report as a completed row.
          router.refresh();
        }
      } catch {
        // Transient network errors are expected on a long-poll loop — swallow
        // and let the next tick try again.
      }
    }

    const interval = setInterval(pollOnce, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [report.id, router, state.status]);

  async function handleRetry() {
    setIsRetrying(true);
    try {
      await fetch(`/api/reports/${report.id}/retry`, { method: "POST" });
      // Optimistic: show "Retrying..." briefly, then let polling pick up the
      // status change (processing → done/failed). After 1s flip state so the
      // polling effect re-activates on the updated status.
      setTimeout(() => {
        setState((prev) => ({ ...prev, status: "processing" }));
        setIsRetrying(false);
      }, 1000);
    } catch {
      setIsRetrying(false);
    }
  }

  const dateLabel = new Date(report.report_date).toLocaleDateString(
    fullLocale,
    { month: "long", year: "numeric" }
  );

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
    // No step recorded yet (workflow hasn't ticked) — generic placeholder.
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

  // Long stack-trace-like reasons are useless in a list row — keep it short.
  const MAX = 120;
  const reason =
    reasonRaw.length > MAX ? `${reasonRaw.slice(0, MAX - 1)}…` : reasonRaw;
  return t("failed_with_reason", { reason });
}
